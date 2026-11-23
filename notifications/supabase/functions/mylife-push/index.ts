// Programme en ligne des rappels My Life (fonction Supabase « mylife-push »).
// - L'appli lui envoie la liste des prochains rappels de ce téléphone (action « sync »).
// - La base l'appelle toutes les minutes (pg_cron, action « cron ») : il envoie les rappels
//   arrivés à l'heure, même quand l'appli est fermée.
// Tout tient dans ce fichier pour pouvoir aussi le coller tel quel dans l'éditeur de Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_REMINDERS = 500;
// Un rappel en retard de plus de 30 min (programme arrêté, téléphone injoignable…) n'est plus envoyé
const LATE_LIMIT_MS = 30 * 60 * 1000;

async function systemGet(k: string) {
  const { data, error } = await sb.from('mylife_system').select('v').eq('k', k).maybeSingle();
  if (error) throw error;
  return data?.v ?? null;
}
async function systemSet(k: string, v: unknown) {
  const { error } = await sb.from('mylife_system').upsert({ k, v });
  if (error) throw error;
}

// Clés des notifications : créées une seule fois et gardées dans la base (jamais dans le code).
let vapidCache: CryptoKeyPair | null = null;
async function vapidKeys() {
  if (vapidCache) return vapidCache;
  let exported = await systemGet('vapid');
  if (!exported) {
    const keys = await webpush.generateVapidKeys({ extractable: true });
    exported = await webpush.exportVapidKeys(keys);
    await systemSet('vapid', exported);
  }
  vapidCache = await webpush.importVapidKeys(exported, { extractable: false });
  return vapidCache;
}
let serverCache: webpush.ApplicationServer | null = null;
async function appServer() {
  if (!serverCache) {
    serverCache = await webpush.ApplicationServer.new({
      contactInformation: 'https://mailysdej-cmyk.github.io/my-life-app/',
      vapidKeys: await vapidKeys(),
    });
  }
  return serverCache;
}

// Un téléphone est reconnu par l'adresse de son abonnement aux notifications (jamais affichée).
async function deviceId(endpoint: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validSubscription(s: any) {
  return s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') && s.endpoint.length < 1000
    && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}

// Envoie une notification ; renvoie false si le téléphone n'existe plus (abonnement à oublier).
async function send(subscription: any, payload: Record<string, unknown>) {
  try {
    const server = await appServer();
    await server.subscribe(subscription).pushTextMessage(JSON.stringify(payload), { ttl: 3600, urgency: webpush.Urgency.High });
    return true;
  } catch (e) {
    const status = (e as any)?.response?.status;
    console.error('push', status, String(e));
    if (status === 404 || status === 410) return false;
    return true;
  }
}

async function forgetDevice(id: string) {
  await sb.from('mylife_devices').delete().eq('id', id);
}

async function sync(body: any) {
  if (!validSubscription(body.subscription)) return json({ error: 'Abonnement aux notifications invalide.' }, 400);
  const list = Array.isArray(body.reminders) ? body.reminders.slice(0, MAX_REMINDERS) : [];
  const id = await deviceId(body.subscription.endpoint);
  const now = Date.now();
  const rows = [];
  for (const r of list) {
    const at = Date.parse(r?.at);
    if (!r || typeof r.key !== 'string' || !Number.isFinite(at) || at < now - LATE_LIMIT_MS) continue;
    rows.push({
      device_id: id,
      key: r.key.slice(0, 120),
      fire_at: new Date(at).toISOString(),
      title: String(r.title || 'My Life').slice(0, 120),
      body: String(r.body || '').slice(0, 200),
      sent: false,
    });
  }
  let res = await sb.from('mylife_devices').upsert({ id, subscription: body.subscription, updated_at: new Date().toISOString() });
  if (res.error) throw res.error;
  // On remplace les rappels pas encore envoyés ; ceux déjà envoyés restent pour ne jamais les renvoyer.
  res = await sb.from('mylife_reminders').delete().eq('device_id', id).eq('sent', false);
  if (res.error) throw res.error;
  res = await sb.from('mylife_reminders').delete().eq('device_id', id).lt('fire_at', new Date(now - 3 * 86400000).toISOString());
  if (res.error) throw res.error;
  if (rows.length) {
    res = await sb.from('mylife_reminders').upsert(rows, { onConflict: 'device_id,key', ignoreDuplicates: true });
    if (res.error) throw res.error;
  }
  return json({ ok: true, count: rows.length });
}

async function cron() {
  const now = Date.now();
  const { data, error } = await sb.from('mylife_reminders')
    .select('device_id,key,fire_at,title,body,mylife_devices(subscription)')
    .eq('sent', false).lte('fire_at', new Date(now).toISOString())
    .order('fire_at').limit(200);
  if (error) throw error;
  let sent = 0; let skipped = 0;
  const gone = new Set<string>();
  for (const r of data || []) {
    if (gone.has(r.device_id)) continue;
    // Marqué « envoyé » avant l'envoi : un rappel n'est jamais envoyé deux fois.
    const upd = await sb.from('mylife_reminders').update({ sent: true }).match({ device_id: r.device_id, key: r.key, sent: false }).select('key');
    if (upd.error) throw upd.error;
    if (!upd.data?.length) continue;
    if (now - Date.parse(r.fire_at) > LATE_LIMIT_MS) { skipped++; continue; }
    const sub = (r as any).mylife_devices?.subscription;
    if (!sub) continue;
    const ok = await send(sub, { title: r.title, body: r.body, tag: r.key });
    if (ok) sent++; else { gone.add(r.device_id); await forgetDevice(r.device_id); }
  }
  return json({ ok: true, sent, skipped });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'cron';

    if (action === 'vapid') return json({ publicKey: await webpush.exportApplicationServerKey(await vapidKeys()) });
    if (action === 'ping') { await systemGet('cron_secret'); return json({ ok: true, at: new Date().toISOString() }); }
    if (action === 'sync') return await sync(body);
    if (action === 'test') {
      if (!validSubscription(body.subscription)) return json({ error: 'Abonnement aux notifications invalide.' }, 400);
      const ok = await send(body.subscription, { title: 'My Life', body: 'Les notifications sont activées : tes rappels arriveront ici.', tag: 'test' });
      return ok ? json({ ok: true }) : json({ error: 'Ce téléphone ne reçoit plus les notifications : réactive-les.' }, 400);
    }
    if (action === 'unsubscribe') {
      if (validSubscription(body.subscription)) await forgetDevice(await deviceId(body.subscription.endpoint));
      return json({ ok: true });
    }
    if (action === 'cron') {
      const secret = await systemGet('cron_secret');
      if (!secret || req.headers.get('x-mylife-cron') !== secret) return json({ error: 'Accès refusé.' }, 403);
      return await cron();
    }
    return json({ error: 'Action inconnue.' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});

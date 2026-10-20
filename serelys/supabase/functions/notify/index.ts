// Programme en ligne de Serelys (fonction Supabase « notify »).
// - appelé toutes les 15 minutes par la base (pg_cron) : résumés, rappels, visios, battement de cœur ;
// - appelé par l'appli : clé publique des notifications, notification de test.
// engine.js, catalog.js et dates.js sont copiés depuis serelys/js au moment du déploiement
// (voir .github/workflows/serelys.yml) : l'appli et ce programme utilisent le même moteur.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { buildNotification, upcomingEvents } from './engine.js';
import { mergeSettings } from './catalog.js';
import { parisNow, weekday } from './dates.js';
import { dueSlots, markSent, dueEvents, markEvents, plusMinutes } from './schedule.js';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function systemGet(k: string) {
  const { data, error } = await sb.from('system').select('v').eq('k', k).maybeSingle();
  if (error) throw error;
  return data?.v ?? null;
}
async function systemSet(k: string, v: unknown) {
  const { error } = await sb.from('system').upsert({ k, v });
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

async function loadItems(userId: string) {
  const rows: { kind: string; id: string; data: any }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('items').select('kind,id,data').eq('user_id', userId).range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const items: Record<string, Record<string, any>> = {};
  for (const r of rows) (items[r.kind] ||= {})[r.id] = r.data;
  const vals = (k: string) => Object.entries(items[k] || {}).map(([id, d]) => ({ ...d, id }));
  return {
    items,
    state: {
      clients: vals('client'), prospects: vals('prospect'), manualTasks: vals('manual'),
      taskState: items.task || {}, invoiceState: items.invoice || {}, settings: items.settings?.main || {},
    },
  };
}

async function putItem(userId: string, kind: string, id: string, data: unknown) {
  const { error } = await sb.from('items').upsert({ user_id: userId, kind, id, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function sendTo(userId: string, items: Record<string, Record<string, any>>, payload: Record<string, unknown>) {
  const subs = Object.entries(items.push || {});
  if (!subs.length) return { sent: 0, failed: 0 };
  const { data: u } = await sb.auth.admin.getUserById(userId);
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: `mailto:${u?.user?.email || 'contact@serelys.invalid'}`,
    vapidKeys: await vapidKeys(),
  });
  let sent = 0; let failed = 0;
  for (const [id, row] of subs) {
    try {
      await appServer.subscribe(row.subscription).pushTextMessage(JSON.stringify(payload), { ttl: 6 * 3600, urgency: webpush.Urgency.High });
      sent++;
    } catch (e) {
      failed++;
      const status = (e as any)?.response?.status;
      if (status === 404 || status === 410) await sb.from('items').delete().match({ user_id: userId, kind: 'push', id });
      console.error('push', status, String(e));
    }
  }
  return { sent, failed };
}

async function runForUser(userId: string, nowDate = new Date()) {
  const { items, state } = await loadItems(userId);
  const p = parisNow(nowDate);
  const now = { date: p.date, time: p.time, weekday: weekday(p.date) };
  const settings = mergeSettings(state.settings);
  let log = items.system?.notiflog || {};
  const report: string[] = [];

  for (const slot of dueSlots(now, settings.notifTimes, log)) {
    const n = buildNotification(state, now.date, slot.kind);
    if (n) { const r = await sendTo(userId, items, { ...n, url: './' }); report.push(`${slot.logKey}: ${r.sent}`); }
    else report.push(`${slot.logKey}: rien à rappeler`);
    log = markSent(log, now, [slot.logKey]);
  }
  const events = upcomingEvents(state, now.date, now.time, plusMinutes(now.time, 61));
  const due = dueEvents(now, events, log);
  for (const e of due) {
    const who = e.client?.name ? ` avec ${e.client.name}` : '';
    await sendTo(userId, items, { title: `Dans 1 h : ${e.time.replace(':', ' h ')}`, body: e.title + (e.title.includes(who) ? '' : who), tag: `event-${e.key}` });
    report.push(`visio ${e.key}`);
  }
  if (due.length) log = markEvents(log, now, due.map((e: any) => e.key));
  await putItem(userId, 'system', 'notiflog', log);
  await putItem(userId, 'system', 'heartbeat', { at: new Date().toISOString(), paris: `${now.date} ${now.time}` });
  return report;
}

async function userFromRequest(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'cron';

    if (action === 'vapid') {
      return json({ publicKey: await webpush.exportApplicationServerKey(await vapidKeys()) });
    }
    if (action === 'ping') {
      await systemGet('cron_secret');
      return json({ ok: true, at: new Date().toISOString() });
    }
    if (action === 'test') {
      const user = await userFromRequest(req);
      if (!user) return json({ error: 'Connexion requise.' }, 401);
      const { items } = await loadItems(user.id);
      const r = await sendTo(user.id, items, { title: 'Serelys', body: 'Ça marche ! Tes notifications sont bien activées.', tag: 'test' });
      if (!r.sent) return json({ error: r.failed ? 'L’envoi a échoué : réactive les notifications sur ce téléphone.' : 'Aucun appareil : active d’abord les notifications.' }, 400);
      return json(r);
    }
    if (action === 'cron') {
      const secret = await systemGet('cron_secret');
      if (!secret || req.headers.get('x-serelys-cron') !== secret) return json({ error: 'Accès refusé.' }, 403);
      const { data, error } = await sb.from('items').select('user_id').eq('kind', 'settings');
      if (error) throw error;
      const out: Record<string, string[]> = {};
      for (const u of new Set(data.map((r: any) => r.user_id))) out[u as string] = await runForUser(u as string);
      return json({ ok: true, out });
    }
    return json({ error: 'Action inconnue.' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});

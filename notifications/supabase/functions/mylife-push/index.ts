// Programme en ligne des rappels My Life (fonction Supabase « mylife-push »).
// - L'appli lui envoie la liste des prochains rappels de ce téléphone (action « sync »).
// - Toutes les minutes (pg_cron, action « cron ») : il envoie les rappels arrivés à l'heure,
//   même quand l'appli est fermée.
// Il parle directement à la base (SUPABASE_DB_URL, fourni par Supabase) et s'installe tout seul
// au premier appel : tables mylife_*, clés des notifications, passage chaque minute.
// Rien n'est partagé avec Serelys.

import postgres from 'npm:postgres@3.4.4';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 20, onnotice: () => {} });
const FUNCTION_URL = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '') + '/functions/v1/mylife-push';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_REMINDERS = 500;
// Un rappel en retard de plus de 30 min (programme arrêté, téléphone injoignable…) n'est plus envoyé
const LATE_LIMIT_MS = 30 * 60 * 1000;

// ── Installation automatique (sans danger si elle se refait) ───────────────────────────────────
let setup: Promise<{ cron: boolean; cronError?: string }> | null = null;
function ensureSetup() {
  if (!setup) setup = install().catch((e) => { setup = null; throw e; });
  return setup;
}
async function install() {
  await sql.unsafe(`
    create table if not exists public.mylife_devices (
      id text primary key,
      subscription jsonb not null,
      updated_at timestamptz not null default now());
    create table if not exists public.mylife_reminders (
      device_id text not null references public.mylife_devices (id) on delete cascade,
      key text not null,
      fire_at timestamptz not null,
      title text not null,
      body text not null default '',
      sent boolean not null default false,
      primary key (device_id, key));
    create index if not exists mylife_reminders_due on public.mylife_reminders (fire_at) where not sent;
    create table if not exists public.mylife_system (k text primary key, v jsonb);
    alter table public.mylife_devices enable row level security;
    alter table public.mylife_reminders enable row level security;
    alter table public.mylife_system enable row level security;
    do $$ begin
      if exists (select 1 from pg_roles where rolname = 'anon') then
        revoke all on public.mylife_devices, public.mylife_reminders, public.mylife_system from anon, authenticated;
      end if;
    end $$;
    insert into public.mylife_system (k, v)
      values ('cron_secret', to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
      on conflict (k) do nothing;
  `);
  // Le passage chaque minute (extensions pg_cron + pg_net de Supabase)
  try {
    const [{ ok }] = await sql`select count(*) = 2 as ok from pg_available_extensions where name in ('pg_cron', 'pg_net')`;
    if (!ok) return { cron: false, cronError: 'pg_cron ou pg_net indisponible' };
    await sql.unsafe('create extension if not exists pg_cron; create extension if not exists pg_net;');
    const [{ secret }] = await sql`select v #>> '{}' as secret from public.mylife_system where k = 'cron_secret'`;
    const command = `select net.http_post(url := ${lit(FUNCTION_URL)}, headers := jsonb_build_object('Content-Type', 'application/json', 'x-mylife-cron', ${lit(secret)}), body := '{"action":"cron"}'::jsonb, timeout_milliseconds := 20000);`;
    const [job] = await sql`select command from cron.job where jobname = 'mylife-push'`;
    if (!job || job.command !== command) {
      await sql`select cron.schedule('mylife-push', '* * * * *', ${command})`;
    }
    const [clean] = await sql`select 1 from cron.job where jobname = 'mylife-cleanup'`;
    if (!clean) await sql`select cron.schedule('mylife-cleanup', '41 3 * * *', 'delete from cron.job_run_details where end_time < now() - interval ''2 days''')`;
    return { cron: true };
  } catch (e) {
    console.error('cron', e);
    return { cron: false, cronError: String((e as any)?.message || e) };
  }
}
const lit = (s: string) => `'${String(s).replace(/'/g, "''")}'`;

async function systemGet(k: string) {
  const [row] = await sql`select v from public.mylife_system where k = ${k}`;
  return row?.v ?? null;
}

// Clés des notifications : créées une seule fois et gardées dans la base (jamais dans le code).
let vapidCache: CryptoKeyPair | null = null;
async function vapidKeys() {
  if (vapidCache) return vapidCache;
  let exported = await systemGet('vapid');
  if (!exported) {
    const keys = await webpush.generateVapidKeys({ extractable: true });
    const fresh = await webpush.exportVapidKeys(keys);
    // Si deux appels créent une clé en même temps, c'est la première enregistrée qui compte.
    await sql`insert into public.mylife_system (k, v) values ('vapid', ${sql.json(fresh as any)}) on conflict (k) do nothing`;
    exported = await systemGet('vapid');
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
  await sql`delete from public.mylife_devices where id = ${id}`;
}

async function sync(body: any) {
  if (!validSubscription(body.subscription)) return json({ error: 'Abonnement aux notifications invalide.' }, 400);
  const list = Array.isArray(body.reminders) ? body.reminders.slice(0, MAX_REMINDERS) : [];
  const id = await deviceId(body.subscription.endpoint);
  const now = Date.now();
  const rows: any[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    const at = Date.parse(r?.at);
    if (!r || typeof r.key !== 'string' || !Number.isFinite(at) || at < now - LATE_LIMIT_MS) continue;
    const key = r.key.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ device_id: id, key, fire_at: new Date(at), title: String(r.title || 'My Life').slice(0, 120), body: String(r.body || '').slice(0, 200) });
  }
  await sql.begin(async (tx: any) => {
    await tx`insert into public.mylife_devices (id, subscription, updated_at) values (${id}, ${tx.json(body.subscription)}, now())
             on conflict (id) do update set subscription = excluded.subscription, updated_at = now()`;
    // On remplace les rappels pas encore envoyés ; ceux déjà envoyés restent pour ne jamais les renvoyer.
    await tx`delete from public.mylife_reminders where device_id = ${id} and (not sent or fire_at < now() - interval '3 days')`;
    if (rows.length) {
      await tx`insert into public.mylife_reminders ${tx(rows, 'device_id', 'key', 'fire_at', 'title', 'body')} on conflict (device_id, key) do nothing`;
    }
  });
  return json({ ok: true, count: rows.length });
}

async function cron() {
  // Marqués « envoyés » d'un seul coup avant l'envoi : un rappel n'est jamais envoyé deux fois,
  // même si deux passages se chevauchent.
  const due = await sql`
    update public.mylife_reminders r set sent = true
    from public.mylife_devices d
    where r.device_id = d.id and (r.device_id, r.key) in (
      select device_id, key from public.mylife_reminders
      where not sent and fire_at <= now() order by fire_at limit 200 for update skip locked)
    returning r.device_id, r.key, r.fire_at, r.title, r.body, d.subscription`;
  let sent = 0; let skipped = 0;
  const gone = new Set<string>();
  for (const r of due) {
    if (gone.has(r.device_id)) continue;
    if (Date.now() - new Date(r.fire_at).getTime() > LATE_LIMIT_MS) { skipped++; continue; }
    const ok = await send(r.subscription, { title: r.title, body: r.body, tag: r.key });
    if (ok) sent++; else { gone.add(r.device_id); await forgetDevice(r.device_id); }
  }
  return json({ ok: true, sent, skipped });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'cron';
    const state = await ensureSetup();

    if (action === 'vapid') return json({ publicKey: await webpush.exportApplicationServerKey(await vapidKeys()) });
    if (action === 'ping') return json({ ok: true, at: new Date().toISOString(), ...state });
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

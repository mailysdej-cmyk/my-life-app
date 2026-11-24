-- ============================================================================
-- My Life : installation des rappels (à coller une seule fois dans
-- Supabase › SQL Editor › New query › Run). Sans danger si on le relance.
-- Tables et programme propres à My Life (préfixe mylife_) : rien de Serelys n'est touché.
-- ============================================================================

-- 1. Les téléphones qui reçoivent les rappels, et les rappels à venir
create table if not exists public.mylife_devices (
  id text primary key,
  subscription jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.mylife_reminders (
  device_id text not null references public.mylife_devices (id) on delete cascade,
  key text not null,
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  sent boolean not null default false,
  primary key (device_id, key)
);
create index if not exists mylife_reminders_due on public.mylife_reminders (fire_at) where not sent;

-- 2. Réglages internes (clés des notifications…)
create table if not exists public.mylife_system (k text primary key, v jsonb);

-- Rien n'est lisible ni modifiable depuis l'extérieur : seul le programme y a accès.
alter table public.mylife_devices enable row level security;
alter table public.mylife_reminders enable row level security;
alter table public.mylife_system enable row level security;
revoke all on public.mylife_devices, public.mylife_reminders, public.mylife_system from anon, authenticated;
-- Le programme (rôle service_role) doit, lui, pouvoir lire et écrire
grant select, insert, update, delete on public.mylife_devices, public.mylife_reminders, public.mylife_system to service_role;

insert into public.mylife_system (k, v)
values ('cron_secret', to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
on conflict (k) do nothing;

-- 3. Le programme qui passe toutes les minutes pour envoyer les rappels arrivés à l'heure
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname in ('mylife-push', 'mylife-cleanup');

select cron.schedule('mylife-push', '* * * * *', $job$
  select net.http_post(
    url := 'https://hvmfcvjkzgsojijqdqtq.supabase.co/functions/v1/mylife-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-mylife-cron', (select v #>> '{}' from public.mylife_system where k = 'cron_secret')),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 20000);
$job$);

-- Ménage du journal du programme (garde 2 jours)
select cron.schedule('mylife-cleanup', '41 3 * * *', $job$
  delete from cron.job_run_details where end_time < now() - interval '2 days';
$job$);

-- 4. Demander à Supabase de voir tout de suite les nouvelles tables
notify pgrst, 'reload schema';

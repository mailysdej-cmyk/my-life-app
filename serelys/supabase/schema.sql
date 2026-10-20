-- ============================================================================
-- Serelys : installation de la base (à coller une seule fois dans
-- Supabase › SQL Editor › New query › Run). Sans danger si on le relance.
-- Aucune donnée personnelle ici : seulement la structure et la sécurité.
-- Remplacer ADRESSE_DU_PROJET par l'adresse du projet (ex. https://abcd.supabase.co).
-- ============================================================================

-- 1. Mes données : une seule table, chaque ligne appartient à mon compte
create table if not exists public.items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
alter table public.items enable row level security;
grant select, insert, update, delete on public.items to authenticated;
revoke all on public.items from anon;

-- Accès réservé à la propriétaire des lignes ; si la double authentification est
-- activée, l'accès exige aussi le code (niveau aal2).
drop policy if exists serelys_own on public.items;
create policy serelys_own on public.items for all to authenticated
  using (
    user_id = (select auth.uid())
    and ((select auth.jwt() ->> 'aal') = 'aal2'
         or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'))
  )
  with check (
    user_id = (select auth.uid())
    and ((select auth.jwt() ->> 'aal') = 'aal2'
         or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'))
  );

-- 2. Réglages internes du programme (clés des notifications…) : inaccessibles depuis l'appli
create table if not exists public.system (k text primary key, v jsonb);
alter table public.system enable row level security;
revoke all on public.system from anon, authenticated;

insert into public.system (k, v)
values ('cron_secret', to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
on conflict (k) do nothing;

-- 3. Le programme qui tourne toutes les 15 minutes (notifications + maintien en éveil)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname in ('serelys-notify', 'serelys-cleanup');

select cron.schedule('serelys-notify', '*/15 * * * *', $job$
  select net.http_post(
    url := 'ADRESSE_DU_PROJET/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-serelys-cron', (select v #>> '{}' from public.system where k = 'cron_secret')),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 20000);
$job$);

-- Ménage du journal du programme (garde 3 jours)
select cron.schedule('serelys-cleanup', '23 3 * * *', $job$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
$job$);

-- 4. Demander à Supabase de voir tout de suite les nouvelles tables
notify pgrst, 'reload schema';

-- ============================================================
-- IziCut — Schéma de base de données (Supabase / PostgreSQL)
-- ------------------------------------------------------------
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- IDEMPOTENT : rejouable sans perte de données.
--
-- Principes structurants :
--   1. Auth  : Supabase Auth (GoTrue). profiles.id = auth.users.id.
--   2. RLS   : activée PARTOUT. Le client (clé anon) ne lit QUE ses
--              propres lignes via la politique auth.uid() = user_id.
--   3. Crédits : compte + journal (ledger), débit ATOMIQUE en plpgsql
--              SECURITY DEFINER. Aucun solde lu-puis-écrit côté
--              application : ce serait une course critique.
--   4. Rendu : le worker (service_role, hors Vercel) est le SEUL à
--              écrire les statuts de job et les chemins de fichiers.
--   5. Unité : la SECONDE de vidéo source (video_credits_seconds).
-- ============================================================

create extension if not exists "pgcrypto";

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1. PROFILES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text not null default 'inactive',
  updated_at timestamptz not null default now(),
  -- Solde en SECONDES de vidéo source (1800 s = 30 min offertes, Free)
  video_credits_seconds int not null default 1800 check (video_credits_seconds >= 0),
  created_at timestamptz not null default now()
);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. PROJECTS
-- ============================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  source_type text not null check (source_type in ('upload_gallery', 'external_url')),
  source_url text,
  -- Chemin Storage privé de la source (bucket raw-videos, premier
  -- segment = user_id : exigence de la politique RLS du bucket).
  storage_path text,
  duration_seconds int,
  status text not null default 'draft' check (status in (
    'draft', 'uploading', 'processing_audio', 'transcribing',
    'analyzing', 'completed', 'error')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

create index if not exists projects_user_idx on public.projects (user_id);
create index if not exists projects_status_idx on public.projects (status);

-- ============================================================
-- 3. CLIPS
-- ============================================================

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default '',
  start_time float not null,
  end_time float not null,
  virality_score int check (virality_score between 1 and 100),
  hook_text text,
  summary text,
  transcript_json jsonb,
  style_config jsonb,
  -- Chemin Storage privé du rendu final (bucket clips).
  rendered_storage_path text,
  status text not null default 'suggested' check (status in (
    'suggested', 'queued', 'rendering', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists clips_touch_updated_at on public.clips;
create trigger clips_touch_updated_at
  before update on public.clips
  for each row execute function public.touch_updated_at();

create index if not exists clips_project_idx on public.clips (project_id);
create index if not exists clips_status_idx on public.clips (status);

alter table public.clips
  drop constraint if exists clips_bounds_check;
alter table public.clips
  add constraint clips_bounds_check
  check (start_time >= 0 and end_time > start_time);

-- ============================================================
-- 4. TRANSCRIPTS (un par projet, mis à jour par le worker)
-- ============================================================

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  words jsonb not null, -- [{ word, start, end }, …] secondes absolues
  duration_seconds int,
  language text not null default 'fr',
  created_at timestamptz not null default now()
);

drop policy if exists "seul_own_rows" on public.transcripts;
create policy "seul_own_rows" on public.transcripts
  for all using (
    auth.uid() = (select user_id from public.projects where id = project_id)
  );

alter table public.transcripts enable row level security;

-- ============================================================
-- 5. JOBS (file d'attente du worker)
-- ============================================================

create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  clip_id uuid references public.clips(id) on delete cascade,
  kind text not null check (kind in ('ingest', 'transcribe', 'analyze', 'render')),
  status text not null default 'queued' check (status in (
    'queued', 'processing', 'done', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  progress smallint not null default 0 check (progress between 0 and 100),
  -- Coût réservé sur le solde, remboursé par release_credits si échec.
  cost_seconds int not null default 0 check (cost_seconds >= 0),
  output_path text,
  error text,
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists render_jobs_claim_idx on public.render_jobs (status, created_at)
  where status = 'queued';
create index if not exists render_jobs_project_idx on public.render_jobs (project_id);
create index if not exists render_jobs_clip_idx on public.render_jobs (clip_id);

-- ============================================================
-- 5. CRÉDITS : COMPTE + JOURNAL (ledger)
-- ============================================================

create table if not exists public.credit_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_seconds int not null default 0 check (balance_seconds >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Idempotence webhook : un event Stripe ne se journalise qu'une fois.
  stripe_event_id text unique,
  delta_seconds int not null,
  reason text not null,
  job_id uuid references public.render_jobs(id) on delete set null,
  balance_after int not null,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at);

-- Le compte miroir est créé en même temps que le profil.
create or replace function public.handle_new_profile_credits()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.credit_accounts (user_id, balance_seconds)
  values (new.id, new.video_credits_seconds)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created_credits on public.profiles;
create trigger on_profile_created_credits
  after insert on public.profiles
  for each row execute function public.handle_new_profile_credits();

-- Vue de contrôle : le solde doit toujours égaler la somme du journal.
create or replace view public.credit_balances as
select
  a.user_id,
  a.balance_seconds,
  coalesce(sum(l.delta_seconds), 0) as ledger_sum
from public.credit_accounts a
left join public.credit_ledger l on l.user_id = a.user_id
group by a.user_id, a.balance_seconds;

-- ============================================================
-- 6. STRIPE : absorption des rejeux de webhook
-- ============================================================

create table if not exists public.stripe_events (
  id text primary key, -- identifiant d'événement Stripe (evt_…)
  type text not null,
  payload jsonb,
  processed_at timestamptz not null default now()
);

-- ============================================================
-- 7. RLS
-- ============================================================

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.clips enable row level security;
alter table public.render_jobs enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.stripe_events enable row level security;

-- Un utilisateur ne voit que ses propres lignes, partout.
drop policy if exists "seul_own_rows" on public.profiles;
create policy "seul_own_rows" on public.profiles
  for all using (auth.uid() = id);

drop policy if exists "seul_own_rows" on public.projects;
create policy "seul_own_rows" on public.projects
  for all using (auth.uid() = user_id);

drop policy if exists "seul_own_rows" on public.clips;
create policy "seul_own_rows" on public.clips
  for all using (
    auth.uid() = (select user_id from public.projects where id = project_id)
  );

-- Jobs en LECTURE SEULE pour le client : s'il pouvait en insérer, il
-- ferait traiter une vidéo sans aucun débit (cost_seconds = 0). Les jobs
-- sont créés par le serveur (service_role) et le worker uniquement.
drop policy if exists "seul_own_rows" on public.render_jobs;
drop policy if exists "render_jobs_read_own" on public.render_jobs;
create policy "render_jobs_read_own" on public.render_jobs
  for select using (auth.uid() = user_id);

-- Les crédits ne sont PAS modifiables par le client : lecture seule.
-- Toutes les écritures passent par les RPC SECURITY DEFINER ci-dessous.
drop policy if exists "credits_read_own" on public.credit_accounts;
create policy "credits_read_own" on public.credit_accounts
  for select using (auth.uid() = user_id);

drop policy if exists "ledger_read_own" on public.credit_ledger;
create policy "ledger_read_own" on public.credit_ledger
  for select using (auth.uid() = user_id);

-- Les événements Stripe ne sont jamais exposés au client.
drop policy if exists "stripe_events_no_client" on public.stripe_events;
create policy "stripe_events_no_client" on public.stripe_events
  for select using (false);

-- ============================================================
-- 8. RPC DE CRÉDITS ET DE JOBS (atomiques, SECURITY DEFINER)
-- ============================================================
-- REVOKE systématique : sans cela, n'importe quel utilisateur
-- connecté pourrait appeler grant_credits(auth.uid(), 999999).
-- C'est la faille la plus coûteuse et la plus facile à oublier.

-- ---- Ajout de crédits (webhook Stripe, geste commercial) ----
create or replace function public.grant_credits(
  p_user_id uuid,
  p_seconds int,
  p_reason text default 'subscription',
  p_stripe_event_id text default null
)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_new_balance int;
begin
  if p_seconds <= 0 then
    raise exception 'p_seconds doit être positif';
  end if;

  -- Idempotence webhook : un événement déjà journalisé ne se rejoue pas.
  if p_stripe_event_id is not null then
    insert into public.stripe_events (id, type)
    values (p_stripe_event_id, 'credits.grant')
    on conflict (id) do nothing;
    if not found then
      select balance_seconds into v_new_balance
        from public.credit_accounts where user_id = p_user_id;
      return coalesce(v_new_balance, 0);
    end if;
  end if;

  update public.credit_accounts
     set balance_seconds = balance_seconds + p_seconds,
         updated_at = now()
   where user_id = p_user_id
  returning balance_seconds into v_new_balance;

  if v_new_balance is null then
    raise exception 'credit_account introuvable pour %', p_user_id;
  end if;

  insert into public.credit_ledger (user_id, delta_seconds, reason, stripe_event_id, balance_after)
  values (p_user_id, p_seconds, p_reason, p_stripe_event_id, v_new_balance);

  update public.profiles
     set video_credits_seconds = v_new_balance
   where id = p_user_id;

  return v_new_balance;
end;
$$;

-- ---- Réservation atomique (débit au lancement d'un job) ----
create or replace function public.reserve_credits(
  p_user_id uuid,
  p_seconds int,
  p_job_id uuid default null,
  p_reason text default 'job_dispatch'
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_new_balance int;
begin
  if p_seconds < 0 then
    raise exception 'p_seconds ne peut pas être négatif';
  end if;

  update public.credit_accounts
     set balance_seconds = balance_seconds - p_seconds,
         updated_at = now()
   where user_id = p_user_id
     and balance_seconds >= p_seconds
  returning balance_seconds into v_new_balance;

  -- Aucune ligne mise à jour : solde insuffisant. Le verrou de ligne
  -- posé par UPDATE sérialise les appels concurrents : impossible de
  -- passer le solde en négatif, même avec deux requêtes simultanées.
  if v_new_balance is null then
    return false;
  end if;

  insert into public.credit_ledger (user_id, delta_seconds, reason, job_id, balance_after)
  values (p_user_id, -p_seconds, p_reason, p_job_id, v_new_balance);

  update public.profiles
     set video_credits_seconds = v_new_balance
   where id = p_user_id;

  return true;
end;
$$;

-- ---- Remboursement d'un job en échec (idempotent) ----
create or replace function public.release_credits(
  p_job_id uuid,
  p_reason text default 'job_failed'
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_job public.render_jobs;
  v_new_balance int;
begin
  select * into v_job from public.render_jobs where id = p_job_id for update;

  if v_job is null then
    return false;
  end if;

  -- Déjà remboursé (rejeu, double callback du worker) : no-op.
  if v_job.cost_seconds = 0 then
    return true;
  end if;

  update public.credit_accounts
     set balance_seconds = balance_seconds + v_job.cost_seconds,
         updated_at = now()
   where user_id = v_job.user_id
  returning balance_seconds into v_new_balance;

  insert into public.credit_ledger (user_id, delta_seconds, reason, job_id, balance_after)
  values (v_job.user_id, v_job.cost_seconds, p_reason, p_job_id, v_new_balance);

  update public.profiles
     set video_credits_seconds = v_new_balance
   where id = v_job.user_id;

  -- Annule la réservation : un second appel ne remboursera pas deux fois.
  update public.render_jobs
     set cost_seconds = 0
   where id = p_job_id;

  return true;
end;
$$;

-- ---- Revendication d'un job par le worker (SKIP LOCKED) ----
create or replace function public.claim_render_job(
  p_worker_name text
)
returns public.render_jobs
language plpgsql security definer
set search_path = public
as $$
declare
  v_job public.render_jobs;
begin
  -- SKIP LOCKED : plusieurs workers scrutent en parallèle sans se
  -- voler les jobs ni se bloquer mutuellement.
  select * into v_job
    from public.render_jobs
   where status = 'queued'
   order by created_at
   limit 1
   for update skip locked;

  if v_job is null then
    return null;
  end if;

  update public.render_jobs
     set status = 'processing',
         locked_at = now(),
         locked_by = p_worker_name,
         started_at = coalesce(started_at, now()),
         attempts = attempts + 1
   where id = v_job.id;

  return v_job;
end;
$$;

-- ---- Fin de job réussie ----
create or replace function public.complete_render_job(
  p_job_id uuid,
  p_output_path text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.render_jobs
     set status = 'done',
         output_path = coalesce(p_output_path, output_path),
         progress = 100,
         finished_at = now()
   where id = p_job_id;
end;
$$;

-- ---- Fin de job en échec : reprise ou abandon + remboursement ----
create or replace function public.fail_render_job(
  p_job_id uuid,
  p_error text
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_job public.render_jobs;
begin
  select * into v_job from public.render_jobs where id = p_job_id for update;

  if v_job is null then
    return false;
  end if;

  if v_job.attempts < v_job.max_attempts then
    -- Reprise : le job repart en file pour une nouvelle tentative.
    update public.render_jobs
       set status = 'queued',
           error = left(p_error, 500),
           locked_at = null,
           locked_by = null
     where id = p_job_id;
    return true;
  end if;

  -- Échec définitif : les crédits réservés sont remboursés.
  update public.render_jobs
     set status = 'failed',
         error = left(p_error, 500),
         finished_at = now()
   where id = p_job_id;

  perform public.release_credits(p_job_id, 'job_failed');

  -- Un clip en échec définitif est marqué comme tel, avec l'erreur.
  if v_job.clip_id is not null then
    update public.clips
       set status = 'failed'
     where id = v_job.clip_id;
  end if;

  -- Le PROJET ne passe en erreur que si l'échec vient d'une étape
  -- d'ingestion : un rendu qui échoue ne doit pas effacer le fait que la
  -- transcription et les clips existent (le front afficherait un projet en
  -- erreur alors que les autres clips sont prêts).
  if v_job.project_id is not null and v_job.kind <> 'render' then
    update public.projects
       set status = 'error',
           error_message = left(p_error, 500)
     where id = v_job.project_id;
  end if;

  return false;
end;
$$;

-- ---- Dépôt d'une vidéo : débit des crédits + mise en file, ATOMIQUES ----
-- Remplace check_and_deduct_credits, dont la faute était structurelle :
-- le débit et l'insertion du projet vivaient dans DEUX transactions
-- distinctes. Si l'insertion échouait, le solde restait débité sans job —
-- donc sans remboursement possible, puisque release_credits rembourse à
-- partir de render_jobs.cost_seconds (un job inexistant ne rembourse rien).
--
-- Ici : UNE seule transaction, et la réservation est portée par le job.
-- Soit le projet ET son job existent et le solde est débité du coût, soit
-- rien n'est écrit du tout.
--
-- Réservée au serveur (service_role) : le REVOKE plus bas empêche un
-- client authentifié de débiter le compte d'un autre utilisateur.
create or replace function public.create_project_with_job(
  p_user_id uuid,
  p_title text,
  p_source_type text,
  p_source_url text,
  p_storage_path text,
  p_duration_seconds int,
  p_cost_seconds int,
  p_kind text default 'ingest',
  p_max_attempts int default 3
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_balance int;
  v_project_id uuid;
  v_job_id uuid;
begin
  if p_source_type not in ('upload_gallery', 'external_url') then
    raise exception 'source_type invalide : %', p_source_type;
  end if;

  if p_kind not in ('ingest', 'transcribe', 'analyze', 'render') then
    raise exception 'kind invalide : %', p_kind;
  end if;

  if p_cost_seconds < 0 then
    raise exception 'p_cost_seconds ne peut pas être négatif';
  end if;

  if not exists (select 1 from public.credit_accounts where user_id = p_user_id) then
    raise exception 'credit_account introuvable pour %', p_user_id;
  end if;

  -- 1. Débit. UPDATE ... WHERE sérialise les appels concurrents : le
  --    verrou de ligne, puis la réévaluation de la condition après le
  --    commit de la transaction concurrente, rendent impossible un solde
  --    négatif (deux clics simultanés ne peuvent pas payer une fois).
  update public.credit_accounts
     set balance_seconds = balance_seconds - p_cost_seconds,
         updated_at = now()
   where user_id = p_user_id
     and balance_seconds >= p_cost_seconds
  returning balance_seconds into v_balance;

  if v_balance is null then
    -- Solde insuffisant : on renvoie un résultat exploitable plutôt
    -- qu'une exception (l'API répond 402 sans bruit dans les logs).
    return jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_credits',
      'balance_seconds',
        (select balance_seconds from public.credit_accounts where user_id = p_user_id)
    );
  end if;

  -- 2. Projet : le worker enchaîne ingest > transcribe > analyze.
  insert into public.projects (
    user_id, title, source_type, source_url, storage_path, duration_seconds, status
  ) values (
    p_user_id,
    coalesce(nullif(left(coalesce(p_title, ''), 200), ''), 'Vidéo sans titre'),
    p_source_type, p_source_url, p_storage_path, p_duration_seconds, 'processing_audio'
  )
  returning id into v_project_id;

  -- 3. Job 'queued' : le worker le revendique via claim_render_job.
  insert into public.render_jobs (
    user_id, project_id, kind, status, attempts, max_attempts, progress, cost_seconds
  ) values (
    p_user_id, v_project_id, p_kind, 'queued', 0, greatest(1, p_max_attempts), 0, p_cost_seconds
  )
  returning id into v_job_id;

  -- 4. Journal d'audit + miroir du solde sur le profil.
  insert into public.credit_ledger (user_id, delta_seconds, reason, job_id, balance_after)
  values (p_user_id, -p_cost_seconds, 'project_dispatch', v_job_id, v_balance);

  update public.profiles
     set video_credits_seconds = v_balance
   where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'project_id', v_project_id,
    'job_id', v_job_id,
    'balance_seconds', v_balance
  );
end;
$$;

-- L'ancien helper « débit seul » disparaît : sur une base déjà installée
-- il resterait appelable et permettrait de débiter sans créer de job.
drop function if exists public.check_and_deduct_credits(uuid, int);

revoke execute on function public.grant_credits(uuid, int, text, text) from public, anon, authenticated;
revoke execute on function public.reserve_credits(uuid, int, uuid, text) from public, anon, authenticated;
revoke execute on function public.release_credits(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_render_job(text) from public, anon, authenticated;
revoke execute on function public.complete_render_job(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_render_job(uuid, text) from public, anon, authenticated;
revoke execute on function public.create_project_with_job(uuid, text, text, text, text, int, int, text, int) from public, anon, authenticated;

-- Seuls le serveur Next.js et le worker (service_role) exécutent ces
-- fonctions. Les GRANT sont explicites : le droit ne doit pas dépendre des
-- privilèges par défaut de l'instance.
grant execute on function public.grant_credits(uuid, int, text, text) to service_role;
grant execute on function public.reserve_credits(uuid, int, uuid, text) to service_role;
grant execute on function public.release_credits(uuid, text) to service_role;
grant execute on function public.claim_render_job(text) to service_role;
grant execute on function public.complete_render_job(uuid, text) to service_role;
grant execute on function public.fail_render_job(uuid, text) to service_role;
grant execute on function public.create_project_with_job(uuid, text, text, text, text, int, int, text, int) to service_role;

-- ============================================================
-- 9. BUCKETS STORAGE (privés) + POLITIQUES
-- ============================================================

insert into storage.buckets (id, name, public)
values ('raw-videos', 'raw-videos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('clips', 'clips', false)
on conflict (id) do nothing;

-- Le client ne peut déposer QUE dans son propre dossier :
-- premier segment du chemin = auth.uid().
-- drop policy if exists est requis : PostgreSQL n'accepte pas
-- create policy if not exists, et sans ce drop le script ne serait
-- pas rejouable (erreur 42710 « policy already exists »).
drop policy if exists "own_folder_upload" on storage.objects;
create policy "own_folder_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'raw-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own_folder_read" on storage.objects;
create policy "own_folder_read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('raw-videos', 'clips')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Le worker utilise service_role : il contourne ces politiques.

-- ============================================================
-- 10. OFFRE DE L'UTILISATEUR (plan) — écrite par le webhook Stripe
-- ============================================================
-- Le worker lit profiles.plan + subscription_status AU MOMENT DU RENDU
-- pour décider des fonctions accessibles (lib/entitlements.ts).

alter table public.profiles
  add column if not exists plan text not null default 'free';

alter table public.profiles
  drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free', 'pro', 'agency'));

-- La politique RLS des profils laisse l'utilisateur modifier SA ligne
-- (nom affiché…). Sans ce garde-fou, il pourrait s'attribuer lui-même
-- l'offre Agency, un statut « active » ou le customer Stripe d'un autre.
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role in ('anon', 'authenticated') and (
       new.plan is distinct from old.plan
    or new.subscription_status is distinct from old.subscription_status
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.video_credits_seconds is distinct from old.video_credits_seconds
  ) then
    raise exception 'Colonnes de facturation en lecture seule'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before update on public.profiles
  for each row execute function public.protect_billing_columns();

-- ============================================================
-- IziCut — CORRECTIF INSCRIPTION (« Database error saving new user »)
-- ------------------------------------------------------------
-- À coller dans Supabase → SQL Editor → New query → Run.
-- Sans risque : rejouable, ne supprime aucune donnée.
-- ============================================================

-- 1. Colonnes attendues par l'application (ajoutées si absentes)
alter table public.profiles add column if not exists full_name text not null default '';
alter table public.profiles add column if not exists video_credits_seconds int not null default 1800;
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists subscription_status text not null default 'inactive';

-- 2. Création du profil à l'inscription — ne bloque JAMAIS l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, email, full_name)
    values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Compte de crédits (30 min offertes) — ne bloque JAMAIS la création du profil
create or replace function public.handle_new_profile_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.credit_accounts (user_id, balance_seconds)
    values (new.id, coalesce(new.video_credits_seconds, 1800))
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'handle_new_profile_credits (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_profile_created_credits on public.profiles;
create trigger on_profile_created_credits
  after insert on public.profiles
  for each row execute function public.handle_new_profile_credits();

-- 4. Rattrapage : profils et crédits pour les comptes déjà créés
insert into public.profiles (id, email)
select u.id, coalesce(u.email, '') from auth.users u
on conflict (id) do nothing;

insert into public.credit_accounts (user_id, balance_seconds)
select p.id, coalesce(p.video_credits_seconds, 1800) from public.profiles p
on conflict (user_id) do nothing;

-- 5. Vérification : doit afficher le nombre de comptes, profils et crédits
select
  (select count(*) from auth.users)             as comptes,
  (select count(*) from public.profiles)        as profils,
  (select count(*) from public.credit_accounts) as credits;

-- ============================================================
-- FIX inscription : trigger robuste (500 « record "new" has no field »)
-- ------------------------------------------------------------
-- À coller dans : SQL Editor du projet izi cut → Run.
-- Idempotent : rejouable sans risque.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), '')
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'handle_new_user: %', SQLERRM;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

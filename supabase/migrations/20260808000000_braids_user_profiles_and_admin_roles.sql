create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  username text unique,
  bio text not null default '',
  country text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 80),
  constraint profiles_username_format check (username is null or username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  constraint profiles_bio_length check (char_length(bio) <= 320),
  constraint profiles_country_length check (char_length(country) <= 80)
);

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy "profiles_select_self_or_admin" on public.profiles
for select to authenticated
using (
  (select auth.uid()) = id
  or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

create policy "profiles_insert_self" on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);

create policy "profiles_update_self_or_admin" on public.profiles
for update to authenticated
using (
  (select auth.uid()) = id
  or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
)
with check (
  (select auth.uid()) = id
  or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
);

create table public.admin_activity (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_activity_action_length check (char_length(action) between 1 and 80)
);

alter table public.admin_activity enable row level security;
grant select on public.admin_activity to authenticated;
grant all on public.admin_activity to service_role;

create policy "admin_activity_select_admin" on public.admin_activity
for select to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80);

  if lower(coalesce(new.email, '')) = 'brunomelicio.ai@gmail.com' then
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
    where id = new.id;
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, requested_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

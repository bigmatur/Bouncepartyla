-- =========================================================
-- 014 Unified access control
-- Adds explicit interface and permission overrides to profiles.
-- =========================================================

alter table if exists public.profiles
  add column if not exists default_interface text,
  add column if not exists permissions text[] not null default '{}',
  add column if not exists denied_permissions text[] not null default '{}';

update public.profiles
set default_interface = case
  when role = 'customer' then 'customer'
  when role = 'driver' then 'driver'
  else 'admin'
end
where default_interface is null;

create index if not exists idx_profiles_role
on public.profiles(role);

create index if not exists idx_profiles_default_interface
on public.profiles(default_interface);

notify pgrst, 'reload schema';
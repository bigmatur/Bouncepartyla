-- Restore profile access columns expected by the application.
--
-- Some production environments were initialized without the access-control
-- columns introduced by migrations 014 and 016. The application currently
-- falls back through several SELECT variants when those columns are absent,
-- which creates repeated 42703 errors and unnecessary API round trips.
--
-- This migration intentionally does not create roles, change RLS policies, or
-- alter existing permission assignments. It only aligns the profiles schema
-- with the columns already read by the application.

begin;

alter table if exists public.profiles
  add column if not exists default_interface text,
  add column if not exists permissions text[] not null default '{}',
  add column if not exists denied_permissions text[] not null default '{}',
  add column if not exists additional_roles text[] not null default '{}';

update public.profiles
set default_interface = case
  when role = 'customer' then 'customer'
  when role = 'driver' then 'driver'
  else 'admin'
end
where default_interface is null;

notify pgrst, 'reload schema';

commit;

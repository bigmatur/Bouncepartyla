-- 054_working_time_link_driver_staff_identity.sql
--
-- Safely repairs the identity chain used by Working Time:
--   auth.users -> profiles -> route_drivers -> staff_time_entries
--
-- Scope:
-- - links a route driver to an Auth user only when that driver's existing
--   time entries point to exactly one auth_user_id;
-- - creates a minimal driver profile only when that Auth user has no profile;
-- - backfills profile_id on matching time entries;
-- - does not touch Route Board stops/order/status, bookings, inventory,
--   route execution, or Driver View behavior.

begin;

-- -------------------------------------------------------------------------
-- 1. Resolve route drivers from their own historical time entries.
--    We update only unlinked drivers with exactly one distinct Auth user.
-- -------------------------------------------------------------------------
with unique_driver_auth as (
  select
    e.route_driver_id,
    min(e.auth_user_id) as auth_user_id
  from public.staff_time_entries e
  where e.route_driver_id is not null
    and e.auth_user_id is not null
  group by e.route_driver_id
  having count(distinct e.auth_user_id) = 1
)
update public.route_drivers rd
set
  auth_user_id = uda.auth_user_id,
  updated_at = now()
from unique_driver_auth uda
join auth.users au
  on au.id = uda.auth_user_id
where rd.id = uda.route_driver_id
  and rd.auth_user_id is null
  and rd.deleted_at is null;

-- -------------------------------------------------------------------------
-- 2. Email fallback for active route drivers that still have no Auth link.
--    Exact normalized email match only.
-- -------------------------------------------------------------------------
update public.route_drivers rd
set
  auth_user_id = au.id,
  updated_at = now()
from auth.users au
where rd.auth_user_id is null
  and rd.deleted_at is null
  and coalesce(rd.active, true) = true
  and nullif(lower(trim(coalesce(rd.account_email, ''))), '') is not null
  and lower(trim(rd.account_email)) = lower(trim(coalesce(au.email, '')));

-- -------------------------------------------------------------------------
-- 3. Create a real staff profile for linked driver accounts that do not yet
--    have one. Existing profiles are never overwritten or reclassified.
-- -------------------------------------------------------------------------
insert into public.profiles (
  auth_user_id,
  first_name,
  last_name,
  role,
  additional_roles,
  default_interface,
  permissions,
  denied_permissions,
  is_active,
  created_at,
  updated_at
)
select
  rd.auth_user_id,
  nullif(trim(rd.name), ''),
  null,
  'driver',
  '{}'::text[],
  'driver',
  '{}'::text[],
  '{}'::text[],
  true,
  now(),
  now()
from public.route_drivers rd
join auth.users au
  on au.id = rd.auth_user_id
where rd.auth_user_id is not null
  and rd.deleted_at is null
  and coalesce(rd.active, true) = true
  and not exists (
    select 1
    from public.profiles p
    where p.auth_user_id = rd.auth_user_id
  )
on conflict do nothing;

-- -------------------------------------------------------------------------
-- 4. Canonicalize historical and current entries using auth_user_id first.
-- -------------------------------------------------------------------------
update public.staff_time_entries e
set
  profile_id = p.id,
  updated_at = now()
from public.profiles p
where e.auth_user_id is not null
  and p.auth_user_id = e.auth_user_id
  and e.profile_id is distinct from p.id;

-- -------------------------------------------------------------------------
-- 5. Fill missing auth/profile identities through the linked route driver.
-- -------------------------------------------------------------------------
update public.staff_time_entries e
set
  auth_user_id = coalesce(e.auth_user_id, rd.auth_user_id),
  profile_id = p.id,
  updated_at = now()
from public.route_drivers rd
join public.profiles p
  on p.auth_user_id = rd.auth_user_id
where e.route_driver_id = rd.id
  and rd.auth_user_id is not null
  and (
    e.auth_user_id is null
    or e.profile_id is distinct from p.id
  );

commit;

notify pgrst, 'reload schema';

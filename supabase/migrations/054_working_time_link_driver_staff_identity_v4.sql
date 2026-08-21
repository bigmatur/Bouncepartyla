-- 054_working_time_link_driver_staff_identity_v4.sql
-- Uses only columns confirmed in the live/project schema.
-- Does not modify Route Board, routes, bookings, or inventory.

begin;

-- 1. Link an unlinked route driver to the single Auth user found in that
-- driver's own time-entry history.
with unique_driver_auth as (
  select
    e.route_driver_id,
    (array_agg(e.auth_user_id order by e.auth_user_id::text))[1] as auth_user_id
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
join auth.users au on au.id = uda.auth_user_id
where rd.id = uda.route_driver_id
  and rd.auth_user_id is null
  and rd.deleted_at is null;

-- 2. Exact email fallback for still-unlinked active drivers.
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

-- 3. Create a minimal real staff profile only when none exists.
-- These are the core columns confirmed in the live schema.
insert into public.profiles (
  auth_user_id,
  first_name,
  last_name,
  role,
  is_active,
  updated_at
)
select
  rd.auth_user_id,
  nullif(trim(rd.name), ''),
  null,
  'driver',
  true,
  now()
from public.route_drivers rd
join auth.users au on au.id = rd.auth_user_id
where rd.auth_user_id is not null
  and rd.deleted_at is null
  and coalesce(rd.active, true) = true
  and not exists (
    select 1
    from public.profiles p
    where p.auth_user_id = rd.auth_user_id
  )
on conflict do nothing;

-- 4. Backfill profile_id using the authoritative Auth user identity.
update public.staff_time_entries e
set
  profile_id = p.id,
  updated_at = now()
from public.profiles p
where e.auth_user_id is not null
  and p.auth_user_id = e.auth_user_id
  and e.profile_id is distinct from p.id;

-- 5. Fill any remaining identity gaps through route_driver_id.
update public.staff_time_entries e
set
  auth_user_id = coalesce(e.auth_user_id, rd.auth_user_id),
  profile_id = p.id,
  updated_at = now()
from public.route_drivers rd
join public.profiles p on p.auth_user_id = rd.auth_user_id
where e.route_driver_id = rd.id
  and rd.auth_user_id is not null
  and (
    e.auth_user_id is null
    or e.profile_id is distinct from p.id
  );

commit;

notify pgrst, 'reload schema';

-- Verification 1: driver -> Auth -> profile
select
  rd.id as route_driver_id,
  rd.name as driver_name,
  rd.account_email,
  rd.auth_user_id,
  p.id as profile_id,
  p.role,
  p.first_name,
  p.last_name,
  p.is_active
from public.route_drivers rd
left join public.profiles p on p.auth_user_id = rd.auth_user_id
where rd.id = '506283d9-c9bc-47a8-96d4-fbba613f4272'::uuid;

-- Verification 2: all historical entries now share the real profile_id
select
  e.id,
  e.work_date,
  e.clock_in_at,
  e.clock_out_at,
  e.source,
  e.status,
  e.auth_user_id,
  e.route_driver_id,
  e.profile_id
from public.staff_time_entries e
where e.route_driver_id = '506283d9-c9bc-47a8-96d4-fbba613f4272'::uuid
order by e.clock_in_at desc;

-- Verification 3: admin report
select public.get_working_time_admin_report(
  '2026-07-23'::date,
  '2026-08-06'::date
);

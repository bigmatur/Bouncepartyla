-- 054_working_time_link_driver_staff_identity_final.sql
-- Final version based only on columns confirmed in the live Supabase schema.
-- Purpose: connect staff_time_entries -> auth user -> route driver -> staff profile.
-- Does not modify Route Board, bookings, inventory, route stops, or driver-route behavior.

begin;

-- 1) A route driver may be linked automatically only when all of that driver's
-- existing time entries point to exactly one Auth user.
with unique_driver_auth as (
  select
    e.route_driver_id,
    (array_agg(distinct e.auth_user_id order by e.auth_user_id))[1] as auth_user_id
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
where rd.id = uda.route_driver_id
  and rd.auth_user_id is null
  and rd.deleted_at is null;

-- 2) Create one real staff profile per linked Auth user when no profile exists.
-- Only columns verified in the live profiles table are used.
with driver_candidates as (
  select distinct on (rd.auth_user_id)
    rd.auth_user_id,
    nullif(trim(rd.name), '') as driver_name
  from public.route_drivers rd
  where rd.auth_user_id is not null
    and rd.deleted_at is null
    and coalesce(rd.active, true) = true
  order by rd.auth_user_id, rd.sort_order nulls last, rd.created_at, rd.id
)
insert into public.profiles (
  auth_user_id,
  role,
  first_name,
  last_name,
  is_active,
  created_at,
  updated_at
)
select
  dc.auth_user_id,
  'driver',
  coalesce(dc.driver_name, 'Driver'),
  null,
  true,
  now(),
  now()
from driver_candidates dc
where not exists (
  select 1
  from public.profiles p
  where p.auth_user_id = dc.auth_user_id
);

-- 3) Backfill profile_id for old and new time entries using auth_user_id.
update public.staff_time_entries e
set
  profile_id = p.id,
  updated_at = now()
from public.profiles p
where e.auth_user_id is not null
  and p.auth_user_id = e.auth_user_id
  and e.profile_id is distinct from p.id;

-- 4) Fill any remaining auth_user_id/profile_id gaps through route_driver_id.
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

-- Verification A: the known driver is linked to Auth and Profile.
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
left join public.profiles p
  on p.auth_user_id = rd.auth_user_id
where rd.id = '506283d9-c9bc-47a8-96d4-fbba613f4272'::uuid;

-- Verification B: all of the known driver's entries now have profile_id.
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

-- Verification C: admin report for the test period.
select public.get_working_time_admin_report(
  '2026-07-23'::date,
  '2026-08-06'::date
);

-- Read-only verification after 060_staff_identity_onboarding_v2.sql

-- 1) Active staff cards and their real profile identity.
select
  rd.id as route_driver_id,
  rd.name,
  rd.account_email,
  rd.auth_user_id,
  rd.active,
  p.id as profile_id,
  p.role as profile_role,
  p.first_name,
  p.last_name,
  p.is_active as profile_is_active
from public.route_drivers rd
left join public.profiles p
  on p.auth_user_id = rd.auth_user_id
where rd.deleted_at is null
order by rd.active desc, rd.sort_order, rd.name;

-- 2) Active staff cards that are linked to a UUID not present in Supabase Auth.
-- Expected: 0 rows.
select
  rd.id,
  rd.name,
  rd.account_email,
  rd.auth_user_id
from public.route_drivers rd
left join auth.users u
  on u.id = rd.auth_user_id
where rd.deleted_at is null
  and rd.auth_user_id is not null
  and u.id is null;

-- 3) Working Time rows with a route driver + auth identity but no profile link.
-- Expected after saving/linking that employee through Staff -> Employees: 0 rows for that employee.
select
  ste.id,
  ste.work_date,
  ste.route_driver_id,
  ste.auth_user_id,
  ste.profile_id,
  rd.name as driver_name
from public.staff_time_entries ste
left join public.route_drivers rd on rd.id = ste.route_driver_id
where ste.route_driver_id is not null
  and ste.auth_user_id is not null
  and ste.profile_id is null
order by ste.clock_in_at desc;

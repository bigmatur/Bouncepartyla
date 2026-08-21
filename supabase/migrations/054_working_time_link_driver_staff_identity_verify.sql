-- Read-only verification after migration 054.

-- A. Evgenii identity chain should now be complete.
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

-- B. All four known shifts should now have profile_id.
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

-- C. Admin report should now include Evgenii and his shifts.
select public.get_working_time_admin_report(
  '2026-07-23'::date,
  '2026-08-06'::date
);

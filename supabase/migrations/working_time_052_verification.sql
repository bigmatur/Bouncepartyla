-- Read-only verification for 052_working_time_admin_report_identity_final.sql
-- Run after migration 052 in Supabase SQL Editor.

-- 1) Raw entries and available identity columns for the last 30 days.
select
  e.id,
  e.work_date,
  e.clock_in_at,
  e.clock_out_at,
  e.profile_id,
  e.auth_user_id,
  e.route_driver_id,
  p_by_id.id as profile_from_profile_id,
  p_by_auth.id as profile_from_auth_user_id,
  p_by_driver_auth.id as profile_from_driver_auth,
  p_by_driver_email.id as profile_from_driver_email,
  coalesce(
    e.profile_id,
    p_by_auth.id,
    p_by_driver_auth.id,
    p_by_driver_email.id
  ) as resolved_profile_id
from public.staff_time_entries e
left join public.profiles p_by_id
  on p_by_id.id = e.profile_id
left join public.profiles p_by_auth
  on p_by_auth.auth_user_id = e.auth_user_id
left join public.route_drivers rd
  on rd.id = e.route_driver_id
left join public.profiles p_by_driver_auth
  on p_by_driver_auth.auth_user_id = rd.auth_user_id
left join auth.users driver_auth_user
  on lower(trim(driver_auth_user.email)) = lower(trim(rd.account_email))
left join public.profiles p_by_driver_email
  on p_by_driver_email.auth_user_id = driver_auth_user.id
where coalesce(
  e.work_date,
  (e.clock_in_at at time zone 'America/Los_Angeles')::date
) >= ((now() at time zone 'America/Los_Angeles')::date - 30)
order by e.clock_in_at desc;

-- 2) Entries that still cannot be connected to any profile.
select
  e.id,
  e.work_date,
  e.clock_in_at,
  e.profile_id,
  e.auth_user_id,
  e.route_driver_id,
  rd.name as route_driver_name,
  rd.account_email as route_driver_email
from public.staff_time_entries e
left join public.profiles p_by_auth
  on p_by_auth.auth_user_id = e.auth_user_id
left join public.route_drivers rd
  on rd.id = e.route_driver_id
left join public.profiles p_by_driver_auth
  on p_by_driver_auth.auth_user_id = rd.auth_user_id
left join auth.users driver_auth_user
  on lower(trim(driver_auth_user.email)) = lower(trim(rd.account_email))
left join public.profiles p_by_driver_email
  on p_by_driver_email.auth_user_id = driver_auth_user.id
where coalesce(
  e.profile_id,
  p_by_auth.id,
  p_by_driver_auth.id,
  p_by_driver_email.id
) is null
order by e.clock_in_at desc;

-- 3) Report smoke test. Change dates when needed.
select public.get_working_time_admin_report(
  ((now() at time zone 'America/Los_Angeles')::date - 14),
  (now() at time zone 'America/Los_Angeles')::date
);

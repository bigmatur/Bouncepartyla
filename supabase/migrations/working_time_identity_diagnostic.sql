-- Working Time identity diagnostic (READ ONLY)
-- Run the whole script in Supabase SQL Editor and send back all result tables.

-- A. Does the table actually contain time entries in the selected period?
select
  count(*) as total_entries,
  count(*) filter (where clock_out_at is null) as open_entries,
  min(coalesce(work_date, (clock_in_at at time zone 'America/Los_Angeles')::date)) as first_work_date,
  max(coalesce(work_date, (clock_in_at at time zone 'America/Los_Angeles')::date)) as last_work_date
from public.staff_time_entries
where coalesce(work_date, (clock_in_at at time zone 'America/Los_Angeles')::date)
      between date '2026-07-23' and date '2026-08-06';

-- B. Show every entry and all possible identity paths.
select
  e.id,
  coalesce(e.work_date, (e.clock_in_at at time zone 'America/Los_Angeles')::date) as effective_work_date,
  e.clock_in_at,
  e.clock_out_at,
  e.profile_id as entry_profile_id,
  e.auth_user_id as entry_auth_user_id,
  e.route_driver_id as entry_route_driver_id,
  rd.name as route_driver_name,
  rd.account_email as route_driver_email,
  rd.auth_user_id as route_driver_auth_user_id,
  p_direct.id as direct_profile_exists,
  p_auth.id as profile_from_entry_auth,
  p_driver_auth.id as profile_from_driver_auth,
  p_driver_email.id as profile_from_driver_email,
  coalesce(
    p_direct.id,
    p_auth.id,
    p_driver_auth.id,
    p_driver_email.id
  ) as resolved_profile_id
from public.staff_time_entries e
left join public.profiles p_direct
  on p_direct.id = e.profile_id
left join public.profiles p_auth
  on p_auth.auth_user_id = e.auth_user_id
left join public.route_drivers rd
  on rd.id = e.route_driver_id
left join public.profiles p_driver_auth
  on p_driver_auth.auth_user_id = rd.auth_user_id
left join auth.users driver_user
  on lower(trim(driver_user.email)) = lower(trim(rd.account_email))
left join public.profiles p_driver_email
  on p_driver_email.auth_user_id = driver_user.id
where coalesce(e.work_date, (e.clock_in_at at time zone 'America/Los_Angeles')::date)
      between date '2026-07-23' and date '2026-08-06'
order by e.clock_in_at desc;

-- C. Show route drivers and whether each has a matching auth user/profile.
select
  rd.id as route_driver_id,
  rd.name,
  rd.account_email,
  rd.auth_user_id as route_driver_auth_user_id,
  au.id as auth_user_from_email,
  au.email as auth_email,
  p_by_auth.id as profile_from_driver_auth,
  p_by_email.id as profile_from_driver_email
from public.route_drivers rd
left join auth.users au
  on lower(trim(au.email)) = lower(trim(rd.account_email))
left join public.profiles p_by_auth
  on p_by_auth.auth_user_id = rd.auth_user_id
left join public.profiles p_by_email
  on p_by_email.auth_user_id = au.id
order by rd.name nulls last, rd.created_at;

-- D. Profiles currently visible to the admin report.
select
  p.id as profile_id,
  p.auth_user_id,
  p.full_name,
  p.role,
  p.is_active
from public.profiles p
order by p.full_name nulls last, p.created_at;

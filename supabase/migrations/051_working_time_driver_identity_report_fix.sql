-- 051_working_time_driver_identity_report_fix.sql
--
-- Fixes Working Time when driver shifts exist but the admin report shows
-- them under the wrong employee or shows no shifts.
--
-- Safe scope:
-- - repairs only staff/profile links used by Working Time;
-- - replaces only get_working_time_admin_report();
-- - does not modify Route Board, route_stops, Driver View, bookings,
--   inventory, or route order/status logic.

begin;

-- 1. Ensure every active driver account with an Auth user has a canonical
-- staff profile. This uses the same minimal profile fields already used by
-- the Staff / Access module.
insert into public.profiles (
  auth_user_id,
  role,
  is_active,
  default_interface,
  updated_at
)
select
  rd.auth_user_id,
  'driver',
  true,
  'driver',
  now()
from public.route_drivers rd
where rd.auth_user_id is not null
  and coalesce(rd.active, true) = true
  and rd.deleted_at is null
  and not exists (
    select 1
    from public.profiles p
    where p.auth_user_id = rd.auth_user_id
  )
on conflict do nothing;


-- 2. Canonicalize existing time entries by auth_user_id.
-- auth_user_id is the strongest identity signal for an authenticated shift.
update public.staff_time_entries e
set
  profile_id = p.id,
  updated_at = now()
from public.profiles p
where e.auth_user_id is not null
  and p.auth_user_id = e.auth_user_id
  and e.profile_id is distinct from p.id;


-- 3. Canonicalize driver shifts that were linked only through route_driver_id.
update public.staff_time_entries e
set
  profile_id = p.id,
  auth_user_id = coalesce(e.auth_user_id, rd.auth_user_id),
  updated_at = now()
from public.route_drivers rd
join public.profiles p
  on p.auth_user_id = rd.auth_user_id
where e.route_driver_id = rd.id
  and rd.auth_user_id is not null
  and (
    e.profile_id is distinct from p.id
    or e.auth_user_id is null
  );


create or replace function public.get_working_time_admin_report(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_result jsonb;
begin
  select p.role::text
    into v_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  order by p.updated_at desc nulls last, p.id
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to view Working Time.';
  end if;

  with driver_identity as (
    select distinct on (rd.auth_user_id)
      rd.auth_user_id,
      rd.id as route_driver_id,
      rd.name as driver_name
    from public.route_drivers rd
    where rd.auth_user_id is not null
      and coalesce(rd.active, true) = true
      and rd.deleted_at is null
    order by rd.auth_user_id, rd.updated_at desc nulls last, rd.created_at desc nulls last, rd.id
  ),
  staff as (
    select
      p.id as profile_id,
      p.auth_user_id,
      p.role::text as role,
      coalesce(
        nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
        di.driver_name,
        nullif(split_part(coalesce(au.email, ''), '@', 1), ''),
        'Staff'
      )::text as display_name,
      di.route_driver_id
    from public.profiles p
    left join auth.users au
      on au.id = p.auth_user_id
    left join driver_identity di
      on di.auth_user_id = p.auth_user_id
    where coalesce(p.is_active, true) = true
      and p.role::text <> 'customer'
  ),
  rate_for_period as (
    select
      s.profile_id,
      r.pay_type,
      r.hourly_rate,
      r.overtime_eligible,
      row_number() over (
        partition by s.profile_id
        order by r.effective_from desc, r.created_at desc
      ) as rn
    from staff s
    left join public.staff_pay_rates r
      on r.profile_id = s.profile_id
      and r.effective_from <= p_to
      and (r.effective_until is null or r.effective_until >= p_from)
  ),
  canonical_entries as (
    select
      e.id,
      coalesce(
        p_by_auth.id,
        p_by_driver.id,
        e.profile_id
      ) as profile_id,
      e.work_date,
      e.clock_in_at,
      e.clock_out_at,
      e.source,
      e.status,
      coalesce(
        (
          select sum(
            extract(
              epoch from (
                coalesce(b.ended_at, now()) - b.started_at
              )
            ) / 60.0
          )
          from public.staff_time_breaks b
          where b.time_entry_id = e.id
            and b.break_type = 'unpaid'
        ),
        0
      )::numeric as break_minutes,
      exists (
        select 1
        from public.staff_time_breaks b
        where b.time_entry_id = e.id
          and b.ended_at is null
      ) as on_break
    from public.staff_time_entries e
    left join public.profiles p_by_auth
      on e.auth_user_id is not null
      and p_by_auth.auth_user_id = e.auth_user_id
    left join public.route_drivers rd
      on rd.id = e.route_driver_id
    left join public.profiles p_by_driver
      on rd.auth_user_id is not null
      and p_by_driver.auth_user_id = rd.auth_user_id
    where e.work_date between p_from and p_to
  ),
  entries as (
    select ce.*
    from canonical_entries ce
    where ce.profile_id is not null
  ),
  computed as (
    select
      e.*,
      greatest(
        0,
        extract(
          epoch from (
            coalesce(e.clock_out_at, now()) - e.clock_in_at
          )
        ) / 60.0 - e.break_minutes
      )::numeric as paid_minutes
    from entries e
  ),
  employee_rows as (
    select
      s.profile_id,
      s.auth_user_id,
      s.route_driver_id,
      s.display_name,
      s.role,
      coalesce(r.pay_type, 'hourly') as pay_type,
      r.hourly_rate,
      coalesce(r.overtime_eligible, true) as overtime_eligible,
      coalesce(sum(c.paid_minutes), 0)::numeric as paid_minutes,
      coalesce(sum(c.break_minutes), 0)::numeric as break_minutes,
      coalesce(sum(least(c.paid_minutes, 480)), 0)::numeric as regular_minutes,
      coalesce(
        sum(
          case
            when c.paid_minutes > 480
              then least(c.paid_minutes - 480, 240)
            else 0
          end
        ),
        0
      )::numeric as overtime_minutes,
      coalesce(
        sum(
          case
            when c.paid_minutes > 720
              then c.paid_minutes - 720
            else 0
          end
        ),
        0
      )::numeric as doubletime_minutes,
      count(c.id)::integer as shift_count,
      coalesce(bool_or(c.clock_out_at is null), false) as working_now,
      coalesce(bool_or(c.clock_out_at is null and c.on_break), false) as on_break,
      (
        select c2.clock_in_at
        from computed c2
        where c2.profile_id = s.profile_id
          and c2.clock_out_at is null
        order by c2.clock_in_at desc
        limit 1
      ) as current_clock_in,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', c3.id,
              'work_date', c3.work_date,
              'clock_in_at', c3.clock_in_at,
              'clock_out_at', c3.clock_out_at,
              'source', c3.source,
              'status', c3.status,
              'break_minutes', c3.break_minutes,
              'paid_minutes', c3.paid_minutes,
              'on_break', c3.on_break
            )
            order by c3.work_date desc, c3.clock_in_at desc
          )
          from computed c3
          where c3.profile_id = s.profile_id
        ),
        '[]'::jsonb
      ) as shifts
    from staff s
    left join computed c
      on c.profile_id = s.profile_id
    left join rate_for_period r
      on r.profile_id = s.profile_id
      and r.rn = 1
    group by
      s.profile_id,
      s.auth_user_id,
      s.route_driver_id,
      s.display_name,
      s.role,
      r.pay_type,
      r.hourly_rate,
      r.overtime_eligible
  ),
  with_pay as (
    select
      er.*,
      case
        when er.pay_type = 'hourly' and er.hourly_rate is not null then
          (
            (er.regular_minutes / 60.0) * er.hourly_rate
            + (
              case
                when er.overtime_eligible
                  then (er.overtime_minutes / 60.0) * er.hourly_rate * 1.5
                else (er.overtime_minutes / 60.0) * er.hourly_rate
              end
            )
            + (
              case
                when er.overtime_eligible
                  then (er.doubletime_minutes / 60.0) * er.hourly_rate * 2.0
                else (er.doubletime_minutes / 60.0) * er.hourly_rate
              end
            )
          )
        else 0
      end::numeric as estimated_pay
    from employee_rows er
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'summary', jsonb_build_object(
      'working_now', count(*) filter (where working_now),
      'paid_minutes', coalesce(sum(paid_minutes), 0),
      'break_minutes', coalesce(sum(break_minutes), 0),
      'overtime_minutes', coalesce(sum(overtime_minutes), 0),
      'doubletime_minutes', coalesce(sum(doubletime_minutes), 0),
      'estimated_pay', coalesce(sum(estimated_pay), 0),
      'open_shifts', count(*) filter (where working_now)
    ),
    'employees',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'profile_id', profile_id,
          'auth_user_id', auth_user_id,
          'route_driver_id', route_driver_id,
          'display_name', display_name,
          'role', role,
          'pay_type', pay_type,
          'hourly_rate', hourly_rate,
          'overtime_eligible', overtime_eligible,
          'paid_minutes', paid_minutes,
          'break_minutes', break_minutes,
          'regular_minutes', regular_minutes,
          'overtime_minutes', overtime_minutes,
          'doubletime_minutes', doubletime_minutes,
          'estimated_pay', estimated_pay,
          'shift_count', shift_count,
          'working_now', working_now,
          'on_break', on_break,
          'current_clock_in', current_clock_in,
          'shifts', shifts
        )
        order by working_now desc, display_name
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from with_pay;

  return coalesce(
    v_result,
    jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'summary', jsonb_build_object(
        'working_now', 0,
        'paid_minutes', 0,
        'break_minutes', 0,
        'overtime_minutes', 0,
        'doubletime_minutes', 0,
        'estimated_pay', 0,
        'open_shifts', 0
      ),
      'employees', '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_working_time_admin_report(date, date)
from public;

grant execute on function public.get_working_time_admin_report(date, date)
to authenticated;

notify pgrst, 'reload schema';

commit;

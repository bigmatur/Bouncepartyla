-- 053_working_time_admin_report_empty_shift_fix.sql
--
-- Fixes Staff -> Working Time so the admin report displays shifts created by:
--   1. profile_id
--   2. auth_user_id
--   3. route_driver_id
--   4. route driver account_email
--
-- Follow-up fix for empty LEFT JOIN rows being counted as open shifts and as 480 regular minutes.
-- This migration only replaces get_working_time_admin_report().
-- It does not modify Driver View, Route Board, route stops, bookings,
-- existing time entries, breaks, or pay-rate records.

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
  if p_from is null or p_to is null then
    raise exception 'Both report dates are required.';
  end if;

  if p_to < p_from then
    raise exception 'The report end date cannot be earlier than the start date.';
  end if;

  select p.role::text
    into v_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  order by p.created_at asc nulls last, p.id
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to view Working Time.';
  end if;

  with
  /*
   * One canonical row for every profile.
   *
   * A lateral join deliberately selects only one route_driver row so an
   * employee is never duplicated when historical driver records exist.
   */
  profile_staff as (
    select
      p.id as profile_id,
      p.auth_user_id,
      p.role::text as role,
      coalesce(
        nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
        rd.name,
        nullif(split_part(coalesce(au.email, ''), '@', 1), ''),
        'Staff'
      )::text as display_name,
      rd.id as route_driver_id
    from public.profiles p
    left join auth.users au
      on au.id = p.auth_user_id
    left join lateral (
      select
        candidate.id,
        candidate.name
      from public.route_drivers candidate
      where
        candidate.auth_user_id = p.auth_user_id
        or (
          nullif(lower(trim(coalesce(candidate.account_email, ''))), '') is not null
          and nullif(lower(trim(coalesce(au.email, ''))), '') is not null
          and lower(trim(candidate.account_email)) = lower(trim(au.email))
        )
      order by
        case
          when candidate.auth_user_id = p.auth_user_id then 0
          else 1
        end,
        case
          when coalesce(candidate.active, true) = true
            and candidate.deleted_at is null then 0
          else 1
        end,
        candidate.created_at asc nulls last,
        candidate.id
      limit 1
    ) rd on true
  ),

  /*
   * Resolve each time entry to a staff profile without relying only on
   * staff_time_entries.profile_id.
   *
   * Legacy and driver-created rows can contain only auth_user_id or only
   * route_driver_id. This is the key correction missing from the old report.
   */
  entry_identity as (
    select
      e.id,
      e.profile_id as stored_profile_id,
      e.auth_user_id as stored_auth_user_id,
      e.route_driver_id,
      e.work_date as stored_work_date,
      e.clock_in_at,
      e.clock_out_at,
      e.source,
      e.status,
      coalesce(
        e.profile_id,
        auth_profile.profile_id,
        driver_auth_profile.profile_id,
        driver_email_profile.profile_id
      ) as resolved_profile_id
    from public.staff_time_entries e

    left join lateral (
      select p.id as profile_id
      from public.profiles p
      where e.auth_user_id is not null
        and p.auth_user_id = e.auth_user_id
      order by
        case when coalesce(p.is_active, true) = true then 0 else 1 end,
        p.created_at asc nulls last,
        p.id
      limit 1
    ) auth_profile on true

    left join public.route_drivers entry_driver
      on entry_driver.id = e.route_driver_id

    left join lateral (
      select p.id as profile_id
      from public.profiles p
      where entry_driver.auth_user_id is not null
        and p.auth_user_id = entry_driver.auth_user_id
      order by
        case when coalesce(p.is_active, true) = true then 0 else 1 end,
        p.created_at asc nulls last,
        p.id
      limit 1
    ) driver_auth_profile on true

    left join lateral (
      select p.id as profile_id
      from public.profiles p
      join auth.users au
        on au.id = p.auth_user_id
      where
        nullif(lower(trim(coalesce(entry_driver.account_email, ''))), '') is not null
        and lower(trim(coalesce(au.email, ''))) =
            lower(trim(entry_driver.account_email))
      order by
        case when coalesce(p.is_active, true) = true then 0 else 1 end,
        p.created_at asc nulls last,
        p.id
      limit 1
    ) driver_email_profile on true

    where (
      e.work_date between p_from and p_to
      or (
        e.clock_in_at is not null
        and (e.clock_in_at at time zone 'America/Los_Angeles')::date
            between p_from and p_to
      )
    )
  ),

  /*
   * Normalize the report date from the actual clock-in timestamp.
   * The stored work_date remains a fallback for older records.
   */
  entries as (
    select
      i.id,
      i.resolved_profile_id as profile_id,
      coalesce(
        (i.clock_in_at at time zone 'America/Los_Angeles')::date,
        i.stored_work_date
      ) as work_date,
      i.clock_in_at,
      i.clock_out_at,
      i.source,
      i.status,
      coalesce(
        (
          select sum(
            extract(
              epoch from (
                least(
                  coalesce(b.ended_at, now()),
                  coalesce(i.clock_out_at, now())
                ) - greatest(b.started_at, i.clock_in_at)
              )
            ) / 60.0
          )
          from public.staff_time_breaks b
          where b.time_entry_id = i.id
            and b.break_type = 'unpaid'
            and b.started_at < coalesce(i.clock_out_at, now())
            and coalesce(b.ended_at, now()) > i.clock_in_at
        ),
        0
      )::numeric as break_minutes,
      exists (
        select 1
        from public.staff_time_breaks b
        where b.time_entry_id = i.id
          and b.ended_at is null
      ) as on_break
    from entry_identity i
    where i.resolved_profile_id is not null
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

  /*
   * Include every active staff profile plus any linked profile that has a
   * shift in the selected period. This preserves historical reports if a
   * former employee was later marked inactive.
   */
  report_staff_ids as (
    select ps.profile_id
    from profile_staff ps
    where coalesce(
      (
        select p.is_active
        from public.profiles p
        where p.id = ps.profile_id
      ),
      true
    ) = true
      and ps.role <> 'customer'

    union

    select distinct c.profile_id
    from computed c
    where c.profile_id is not null
  ),

  staff as (
    select ps.*
    from profile_staff ps
    join report_staff_ids ids
      on ids.profile_id = ps.profile_id
    where ps.role <> 'customer'
  ),

  /*
   * Select the rate effective at the end of the selected period.
   * This preserves the current UI contract while avoiding duplicate rows.
   */
  rate_for_period as (
    select
      s.profile_id,
      rate.pay_type,
      rate.hourly_rate,
      rate.overtime_eligible
    from staff s
    left join lateral (
      select
        r.pay_type,
        r.hourly_rate,
        r.overtime_eligible
      from public.staff_pay_rates r
      where r.profile_id = s.profile_id
        and r.effective_from <= p_to
        and (
          r.effective_until is null
          or r.effective_until >= p_from
        )
      order by
        r.effective_from desc,
        r.created_at desc,
        r.id desc
      limit 1
    ) rate on true
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

      coalesce(
        sum(
          case
            when c.id is null then 0
            else least(c.paid_minutes, 480)
          end
        ),
        0
      )::numeric as regular_minutes,

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
      coalesce(
        bool_or(c.id is not null and c.clock_out_at is null),
        false
      ) as working_now,
      coalesce(
        bool_or(c.id is not null and c.clock_out_at is null and c.on_break),
        false
      ) as on_break,

      (
        select c2.clock_in_at
        from computed c2
        where c2.profile_id = s.profile_id
          and c2.clock_out_at is null
        order by c2.clock_in_at desc, c2.id
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
            order by
              c3.work_date desc,
              c3.clock_in_at desc,
              c3.id
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
        when er.pay_type = 'hourly'
          and er.hourly_rate is not null
        then (
          (er.regular_minutes / 60.0) * er.hourly_rate
          + case
              when er.overtime_eligible
                then (er.overtime_minutes / 60.0)
                     * er.hourly_rate
                     * 1.5
              else (er.overtime_minutes / 60.0)
                   * er.hourly_rate
            end
          + case
              when er.overtime_eligible
                then (er.doubletime_minutes / 60.0)
                     * er.hourly_rate
                     * 2.0
              else (er.doubletime_minutes / 60.0)
                   * er.hourly_rate
            end
        )
        else 0
      end::numeric as estimated_pay
    from employee_rows er
  )

  select jsonb_build_object(
    'from', p_from,
    'to', p_to,

    'summary', jsonb_build_object(
      'working_now',
        count(*) filter (where working_now),

      'paid_minutes',
        coalesce(sum(paid_minutes), 0),

      'break_minutes',
        coalesce(sum(break_minutes), 0),

      'overtime_minutes',
        coalesce(sum(overtime_minutes), 0),

      'doubletime_minutes',
        coalesce(sum(doubletime_minutes), 0),

      'estimated_pay',
        coalesce(sum(estimated_pay), 0),

      'open_shifts',
        count(*) filter (where working_now)
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
          order by
            working_now desc,
            display_name,
            profile_id
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

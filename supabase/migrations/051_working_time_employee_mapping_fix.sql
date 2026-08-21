-- 051_working_time_employee_mapping_fix.sql
--
-- Fixes admin Working Time when driver shifts exist in My Time but are
-- missing or attributed to the wrong employee in /admin/staff/time.
--
-- The repair uses this identity priority:
--   1. staff_time_entries.auth_user_id
--   2. staff_time_entries.route_driver_id -> route driver account
--   3. existing staff_time_entries.profile_id
--
-- Route Board, Driver View, route stops, bookings, and inventory are untouched.

-- ---------------------------------------------------------------------------
-- 1. Create a standard driver profile for an authenticated route-driver account
--    only when that account does not already have a profile.
-- ---------------------------------------------------------------------------

insert into public.profiles (
  auth_user_id,
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
  au.id,
  'driver',
  '[]'::jsonb,
  'driver',
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  now(),
  now()
from public.route_drivers rd
join auth.users au
  on (
    rd.auth_user_id = au.id
    or (
      rd.auth_user_id is null
      and nullif(lower(trim(coalesce(rd.account_email, ''))), '') is not null
      and lower(trim(rd.account_email)) = lower(trim(coalesce(au.email, '')))
    )
  )
where coalesce(rd.active, true) = true
  and rd.deleted_at is null
  and not exists (
    select 1
    from public.profiles p
    where p.auth_user_id = au.id
  )
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- 2. Normalize route_drivers.auth_user_id when the driver was linked by email.
-- ---------------------------------------------------------------------------

update public.route_drivers rd
set
  auth_user_id = au.id,
  updated_at = now()
from auth.users au
where rd.auth_user_id is null
  and nullif(lower(trim(coalesce(rd.account_email, ''))), '') is not null
  and lower(trim(rd.account_email)) = lower(trim(coalesce(au.email, '')));


-- ---------------------------------------------------------------------------
-- 3. Repair staff_time_entries.profile_id.
--
-- auth_user_id is authoritative when present. For legacy rows without it,
-- resolve through route_driver_id.
-- ---------------------------------------------------------------------------

update public.staff_time_entries e
set
  profile_id = resolved.profile_id,
  auth_user_id = coalesce(e.auth_user_id, resolved.auth_user_id),
  updated_at = now()
from lateral (
  select
    p.id as profile_id,
    p.auth_user_id
  from public.profiles p
  where p.auth_user_id = coalesce(
    e.auth_user_id,
    (
      select rd.auth_user_id
      from public.route_drivers rd
      where rd.id = e.route_driver_id
      limit 1
    )
  )
  order by p.created_at asc nulls last, p.id
  limit 1
) resolved
where resolved.profile_id is not null
  and (
    e.profile_id is distinct from resolved.profile_id
    or e.auth_user_id is null
  );


-- ---------------------------------------------------------------------------
-- 4. Replace the admin report with identity-safe aggregation.
-- ---------------------------------------------------------------------------

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
  order by p.created_at asc nulls last, p.id
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to view Working Time.';
  end if;

  with staff as (
    select distinct on (p.id)
      p.id as profile_id,
      p.auth_user_id,
      p.role::text as role,
      coalesce(
        rd.name,
        nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
        nullif(split_part(coalesce(au.email, ''), '@', 1), ''),
        'Staff'
      )::text as display_name,
      rd.id as route_driver_id
    from public.profiles p
    left join auth.users au
      on au.id = p.auth_user_id
    left join public.route_drivers rd
      on (
        rd.auth_user_id = p.auth_user_id
        or (
          nullif(lower(trim(coalesce(rd.account_email, ''))), '') is not null
          and lower(trim(rd.account_email)) =
              lower(trim(coalesce(au.email, '')))
        )
      )
      and coalesce(rd.active, true) = true
      and rd.deleted_at is null
    where coalesce(p.is_active, true) = true
      and p.role::text <> 'customer'
    order by p.id, rd.created_at asc nulls last, rd.id
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
  resolved_entries as (
    select
      e.id,
      coalesce(
        p_by_user.id,
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

    left join lateral (
      select p.id
      from public.profiles p
      where e.auth_user_id is not null
        and p.auth_user_id = e.auth_user_id
      order by p.created_at asc nulls last, p.id
      limit 1
    ) p_by_user on true

    left join lateral (
      select p.id
      from public.route_drivers rd
      join public.profiles p
        on p.auth_user_id = rd.auth_user_id
      where e.route_driver_id is not null
        and rd.id = e.route_driver_id
      order by p.created_at asc nulls last, p.id
      limit 1
    ) p_by_driver on true

    where e.work_date between p_from and p_to
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
    from resolved_entries e
    where e.profile_id is not null
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
        sum(least(c.paid_minutes, 480)),
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
      coalesce(bool_or(c.clock_out_at is null), false) as working_now,
      coalesce(
        bool_or(c.clock_out_at is null and c.on_break),
        false
      ) as on_break,

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
      'summary', jsonb_build_object(),
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

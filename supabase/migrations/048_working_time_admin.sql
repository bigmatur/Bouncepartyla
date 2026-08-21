-- 048_working_time_admin.sql
--
-- Admin Working Time:
-- - employee list and date-range report
-- - collapsible employee/day data
-- - admin Start / Break / Resume / Finish controls
-- - hourly rate history
-- - estimated regular/overtime/double-time earnings
--
-- This extends the existing canonical staff_time_entries/staff_time_breaks
-- model. It does not change Driver View, Route Board, booking, or inventory.

create table if not exists public.staff_pay_rates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pay_type text not null default 'hourly',
  hourly_rate numeric(10,2) null,
  overtime_eligible boolean not null default true,
  effective_from date not null default ((now() at time zone 'America/Los_Angeles')::date),
  effective_until date null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_pay_rates_pay_type_check
    check (pay_type in ('hourly', 'salary', 'daily', 'other')),
  constraint staff_pay_rates_hourly_rate_check
    check (hourly_rate is null or hourly_rate >= 0),
  constraint staff_pay_rates_date_order_check
    check (effective_until is null or effective_until >= effective_from)
);

create index if not exists staff_pay_rates_profile_date_idx
  on public.staff_pay_rates(profile_id, effective_from desc);

alter table public.staff_pay_rates enable row level security;

drop policy if exists staff_pay_rates_management_all on public.staff_pay_rates;
create policy staff_pay_rates_management_all
on public.staff_pay_rates
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role::text in ('super_admin', 'admin', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role::text in ('super_admin', 'admin', 'manager')
  )
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
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to view Working Time.';
  end if;

  with staff as (
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
    left join auth.users au on au.id = p.auth_user_id
    left join public.route_drivers rd
      on rd.auth_user_id = p.auth_user_id
      or (
        nullif(lower(trim(coalesce(rd.account_email, ''))), '') is not null
        and lower(trim(rd.account_email)) = lower(trim(coalesce(au.email, '')))
      )
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
  entries as (
    select
      e.id,
      coalesce(e.profile_id, s.profile_id) as profile_id,
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
    left join staff s
      on s.auth_user_id = e.auth_user_id
      or (s.route_driver_id is not null and s.route_driver_id = e.route_driver_id)
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
      bool_or(c.clock_out_at is null) as working_now,
      bool_or(c.clock_out_at is null and c.on_break) as on_break,
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
    left join computed c on c.profile_id = s.profile_id
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
              case when er.overtime_eligible
                then (er.overtime_minutes / 60.0) * er.hourly_rate * 1.5
                else (er.overtime_minutes / 60.0) * er.hourly_rate
              end
            )
            + (
              case when er.overtime_eligible
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
      'summary', jsonb_build_object(),
      'employees', '[]'::jsonb
    )
  );
end;
$$;


create or replace function public.admin_start_staff_time(
  p_profile_id uuid,
  p_source text default 'admin_adjustment'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_user_id uuid;
  v_driver_id uuid;
  v_entry_id uuid;
  v_source text;
begin
  select p.role::text
    into v_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized.';
  end if;

  select p.auth_user_id
    into v_user_id
  from public.profiles p
  where p.id = p_profile_id
    and coalesce(p.is_active, true) = true;

  if v_user_id is null then
    raise exception 'Employee profile was not found.';
  end if;

  select rd.id
    into v_driver_id
  from public.route_drivers rd
  where rd.auth_user_id = v_user_id
    and coalesce(rd.active, true) = true
    and rd.deleted_at is null
  limit 1;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.clock_out_at is null
    and (
      e.profile_id = p_profile_id
      or e.auth_user_id = v_user_id
      or (v_driver_id is not null and e.route_driver_id = v_driver_id)
    )
  order by e.clock_in_at desc
  limit 1;

  if v_entry_id is not null then
    return v_entry_id;
  end if;

  v_source := case
    when p_source in ('manual', 'driver_route', 'cleaning', 'admin_adjustment')
      then p_source
    else 'admin_adjustment'
  end;

  insert into public.staff_time_entries (
    profile_id,
    auth_user_id,
    route_driver_id,
    work_date,
    clock_in_at,
    source,
    status,
    created_at,
    updated_at
  )
  values (
    p_profile_id,
    v_user_id,
    v_driver_id,
    (now() at time zone 'America/Los_Angeles')::date,
    now(),
    v_source,
    'open',
    now(),
    now()
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;


create or replace function public.admin_start_staff_break(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_entry_id uuid;
  v_break_id uuid;
begin
  select p.role::text
    into v_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized.';
  end if;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.profile_id = p_profile_id
    and e.clock_out_at is null
  order by e.clock_in_at desc
  limit 1;

  if v_entry_id is null then
    raise exception 'Employee has no open shift.';
  end if;

  select b.id
    into v_break_id
  from public.staff_time_breaks b
  where b.time_entry_id = v_entry_id
    and b.ended_at is null
  limit 1;

  if v_break_id is not null then
    return v_break_id;
  end if;

  insert into public.staff_time_breaks (
    time_entry_id,
    started_at,
    break_type,
    created_at,
    updated_at
  )
  values (
    v_entry_id,
    now(),
    'unpaid',
    now(),
    now()
  )
  returning id into v_break_id;

  return v_break_id;
end;
$$;


create or replace function public.admin_resume_staff_work(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_entry_id uuid;
begin
  select p.role::text
    into v_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized.';
  end if;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.profile_id = p_profile_id
    and e.clock_out_at is null
  order by e.clock_in_at desc
  limit 1;

  if v_entry_id is null then
    raise exception 'Employee has no open shift.';
  end if;

  update public.staff_time_breaks
     set ended_at = now(),
         updated_at = now()
   where time_entry_id = v_entry_id
     and ended_at is null;

  return v_entry_id;
end;
$$;


create or replace function public.admin_finish_staff_time(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_entry_id uuid;
begin
  select p.role::text
    into v_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized.';
  end if;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.profile_id = p_profile_id
    and e.clock_out_at is null
  order by e.clock_in_at desc
  limit 1;

  if v_entry_id is null then
    return null;
  end if;

  update public.staff_time_breaks
     set ended_at = now(),
         updated_at = now()
   where time_entry_id = v_entry_id
     and ended_at is null;

  update public.staff_time_entries
     set clock_out_at = now(),
         status = 'closed',
         updated_at = now()
   where id = v_entry_id;

  return v_entry_id;
end;
$$;


create or replace function public.admin_set_staff_pay_rate(
  p_profile_id uuid,
  p_hourly_rate numeric,
  p_overtime_eligible boolean default true,
  p_effective_from date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_rate_id uuid;
  v_effective_from date;
begin
  select p.role::text
    into v_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized.';
  end if;

  if p_hourly_rate is null or p_hourly_rate < 0 then
    raise exception 'Hourly rate must be zero or greater.';
  end if;

  v_effective_from := coalesce(
    p_effective_from,
    (now() at time zone 'America/Los_Angeles')::date
  );

  update public.staff_pay_rates
     set effective_until = v_effective_from - 1,
         updated_at = now()
   where profile_id = p_profile_id
     and effective_until is null
     and effective_from < v_effective_from;

  insert into public.staff_pay_rates (
    profile_id,
    pay_type,
    hourly_rate,
    overtime_eligible,
    effective_from,
    created_by,
    created_at,
    updated_at
  )
  values (
    p_profile_id,
    'hourly',
    p_hourly_rate,
    coalesce(p_overtime_eligible, true),
    v_effective_from,
    auth.uid(),
    now(),
    now()
  )
  returning id into v_rate_id;

  return v_rate_id;
end;
$$;


revoke all on function public.get_working_time_admin_report(date, date) from public;
revoke all on function public.admin_start_staff_time(uuid, text) from public;
revoke all on function public.admin_start_staff_break(uuid) from public;
revoke all on function public.admin_resume_staff_work(uuid) from public;
revoke all on function public.admin_finish_staff_time(uuid) from public;
revoke all on function public.admin_set_staff_pay_rate(uuid, numeric, boolean, date) from public;

grant execute on function public.get_working_time_admin_report(date, date) to authenticated;
grant execute on function public.admin_start_staff_time(uuid, text) to authenticated;
grant execute on function public.admin_start_staff_break(uuid) to authenticated;
grant execute on function public.admin_resume_staff_work(uuid) to authenticated;
grant execute on function public.admin_finish_staff_time(uuid) to authenticated;
grant execute on function public.admin_set_staff_pay_rate(uuid, numeric, boolean, date) to authenticated;

notify pgrst, 'reload schema';

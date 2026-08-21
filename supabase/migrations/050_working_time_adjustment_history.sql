-- 050_working_time_adjustment_history.sql
--
-- Cumulative Working Time corrections + visible adjustment history.
-- Safe to run whether or not migration 049 was already applied.

create table if not exists public.staff_time_adjustments (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.staff_time_entries(id) on delete cascade,
  profile_id uuid null references public.profiles(id) on delete set null,
  adjustment_type text not null,
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text not null,
  changed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists staff_time_adjustments_entry_idx
  on public.staff_time_adjustments(time_entry_id, created_at desc);

create index if not exists staff_time_adjustments_profile_idx
  on public.staff_time_adjustments(profile_id, created_at desc);

alter table public.staff_time_adjustments enable row level security;

drop policy if exists staff_time_adjustments_management_select
on public.staff_time_adjustments;

create policy staff_time_adjustments_management_select
on public.staff_time_adjustments
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role::text in ('super_admin', 'admin', 'manager')
  )
);


create or replace function public.admin_update_staff_shift(
  p_time_entry_id uuid,
  p_clock_in_local timestamp without time zone,
  p_clock_out_local timestamp without time zone,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_entry public.staff_time_entries%rowtype;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_reason text;
begin
  select p.role::text
    into v_admin_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_admin_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to edit Working Time.';
  end if;

  v_reason := trim(coalesce(p_reason, ''));

  if length(v_reason) < 3 then
    raise exception 'A reason for the change is required.';
  end if;

  select *
    into v_entry
  from public.staff_time_entries
  where id = p_time_entry_id
  for update;

  if not found then
    raise exception 'Shift was not found.';
  end if;

  if p_clock_in_local is null then
    raise exception 'Clock-in time is required.';
  end if;

  v_clock_in := p_clock_in_local at time zone 'America/Los_Angeles';
  v_clock_out := case
    when p_clock_out_local is null then null
    else p_clock_out_local at time zone 'America/Los_Angeles'
  end;

  if v_clock_out is not null and v_clock_out < v_clock_in then
    raise exception 'Clock-out cannot be earlier than clock-in.';
  end if;

  insert into public.staff_time_adjustments (
    time_entry_id,
    profile_id,
    adjustment_type,
    old_values,
    new_values,
    reason,
    changed_by
  )
  values (
    v_entry.id,
    v_entry.profile_id,
    'shift_updated',
    jsonb_build_object(
      'clock_in_at', v_entry.clock_in_at,
      'clock_out_at', v_entry.clock_out_at,
      'work_date', v_entry.work_date,
      'status', v_entry.status
    ),
    jsonb_build_object(
      'clock_in_at', v_clock_in,
      'clock_out_at', v_clock_out,
      'work_date', (v_clock_in at time zone 'America/Los_Angeles')::date,
      'status', case when v_clock_out is null then 'open' else 'closed' end
    ),
    v_reason,
    auth.uid()
  );

  update public.staff_time_entries
     set clock_in_at = v_clock_in,
         clock_out_at = v_clock_out,
         work_date = (v_clock_in at time zone 'America/Los_Angeles')::date,
         status = case when v_clock_out is null then 'open' else 'closed' end,
         source = 'admin_adjustment',
         updated_at = now()
   where id = v_entry.id;

  if v_clock_out is not null then
    update public.staff_time_breaks
       set ended_at = least(coalesce(ended_at, v_clock_out), v_clock_out),
           updated_at = now()
     where time_entry_id = v_entry.id
       and started_at < v_clock_out
       and (ended_at is null or ended_at > v_clock_out);

    delete from public.staff_time_breaks
     where time_entry_id = v_entry.id
       and started_at >= v_clock_out;
  end if;

  return v_entry.id;
end;
$$;


create or replace function public.admin_add_staff_shift(
  p_profile_id uuid,
  p_clock_in_local timestamp without time zone,
  p_clock_out_local timestamp without time zone,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_auth_user_id uuid;
  v_driver_id uuid;
  v_entry_id uuid;
  v_clock_in timestamptz;
  v_clock_out timestamptz;
  v_reason text;
begin
  select p.role::text
    into v_admin_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_admin_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to add Working Time.';
  end if;

  v_reason := trim(coalesce(p_reason, ''));

  if length(v_reason) < 3 then
    raise exception 'A reason for the new shift is required.';
  end if;

  select p.auth_user_id
    into v_auth_user_id
  from public.profiles p
  where p.id = p_profile_id
    and coalesce(p.is_active, true) = true;

  if not found then
    raise exception 'Employee profile was not found.';
  end if;

  if p_clock_in_local is null or p_clock_out_local is null then
    raise exception 'Both start and finish times are required.';
  end if;

  v_clock_in := p_clock_in_local at time zone 'America/Los_Angeles';
  v_clock_out := p_clock_out_local at time zone 'America/Los_Angeles';

  if v_clock_out < v_clock_in then
    raise exception 'Clock-out cannot be earlier than clock-in.';
  end if;

  select rd.id
    into v_driver_id
  from public.route_drivers rd
  where rd.auth_user_id = v_auth_user_id
    and coalesce(rd.active, true) = true
    and rd.deleted_at is null
  limit 1;

  insert into public.staff_time_entries (
    profile_id,
    auth_user_id,
    route_driver_id,
    work_date,
    clock_in_at,
    clock_out_at,
    source,
    status,
    notes,
    created_at,
    updated_at
  )
  values (
    p_profile_id,
    v_auth_user_id,
    v_driver_id,
    (v_clock_in at time zone 'America/Los_Angeles')::date,
    v_clock_in,
    v_clock_out,
    'admin_adjustment',
    'closed',
    v_reason,
    now(),
    now()
  )
  returning id into v_entry_id;

  insert into public.staff_time_adjustments (
    time_entry_id,
    profile_id,
    adjustment_type,
    old_values,
    new_values,
    reason,
    changed_by
  )
  values (
    v_entry_id,
    p_profile_id,
    'shift_created',
    '{}'::jsonb,
    jsonb_build_object(
      'clock_in_at', v_clock_in,
      'clock_out_at', v_clock_out,
      'work_date', (v_clock_in at time zone 'America/Los_Angeles')::date,
      'status', 'closed'
    ),
    v_reason,
    auth.uid()
  );

  return v_entry_id;
end;
$$;


create or replace function public.get_working_time_adjustments_report(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role text;
  v_result jsonb;
begin
  select p.role::text
    into v_admin_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_admin_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to view adjustment history.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'time_entry_id', a.time_entry_id,
        'profile_id', a.profile_id,
        'employee_name', coalesce(
          nullif(trim(concat_ws(' ', ep.first_name, ep.last_name)), ''),
          erd.name,
          nullif(split_part(coalesce(eau.email, ''), '@', 1), ''),
          'Staff'
        ),
        'adjustment_type', a.adjustment_type,
        'old_values', a.old_values,
        'new_values', a.new_values,
        'reason', a.reason,
        'changed_by_email', au.email,
        'created_at', a.created_at
      )
      order by a.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.staff_time_adjustments a
  join public.staff_time_entries e on e.id = a.time_entry_id
  left join public.profiles ep on ep.id = coalesce(a.profile_id, e.profile_id)
  left join auth.users eau on eau.id = ep.auth_user_id
  left join public.route_drivers erd
    on erd.auth_user_id = ep.auth_user_id
  left join auth.users au on au.id = a.changed_by
  where e.work_date between p_from and p_to;

  return v_result;
end;
$$;


revoke all on function public.admin_update_staff_shift(
  uuid,
  timestamp without time zone,
  timestamp without time zone,
  text
) from public;

revoke all on function public.admin_add_staff_shift(
  uuid,
  timestamp without time zone,
  timestamp without time zone,
  text
) from public;

revoke all on function public.get_working_time_adjustments_report(date, date)
from public;

grant execute on function public.admin_update_staff_shift(
  uuid,
  timestamp without time zone,
  timestamp without time zone,
  text
) to authenticated;

grant execute on function public.admin_add_staff_shift(
  uuid,
  timestamp without time zone,
  timestamp without time zone,
  text
) to authenticated;

grant execute on function public.get_working_time_adjustments_report(date, date)
to authenticated;

notify pgrst, 'reload schema';

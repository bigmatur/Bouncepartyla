-- 046_staff_time_clock_rpc_functions.sql
-- Creates the RPC functions expected by src/app/time-clock/actions.ts.

create or replace function public.start_my_staff_time(
  p_source text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_driver_id uuid;
  v_entry_id uuid;
  v_source text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  v_source := case
    when p_source in ('manual', 'driver_route', 'cleaning') then p_source
    else 'manual'
  end;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.auth_user_id = v_user_id
    and coalesce(p.is_active, true) = true
    and p.role::text <> 'customer'
  order by p.created_at asc nulls last, p.id
  limit 1;

  select rd.id
    into v_driver_id
  from public.route_drivers rd
  where coalesce(rd.active, true) = true
    and rd.deleted_at is null
    and (
      rd.auth_user_id = v_user_id
      or (
        nullif(lower(trim(coalesce(rd.account_email, ''))), '') is not null
        and nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '') is not null
        and lower(trim(rd.account_email)) =
            lower(trim(auth.jwt() ->> 'email'))
      )
    )
  order by rd.created_at asc nulls last, rd.id
  limit 1;

  if v_profile_id is null and v_driver_id is null then
    raise exception 'A linked staff profile or active driver account is required.';
  end if;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.clock_out_at is null
    and (
      (v_profile_id is not null and e.profile_id = v_profile_id)
      or e.auth_user_id = v_user_id
      or (v_driver_id is not null and e.route_driver_id = v_driver_id)
    )
  order by e.clock_in_at desc
  limit 1;

  if v_entry_id is not null then
    return v_entry_id;
  end if;

  insert into public.staff_time_entries (
    profile_id,
    auth_user_id,
    route_driver_id,
    work_date,
    clock_in_at,
    clock_out_at,
    source,
    status,
    created_at,
    updated_at
  )
  values (
    v_profile_id,
    v_user_id,
    v_driver_id,
    (now() at time zone 'America/Los_Angeles')::date,
    now(),
    null,
    v_source,
    'open',
    now(),
    now()
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;


create or replace function public.start_my_staff_break()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
  v_break_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.clock_out_at is null
    and e.auth_user_id = v_user_id
  order by e.clock_in_at desc
  limit 1;

  if v_entry_id is null then
    raise exception 'Start work before starting a break.';
  end if;

  select b.id
    into v_break_id
  from public.staff_time_breaks b
  where b.time_entry_id = v_entry_id
    and b.ended_at is null
  order by b.started_at desc
  limit 1;

  if v_break_id is not null then
    return v_break_id;
  end if;

  insert into public.staff_time_breaks (
    time_entry_id,
    started_at,
    ended_at,
    break_type,
    created_at,
    updated_at
  )
  values (
    v_entry_id,
    now(),
    null,
    'unpaid',
    now(),
    now()
  )
  returning id into v_break_id;

  return v_break_id;
end;
$$;


create or replace function public.resume_my_staff_work()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.clock_out_at is null
    and e.auth_user_id = v_user_id
  order by e.clock_in_at desc
  limit 1;

  if v_entry_id is null then
    raise exception 'No open work shift was found.';
  end if;

  update public.staff_time_breaks
     set ended_at = now(),
         updated_at = now()
   where time_entry_id = v_entry_id
     and ended_at is null;

  update public.staff_time_entries
     set updated_at = now()
   where id = v_entry_id;

  return v_entry_id;
end;
$$;


create or replace function public.finish_my_staff_time()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.clock_out_at is null
    and e.auth_user_id = v_user_id
  order by e.clock_in_at desc
  limit 1;

  if v_entry_id is null then
    return null;
  end if;

  update public.staff_time_breaks
     set ended_at = coalesce(ended_at, now()),
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


revoke all on function public.start_my_staff_time(text) from public;
revoke all on function public.start_my_staff_break() from public;
revoke all on function public.resume_my_staff_work() from public;
revoke all on function public.finish_my_staff_time() from public;

grant execute on function public.start_my_staff_time(text) to authenticated;
grant execute on function public.start_my_staff_break() to authenticated;
grant execute on function public.resume_my_staff_work() to authenticated;
grant execute on function public.finish_my_staff_time() to authenticated;

notify pgrst, 'reload schema';

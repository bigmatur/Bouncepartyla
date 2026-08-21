-- 047_staff_time_breaks_and_my_history.sql
--
-- Fixes:
-- 1. Break actions resolve the current shift by auth user, profile, or driver.
-- 2. My Time reads its state through one canonical RPC instead of mixed
--    direct-table/RLS fallbacks.
-- 3. Completed shifts remain visible in My Time history.

create or replace function public.start_my_staff_break()
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
  v_break_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.auth_user_id = v_user_id
    and coalesce(p.is_active, true) = true
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
        and lower(trim(rd.account_email)) =
            lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
  order by rd.created_at asc nulls last, rd.id
  limit 1;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.clock_out_at is null
    and (
      e.auth_user_id = v_user_id
      or (v_profile_id is not null and e.profile_id = v_profile_id)
      or (v_driver_id is not null and e.route_driver_id = v_driver_id)
    )
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
  v_profile_id uuid;
  v_driver_id uuid;
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.auth_user_id = v_user_id
    and coalesce(p.is_active, true) = true
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
        and lower(trim(rd.account_email)) =
            lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
  order by rd.created_at asc nulls last, rd.id
  limit 1;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.clock_out_at is null
    and (
      e.auth_user_id = v_user_id
      or (v_profile_id is not null and e.profile_id = v_profile_id)
      or (v_driver_id is not null and e.route_driver_id = v_driver_id)
    )
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
  v_profile_id uuid;
  v_driver_id uuid;
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.auth_user_id = v_user_id
    and coalesce(p.is_active, true) = true
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
        and lower(trim(rd.account_email)) =
            lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
  order by rd.created_at asc nulls last, rd.id
  limit 1;

  select e.id
    into v_entry_id
  from public.staff_time_entries e
  where e.clock_out_at is null
    and (
      e.auth_user_id = v_user_id
      or (v_profile_id is not null and e.profile_id = v_profile_id)
      or (v_driver_id is not null and e.route_driver_id = v_driver_id)
    )
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


create or replace function public.get_my_staff_time_dashboard(
  p_limit integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_driver_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.auth_user_id = v_user_id
    and coalesce(p.is_active, true) = true
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
        and lower(trim(rd.account_email)) =
            lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
  order by rd.created_at asc nulls last, rd.id
  limit 1;

  with mine as (
    select e.*
    from public.staff_time_entries e
    where
      e.auth_user_id = v_user_id
      or (v_profile_id is not null and e.profile_id = v_profile_id)
      or (v_driver_id is not null and e.route_driver_id = v_driver_id)
  ),
  enriched as (
    select
      e.id,
      e.work_date,
      e.clock_in_at,
      e.clock_out_at,
      e.source,
      e.status,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', b.id,
              'started_at', b.started_at,
              'ended_at', b.ended_at,
              'break_type', b.break_type
            )
            order by b.started_at
          )
          from public.staff_time_breaks b
          where b.time_entry_id = e.id
        ),
        '[]'::jsonb
      ) as breaks,
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
      ) as break_minutes
    from mine e
  )
  select jsonb_build_object(
    'current',
    (
      select jsonb_build_object(
        'id', x.id,
        'work_date', x.work_date,
        'clock_in_at', x.clock_in_at,
        'clock_out_at', x.clock_out_at,
        'source', x.source,
        'status', x.status,
        'staff_time_breaks', x.breaks
      )
      from enriched x
      where x.clock_out_at is null
      order by x.clock_in_at desc
      limit 1
    ),
    'history',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', h.id,
            'work_date', h.work_date,
            'clock_in_at', h.clock_in_at,
            'clock_out_at', h.clock_out_at,
            'source', h.source,
            'status', h.status,
            'break_minutes', h.break_minutes
          )
          order by h.clock_in_at desc
        )
        from (
          select *
          from enriched
          where clock_out_at is not null
          order by clock_in_at desc
          limit greatest(1, least(coalesce(p_limit, 14), 60))
        ) h
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return coalesce(
    v_result,
    jsonb_build_object('current', null, 'history', '[]'::jsonb)
  );
end;
$$;


revoke all on function public.start_my_staff_break() from public;
revoke all on function public.resume_my_staff_work() from public;
revoke all on function public.finish_my_staff_time() from public;
revoke all on function public.get_my_staff_time_dashboard(integer) from public;

grant execute on function public.start_my_staff_break() to authenticated;
grant execute on function public.resume_my_staff_work() to authenticated;
grant execute on function public.finish_my_staff_time() to authenticated;
grant execute on function public.get_my_staff_time_dashboard(integer) to authenticated;

notify pgrst, 'reload schema';

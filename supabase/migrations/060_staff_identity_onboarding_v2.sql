-- 060_staff_identity_onboarding_v2.sql
-- Bounce Party LA Booking System
-- Atomic Staff / Employees onboarding for the confirmed live schema.
--
-- Goals:
--   * never write an unverified auth_user_id to route_drivers;
--   * save route_drivers + profile identity + Working Time backfill in one transaction;
--   * use only confirmed live columns;
--   * preserve access metadata in route_drivers.notes (handled by application code);
--   * do not silently convert a customer login into a staff login.

create or replace function public.admin_save_staff_member(
  p_route_driver_id uuid default null,
  p_name text default null,
  p_phone text default null,
  p_account_email text default null,
  p_explicit_auth_user_id uuid default null,
  p_color text default '#23313f',
  p_sort_order integer default 100,
  p_notes text default null,
  p_role text default 'driver'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_role text;
  v_driver_id uuid;
  v_existing_driver_auth uuid;
  v_auth_user_id uuid;
  v_entry_auth_ids uuid[];
  v_profile_id uuid;
  v_profile_role text;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_account_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_role text := coalesce(nullif(btrim(coalesce(p_role, '')), ''), 'driver');
  v_first_name text;
  v_last_name text;
  v_now timestamptz := now();
begin
  select pr.role
    into v_caller_role
  from public.profiles pr
  where pr.auth_user_id = auth.uid()
    and pr.is_active = true
  limit 1;

  if v_caller_role is null or v_caller_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Access denied: staff management requires admin access.';
  end if;

  if v_name is null then
    raise exception 'Name is required.';
  end if;

  -- Lock an existing staff card before resolving identity.
  if p_route_driver_id is not null then
    select rd.id, rd.auth_user_id
      into v_driver_id, v_existing_driver_auth
    from public.route_drivers rd
    where rd.id = p_route_driver_id
      and rd.deleted_at is null
    for update;

    if not found then
      raise exception 'Staff member not found.';
    end if;
  end if;

  -- 1) Explicit auth id wins, but only if it really exists.
  if p_explicit_auth_user_id is not null then
    if not exists (
      select 1 from auth.users u where u.id = p_explicit_auth_user_id
    ) then
      raise exception 'Auth user id does not exist in Supabase Auth.';
    end if;

    if v_existing_driver_auth is not null
       and v_existing_driver_auth <> p_explicit_auth_user_id
       and exists (select 1 from auth.users u where u.id = v_existing_driver_auth) then
      raise exception 'This staff member is already linked to another valid Auth account. Re-linking requires an explicit identity migration.';
    end if;

    v_auth_user_id := p_explicit_auth_user_id;
  end if;

  -- 2) Preserve an existing valid driver link when editing.
  if v_auth_user_id is null and v_existing_driver_auth is not null then
    if exists (select 1 from auth.users u where u.id = v_existing_driver_auth) then
      v_auth_user_id := v_existing_driver_auth;
    end if;
  end if;

  -- 3) Existing Working Time rows are a strong identity signal when unique.
  if v_auth_user_id is null and p_route_driver_id is not null then
    select array_agg(x.auth_user_id order by x.auth_user_id::text)
      into v_entry_auth_ids
    from (
      select distinct ste.auth_user_id
      from public.staff_time_entries ste
      where ste.route_driver_id = p_route_driver_id
        and ste.auth_user_id is not null
    ) x;

    if coalesce(array_length(v_entry_auth_ids, 1), 0) = 1 then
      if exists (select 1 from auth.users u where u.id = v_entry_auth_ids[1]) then
        v_auth_user_id := v_entry_auth_ids[1];
      end if;
    end if;
  end if;

  -- 4) Finally, match an existing Supabase Auth account by email.
  if v_auth_user_id is null and v_email is not null then
    select u.id
      into v_auth_user_id
    from auth.users u
    where lower(btrim(u.email)) = v_email
    order by u.created_at asc
    limit 1;
  end if;

  -- Once identity is resolved, Account email is the actual Supabase Auth login email.
  -- This prevents a staff card from displaying/resetting a different account by mistake.
  if v_auth_user_id is not null then
    select lower(btrim(u.email))
      into v_email
    from auth.users u
    where u.id = v_auth_user_id;
  end if;

  -- A login may control only one active staff/driver card.
  if v_auth_user_id is not null and exists (
    select 1
    from public.route_drivers rd
    where rd.auth_user_id = v_auth_user_id
      and (p_route_driver_id is null or rd.id <> p_route_driver_id)
      and rd.active = true
      and rd.deleted_at is null
  ) then
    raise exception 'This Auth account is already linked to another active staff member.';
  end if;

  -- Validate the target profile before changing route_drivers, so any error leaves no partial save.
  if v_auth_user_id is not null then
    select pr.id, pr.role
      into v_profile_id, v_profile_role
    from public.profiles pr
    where pr.auth_user_id = v_auth_user_id
    limit 1;

    if v_profile_id is not null
       and v_profile_role = 'customer'
       and v_role <> 'customer' then
      raise exception 'This Auth account belongs to a customer profile. Use a separate staff login or migrate that account explicitly.';
    end if;
  end if;

  -- Save the route/staff card only after all identity validation succeeded.
  if p_route_driver_id is null then
    insert into public.route_drivers (
      name,
      color,
      phone,
      active,
      sort_order,
      account_email,
      auth_user_id,
      notes,
      deleted_at,
      created_at,
      updated_at
    ) values (
      v_name,
      coalesce(nullif(btrim(coalesce(p_color, '')), ''), '#23313f'),
      v_phone,
      true,
      coalesce(p_sort_order, 100),
      v_email,
      v_auth_user_id,
      p_notes,
      null,
      v_now,
      v_now
    )
    returning id into v_driver_id;
  else
    update public.route_drivers
    set name = v_name,
        color = coalesce(nullif(btrim(coalesce(p_color, '')), ''), color),
        phone = v_phone,
        active = true,
        sort_order = coalesce(p_sort_order, sort_order),
        account_email = v_email,
        auth_user_id = v_auth_user_id,
        notes = p_notes,
        deleted_at = null,
        updated_at = v_now
    where id = p_route_driver_id
    returning id into v_driver_id;
  end if;

  -- No Auth account yet is a valid onboarding state. The route card remains usable.
  if v_auth_user_id is null then
    return jsonb_build_object(
      'saved', true,
      'linked', false,
      'route_driver_id', v_driver_id,
      'auth_user_id', null,
      'profile_id', null,
      'reason', 'no_auth_account'
    );
  end if;

  -- Split display name into the live profile schema's first_name / last_name fields.
  v_first_name := split_part(v_name, ' ', 1);
  if position(' ' in v_name) > 0 then
    v_last_name := nullif(btrim(substr(v_name, position(' ' in v_name) + 1)), '');
  else
    v_last_name := null;
  end if;

  if v_profile_id is null then
    insert into public.profiles (
      auth_user_id,
      role,
      first_name,
      last_name,
      phone,
      is_active,
      created_at,
      updated_at
    ) values (
      v_auth_user_id,
      v_role,
      v_first_name,
      v_last_name,
      v_phone,
      true,
      v_now,
      v_now
    )
    returning id into v_profile_id;
  else
    update public.profiles
    set role = case
          when role = 'super_admin' and v_role <> 'super_admin' then role
          else v_role
        end,
        first_name = coalesce(v_first_name, first_name),
        last_name = coalesce(v_last_name, last_name),
        phone = coalesce(v_phone, phone),
        is_active = true,
        updated_at = v_now
    where id = v_profile_id;
  end if;

  -- Bring every old/new Working Time row for this identity onto the same profile.
  update public.staff_time_entries
  set auth_user_id = coalesce(auth_user_id, v_auth_user_id),
      profile_id = v_profile_id,
      updated_at = v_now
  where route_driver_id = v_driver_id
     or auth_user_id = v_auth_user_id
     or profile_id = v_profile_id;

  return jsonb_build_object(
    'saved', true,
    'linked', true,
    'route_driver_id', v_driver_id,
    'auth_user_id', v_auth_user_id,
    'profile_id', v_profile_id,
    'role', v_role
  );
end;
$$;

revoke all on function public.admin_save_staff_member(uuid, text, text, text, uuid, text, integer, text, text) from public;
grant execute on function public.admin_save_staff_member(uuid, text, text, text, uuid, text, integer, text, text) to authenticated;

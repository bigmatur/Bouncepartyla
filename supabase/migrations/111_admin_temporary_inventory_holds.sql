begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.current_user_can_create_bookings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role in ('super_admin', 'admin', 'manager')
  );
$$;

revoke all on function public.current_user_can_create_bookings() from public;
grant execute on function public.current_user_can_create_bookings() to authenticated;

alter table public.inventory_reservations
  add column if not exists hold_expires_at timestamptz,
  add column if not exists hold_attempt_id uuid,
  add column if not exists hold_requirement_key text;

create table if not exists public.booking_inventory_requirements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_item_id uuid not null references public.booking_items(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  quantity numeric(12,2) not null check (quantity > 0),
  reserved_from timestamptz not null,
  reserved_until timestamptz not null,
  requirement_key text not null,
  requirement_type text not null check (requirement_type in ('product', 'modifier')),
  product_id uuid,
  modifier_group_id uuid,
  modifier_option_id uuid,
  inventory_behavior text not null default 'reusable' check (inventory_behavior in ('reusable', 'consumable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, booking_item_id, requirement_key),
  check (reserved_until > reserved_from)
);

create table if not exists public.booking_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  attempt_kind text not null check (attempt_kind in ('admin_initial_hold', 'customer_temporary_deposit')),
  state text not null check (state in ('holding', 'stripe_bound', 'released', 'expired', 'finalized', 'failed')),
  hold_expires_at timestamptz not null,
  stripe_checkout_session_id text unique,
  stripe_expires_at timestamptz,
  released_at timestamptz,
  finalized_at timestamptz,
  failure_reason text,
  created_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_reservations
  add constraint inventory_reservations_hold_attempt_fk
  foreign key (hold_attempt_id)
  references public.booking_checkout_attempts(id)
  on delete set null;

create index if not exists idx_booking_inventory_requirements_booking
  on public.booking_inventory_requirements(booking_id);

create index if not exists idx_booking_inventory_requirements_inventory_item
  on public.booking_inventory_requirements(inventory_item_id);

create index if not exists idx_booking_checkout_attempts_booking
  on public.booking_checkout_attempts(booking_id, created_at desc);

create index if not exists idx_booking_checkout_attempts_state
  on public.booking_checkout_attempts(state);

create index if not exists idx_inventory_reservations_hold_attempt
  on public.inventory_reservations(hold_attempt_id)
  where hold_attempt_id is not null;

create index if not exists idx_inventory_reservations_hold_expiry
  on public.inventory_reservations(hold_expires_at)
  where hold_expires_at is not null and status = 'reserved';

alter table public.booking_inventory_requirements enable row level security;
alter table public.booking_checkout_attempts enable row level security;

create or replace function public.set_booking_inventory_requirements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_booking_checkout_attempts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_booking_inventory_requirements_updated_at on public.booking_inventory_requirements;
create trigger trg_booking_inventory_requirements_updated_at
before update on public.booking_inventory_requirements
for each row
execute function public.set_booking_inventory_requirements_updated_at();

drop trigger if exists trg_booking_checkout_attempts_updated_at on public.booking_checkout_attempts;
create trigger trg_booking_checkout_attempts_updated_at
before update on public.booking_checkout_attempts
for each row
execute function public.set_booking_checkout_attempts_updated_at();

create policy booking_inventory_requirements_manage_booking_staff
on public.booking_inventory_requirements
for all
to authenticated
using (public.current_user_can_create_bookings())
with check (public.current_user_can_create_bookings());

create policy booking_checkout_attempts_manage_booking_staff
on public.booking_checkout_attempts
for all
to authenticated
using (public.current_user_can_create_bookings())
with check (public.current_user_can_create_bookings());

create or replace function public.current_user_owns_booking(
  p_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.customers c
      on c.id = b.customer_id
    where b.id = p_booking_id
      and c.auth_user_id = auth.uid()
  );
$$;

create or replace function public.current_user_has_active_completion_session(
  p_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.booking_completion_sessions s
    where s.booking_id = p_booking_id
      and s.revoked_at is null
      and s.completed_at is null
      and s.expires_at > now()
      and lower(coalesce(s.customer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.cleanup_expired_temporary_inventory_holds(
  p_inventory_item_ids uuid[] default null,
  p_skip_attempt_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released integer := 0;
begin
  if p_inventory_item_ids is null
     and not (
       auth.role() = 'service_role'
       or public.current_user_can_create_bookings()
     ) then
    return 0;
  end if;

  with updated as (
    update public.inventory_reservations ir
    set status = 'released',
        updated_at = now(),
        notes = trim(both from concat_ws(' | ', nullif(ir.notes, ''), 'temporary hold expired'))
    where ir.status = 'reserved'
      and ir.hold_expires_at is not null
      and ir.hold_expires_at <= now()
      and (
        p_inventory_item_ids is null
        or ir.inventory_item_id = any(p_inventory_item_ids)
      )
      and (
        p_skip_attempt_ids is null
        or ir.hold_attempt_id is null
        or not (ir.hold_attempt_id = any(p_skip_attempt_ids))
      )
    returning ir.hold_attempt_id
  ),
  attempt_updates as (
    update public.booking_checkout_attempts a
    set state = case when a.state in ('holding', 'stripe_bound') then 'expired' else a.state end,
        released_at = case when a.state in ('holding', 'stripe_bound') then now() else a.released_at end,
        updated_at = now()
    where a.id in (select distinct hold_attempt_id from updated where hold_attempt_id is not null)
    returning 1
  )
  select count(*) into v_released from updated;

  return v_released;
end;
$$;

grant execute on function public.cleanup_expired_temporary_inventory_holds(uuid[], uuid[]) to authenticated;
grant execute on function public.cleanup_expired_temporary_inventory_holds(uuid[], uuid[]) to service_role;

create or replace function public.acquire_booking_temporary_inventory_hold(
  p_booking_id uuid,
  p_attempt_kind text default 'admin_initial_hold',
  p_hold_minutes integer default 60,
  p_require_active_completion_session boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_hold_expires_at timestamptz;
  v_now timestamptz := now();
  v_attempt_id uuid := gen_random_uuid();
  v_authorized boolean := false;
  v_requires_customer_flow boolean := false;
  v_replace_attempt_ids uuid[];
  v_item_ids uuid[];
  v_requirement record;
  v_units_exist boolean;
  v_baseline numeric(12,2);
  v_used numeric(12,2);
  v_planned numeric(12,2);
  v_missing jsonb := '[]'::jsonb;
  v_unit_id uuid;
  v_int_quantity integer;
  v_reuse_attempt public.booking_checkout_attempts%rowtype;
  v_blocking_stripe_attempt public.booking_checkout_attempts%rowtype;
begin
  if p_booking_id is null then
    return jsonb_build_object('status', 'booking_not_found');
  end if;

  if p_attempt_kind not in ('admin_initial_hold', 'customer_temporary_deposit') then
    return jsonb_build_object('status', 'invalid_attempt_kind');
  end if;

  if p_hold_minutes is null or p_hold_minutes <= 0 then
    return jsonb_build_object('status', 'invalid_hold_duration');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('status', 'booking_not_found');
  end if;

  v_requires_customer_flow := p_attempt_kind = 'customer_temporary_deposit';

  if v_requires_customer_flow then
    v_authorized := public.current_user_owns_booking(p_booking_id);

    if not v_authorized then
      return jsonb_build_object('status', 'forbidden');
    end if;

    if p_require_active_completion_session and not public.current_user_has_active_completion_session(p_booking_id) then
      return jsonb_build_object('status', 'completion_session_invalid');
    end if;
  else
    v_authorized := public.current_user_can_create_bookings();

    if not v_authorized then
      return jsonb_build_object('status', 'forbidden');
    end if;
  end if;

  if coalesce(v_booking.status::text, '') <> 'pending_deposit' then
    return jsonb_build_object(
      'status', 'booking_not_pending_deposit',
      'booking_status', coalesce(v_booking.status::text, '')
    );
  end if;

  select array_agg(distinct bir.inventory_item_id order by bir.inventory_item_id)
  into v_item_ids
  from public.booking_inventory_requirements bir
  where bir.booking_id = p_booking_id;

  if v_item_ids is null or array_length(v_item_ids, 1) is null then
    return jsonb_build_object('status', 'requirements_missing');
  end if;

  perform 1
  from public.inventory_items ii
  where ii.id = any(v_item_ids)
  order by ii.id
  for update;

  perform public.cleanup_expired_temporary_inventory_holds(v_item_ids, null);

  select a.*
  into v_reuse_attempt
  from public.booking_checkout_attempts a
  where a.booking_id = p_booking_id
    and a.state in ('holding', 'stripe_bound')
    and a.hold_expires_at > now()
    and not exists (
      select 1
      from public.booking_inventory_requirements bir
      where bir.booking_id = p_booking_id
        and coalesce(
          (
            select sum(greatest(coalesce(ir.quantity, 0), 1))
            from public.inventory_reservations ir
            where ir.hold_attempt_id = a.id
              and ir.booking_item_id = bir.booking_item_id
              and ir.inventory_item_id = bir.inventory_item_id
              and ir.hold_requirement_key = bir.requirement_key
              and ir.status = 'reserved'
              and ir.hold_expires_at > now()
              and tstzrange(ir.reserved_from, ir.reserved_until, '[)')
                  && tstzrange(bir.reserved_from, bir.reserved_until, '[)')
          ),
          0
        ) < bir.quantity
    )
  order by a.created_at desc
  limit 1
  for update;

  if found then
    if v_reuse_attempt.state = 'holding' then
      v_hold_expires_at := greatest(
        v_reuse_attempt.hold_expires_at,
        now() + make_interval(mins => p_hold_minutes)
      );

      update public.booking_checkout_attempts
      set attempt_kind = case
            when p_attempt_kind = 'customer_temporary_deposit'
              then 'customer_temporary_deposit'
            else attempt_kind
          end,
          hold_expires_at = v_hold_expires_at,
          updated_at = now()
      where id = v_reuse_attempt.id;

      update public.inventory_reservations ir
      set hold_expires_at = v_hold_expires_at,
          updated_at = now()
      where ir.hold_attempt_id = v_reuse_attempt.id
        and ir.status = 'reserved'
        and ir.hold_requirement_key is not null
        and coalesce(ir.hold_expires_at, '-infinity'::timestamptz) < v_hold_expires_at;
    else
      v_hold_expires_at := v_reuse_attempt.hold_expires_at;
    end if;

    return jsonb_build_object(
      'status', 'ok',
      'attempt_id', v_reuse_attempt.id,
      'hold_expires_at', v_hold_expires_at,
      'reused', true,
      'stripe_checkout_session_id', v_reuse_attempt.stripe_checkout_session_id
    );
  end if;

  select a.*
  into v_blocking_stripe_attempt
  from public.booking_checkout_attempts a
  where a.booking_id = p_booking_id
    and a.state = 'stripe_bound'
    and a.hold_expires_at > now()
  order by a.created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'status', 'stripe_attempt_active',
      'attempt_id', v_blocking_stripe_attempt.id,
      'stripe_checkout_session_id', v_blocking_stripe_attempt.stripe_checkout_session_id,
      'hold_expires_at', v_blocking_stripe_attempt.hold_expires_at
    );
  end if;

  select array_agg(a.id)
  into v_replace_attempt_ids
  from public.booking_checkout_attempts a
  where a.booking_id = p_booking_id
    and a.state = 'holding'
    and a.hold_expires_at > now();

  create temporary table if not exists pg_temp.tmp_hold_allocations (
    booking_item_id uuid not null,
    inventory_item_id uuid not null,
    inventory_unit_id uuid,
    quantity numeric(12,2) not null,
    reserved_from timestamptz not null,
    reserved_until timestamptz not null,
    requirement_key text not null,
    inventory_behavior text not null
  ) on commit drop;

  truncate table pg_temp.tmp_hold_allocations;

  for v_requirement in
    select
      bir.booking_item_id,
      bir.inventory_item_id,
      bir.quantity,
      bir.reserved_from,
      bir.reserved_until,
      bir.requirement_key,
      bir.inventory_behavior
    from public.booking_inventory_requirements bir
    where bir.booking_id = p_booking_id
    order by bir.inventory_item_id, bir.requirement_key
  loop
    select exists (
      select 1
      from public.inventory_units iu
      where iu.inventory_item_id = v_requirement.inventory_item_id
        and iu.retired_at is null
        and iu.status <> 'retired'
    )
    into v_units_exist;

    if v_units_exist then
      if v_requirement.quantity <> trunc(v_requirement.quantity) then
        v_missing := v_missing || jsonb_build_object(
          'requirement_key', v_requirement.requirement_key,
          'inventory_item_id', v_requirement.inventory_item_id,
          'reason', 'non_integer_quantity_for_serialized'
        );
        continue;
      end if;

      v_int_quantity := greatest(1, v_requirement.quantity::integer);

      for i in 1..v_int_quantity loop
        select iu.id
        into v_unit_id
        from public.inventory_units iu
        where iu.inventory_item_id = v_requirement.inventory_item_id
          and iu.retired_at is null
          and iu.status in ('available', 'returned')
          and not exists (
            select 1
            from pg_temp.tmp_hold_allocations ta
            where ta.inventory_unit_id = iu.id
          )
          and not exists (
            select 1
            from public.inventory_reservations ir
            where ir.inventory_unit_id = iu.id
              and ir.status in ('reserved', 'picked', 'loaded', 'delivered', 'installed')
              and tstzrange(ir.reserved_from, ir.reserved_until, '[)')
                  && tstzrange(v_requirement.reserved_from, v_requirement.reserved_until, '[)')
              and (
                v_replace_attempt_ids is null
                or ir.hold_attempt_id is null
                or not (ir.hold_attempt_id = any(v_replace_attempt_ids))
              )
          )
        order by iu.id
        for update of iu skip locked
        limit 1;

        if v_unit_id is null then
          v_missing := v_missing || jsonb_build_object(
            'requirement_key', v_requirement.requirement_key,
            'inventory_item_id', v_requirement.inventory_item_id,
            'reason', 'serialized_units_unavailable'
          );
          exit;
        end if;

        insert into pg_temp.tmp_hold_allocations (
          booking_item_id,
          inventory_item_id,
          inventory_unit_id,
          quantity,
          reserved_from,
          reserved_until,
          requirement_key,
          inventory_behavior
        )
        values (
          v_requirement.booking_item_id,
          v_requirement.inventory_item_id,
          v_unit_id,
          1,
          v_requirement.reserved_from,
          v_requirement.reserved_until,
          v_requirement.requirement_key,
          v_requirement.inventory_behavior
        );
      end loop;
    else
      select
        case
          when coalesce(ii.quantity_on_hand, 0) > 0 or coalesce(ii.quantity_available, 0) > 0
            then greatest(coalesce(ii.quantity_on_hand, 0), coalesce(ii.quantity_available, 0))
          else greatest(coalesce(ii.total_quantity, 0), coalesce(ii.quantity_on_hand, 0), coalesce(ii.quantity_available, 0))
        end
      into v_baseline
      from public.inventory_items ii
      where ii.id = v_requirement.inventory_item_id;

      select coalesce(sum(greatest(coalesce(ir.quantity, 0), 1)), 0)
      into v_used
      from public.inventory_reservations ir
      where ir.inventory_item_id = v_requirement.inventory_item_id
        and ir.inventory_unit_id is null
        and ir.status in ('reserved', 'picked', 'loaded', 'delivered', 'installed')
        and tstzrange(ir.reserved_from, ir.reserved_until, '[)')
            && tstzrange(v_requirement.reserved_from, v_requirement.reserved_until, '[)')
        and (
          v_replace_attempt_ids is null
          or ir.hold_attempt_id is null
          or not (ir.hold_attempt_id = any(v_replace_attempt_ids))
        );

      select coalesce(sum(ta.quantity), 0)
      into v_planned
      from pg_temp.tmp_hold_allocations ta
      where ta.inventory_item_id = v_requirement.inventory_item_id
        and ta.inventory_unit_id is null
        and tstzrange(ta.reserved_from, ta.reserved_until, '[)')
            && tstzrange(v_requirement.reserved_from, v_requirement.reserved_until, '[)');

      if coalesce(v_baseline, 0) - coalesce(v_used, 0) - coalesce(v_planned, 0) < v_requirement.quantity then
        v_missing := v_missing || jsonb_build_object(
          'requirement_key', v_requirement.requirement_key,
          'inventory_item_id', v_requirement.inventory_item_id,
          'reason', 'quantity_unavailable',
          'required', v_requirement.quantity
        );
      else
        insert into pg_temp.tmp_hold_allocations (
          booking_item_id,
          inventory_item_id,
          inventory_unit_id,
          quantity,
          reserved_from,
          reserved_until,
          requirement_key,
          inventory_behavior
        )
        values (
          v_requirement.booking_item_id,
          v_requirement.inventory_item_id,
          null,
          v_requirement.quantity,
          v_requirement.reserved_from,
          v_requirement.reserved_until,
          v_requirement.requirement_key,
          v_requirement.inventory_behavior
        );
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_missing) > 0 then
    return jsonb_build_object(
      'status', 'inventory_unavailable',
      'missing_requirements', v_missing
    );
  end if;

  v_hold_expires_at := now() + make_interval(mins => p_hold_minutes);

  insert into public.booking_checkout_attempts (
    id,
    booking_id,
    attempt_kind,
    state,
    hold_expires_at,
    created_by_auth_user_id
  )
  values (
    v_attempt_id,
    p_booking_id,
    p_attempt_kind,
    'holding',
    v_hold_expires_at,
    auth.uid()
  );

  if v_replace_attempt_ids is not null and array_length(v_replace_attempt_ids, 1) is not null then
    update public.inventory_reservations ir
    set status = 'released',
        updated_at = now(),
        notes = trim(both from concat_ws(' | ', nullif(ir.notes, ''), 'temporary hold replaced'))
    where ir.hold_attempt_id = any(v_replace_attempt_ids)
      and ir.status = 'reserved'
      and ir.hold_expires_at is not null;

    update public.booking_checkout_attempts a
    set state = 'released',
        released_at = now(),
        updated_at = now()
    where a.id = any(v_replace_attempt_ids)
      and a.state = 'holding';
  end if;

  insert into public.inventory_reservations (
    booking_id,
    booking_item_id,
    inventory_item_id,
    inventory_unit_id,
    quantity,
    status,
    inventory_behavior,
    reserved_from,
    reserved_until,
    hold_expires_at,
    hold_attempt_id,
    hold_requirement_key,
    notes,
    created_at,
    updated_at
  )
  select
    p_booking_id,
    ta.booking_item_id,
    ta.inventory_item_id,
    ta.inventory_unit_id,
    ta.quantity,
    'reserved',
    ta.inventory_behavior,
    ta.reserved_from,
    ta.reserved_until,
    v_hold_expires_at,
    v_attempt_id,
    ta.requirement_key,
    case
      when p_attempt_kind = 'admin_initial_hold'
        then 'Admin send-to-customer temporary hold'
      else 'Customer checkout temporary hold'
    end,
    v_now,
    v_now
  from pg_temp.tmp_hold_allocations ta;

  return jsonb_build_object(
    'status', 'ok',
    'attempt_id', v_attempt_id,
    'hold_expires_at', v_hold_expires_at
  );
exception
  when exclusion_violation then
    return jsonb_build_object(
      'status', 'inventory_unavailable',
      'missing_requirements', jsonb_build_array(
        jsonb_build_object('reason', 'serialized_conflict_race')
      )
    );
end;
$$;

grant execute on function public.acquire_booking_temporary_inventory_hold(uuid, text, integer, boolean)
  to authenticated;
grant execute on function public.acquire_booking_temporary_inventory_hold(uuid, text, integer, boolean)
  to service_role;

create or replace function public.bind_booking_checkout_attempt_to_stripe_session(
  p_booking_id uuid,
  p_attempt_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.booking_checkout_attempts%rowtype;
  v_authorized boolean := false;
  v_effective_hold_expires_at timestamptz;
begin
  if p_booking_id is null or p_attempt_id is null or nullif(trim(coalesce(p_stripe_checkout_session_id, '')), '') is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  v_authorized := public.current_user_can_create_bookings()
    or (
      public.current_user_owns_booking(p_booking_id)
      and public.current_user_has_active_completion_session(p_booking_id)
    );

  if not v_authorized then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select *
  into v_attempt
  from public.booking_checkout_attempts a
  where a.id = p_attempt_id
    and a.booking_id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('status', 'attempt_not_found');
  end if;

  if v_attempt.state not in ('holding', 'stripe_bound') then
    return jsonb_build_object('status', 'attempt_not_active');
  end if;

  if v_attempt.hold_expires_at <= now() then
    perform public.release_booking_checkout_attempt_hold(
      p_booking_id,
      p_attempt_id,
      v_attempt.stripe_checkout_session_id,
      'attempt_expired_before_stripe_bind'
    );

    return jsonb_build_object('status', 'attempt_expired');
  end if;

  if v_attempt.stripe_checkout_session_id is not null
     and v_attempt.stripe_checkout_session_id <> p_stripe_checkout_session_id then
    return jsonb_build_object('status', 'attempt_session_mismatch');
  end if;

  if v_attempt.attempt_kind = 'customer_temporary_deposit'
     and p_stripe_expires_at is null then
    return jsonb_build_object('status', 'stripe_expiry_required');
  end if;

  v_effective_hold_expires_at := greatest(
    v_attempt.hold_expires_at,
    coalesce(p_stripe_expires_at + interval '10 minutes', v_attempt.hold_expires_at)
  );

  update public.booking_checkout_attempts
  set stripe_checkout_session_id = p_stripe_checkout_session_id,
      stripe_expires_at = p_stripe_expires_at,
      hold_expires_at = v_effective_hold_expires_at,
      state = 'stripe_bound',
      updated_at = now()
  where id = p_attempt_id;

  update public.inventory_reservations ir
  set hold_expires_at = greatest(coalesce(ir.hold_expires_at, now()), v_effective_hold_expires_at),
      updated_at = now()
  where ir.hold_attempt_id = p_attempt_id
    and ir.status = 'reserved';

  return jsonb_build_object(
    'status', 'ok',
    'attempt_id', p_attempt_id,
    'stripe_checkout_session_id', p_stripe_checkout_session_id,
    'hold_expires_at', v_effective_hold_expires_at
  );
end;
$$;

grant execute on function public.bind_booking_checkout_attempt_to_stripe_session(uuid, uuid, text, timestamptz)
  to authenticated;
grant execute on function public.bind_booking_checkout_attempt_to_stripe_session(uuid, uuid, text, timestamptz)
  to service_role;

create or replace function public.release_booking_checkout_attempt_hold(
  p_booking_id uuid,
  p_attempt_id uuid,
  p_stripe_checkout_session_id text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.booking_checkout_attempts%rowtype;
  v_released_count integer := 0;
  v_authorized boolean := false;
begin
  if p_booking_id is null or p_attempt_id is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  v_authorized := auth.role() = 'service_role'
    or public.current_user_can_create_bookings()
    or (
      public.current_user_owns_booking(p_booking_id)
      and public.current_user_has_active_completion_session(p_booking_id)
    );

  if not v_authorized then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select *
  into v_attempt
  from public.booking_checkout_attempts a
  where a.id = p_attempt_id
    and a.booking_id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('status', 'attempt_not_found', 'released_count', 0);
  end if;

  if p_stripe_checkout_session_id is not null
     and v_attempt.stripe_checkout_session_id is not null
     and v_attempt.stripe_checkout_session_id <> p_stripe_checkout_session_id then
    return jsonb_build_object('status', 'stale_session_noop', 'released_count', 0);
  end if;

  with released as (
    update public.inventory_reservations ir
    set status = 'released',
        updated_at = now(),
        notes = trim(both from concat_ws(' | ', nullif(ir.notes, ''), coalesce(p_reason, 'temporary hold released')))
    where ir.hold_attempt_id = p_attempt_id
      and ir.status = 'reserved'
      and ir.hold_expires_at is not null
    returning 1
  )
  select count(*) into v_released_count from released;

  update public.booking_checkout_attempts
  set state = 'released',
      released_at = now(),
      updated_at = now()
  where id = p_attempt_id
    and state in ('holding', 'stripe_bound');

  return jsonb_build_object(
    'status', 'ok',
    'released_count', v_released_count,
    'attempt_id', p_attempt_id
  );
end;
$$;

grant execute on function public.release_booking_checkout_attempt_hold(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.release_booking_checkout_attempt_hold(uuid, uuid, text, text)
  to service_role;

create or replace function public.finalize_booking_after_temporary_checkout_attempt(
  p_booking_id uuid,
  p_attempt_id uuid,
  p_stripe_checkout_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_attempt public.booking_checkout_attempts%rowtype;
  v_item_ids uuid[];
  v_missing jsonb := '[]'::jsonb;
  v_requirement record;
  v_allocated numeric(12,2);
  v_finalize jsonb;
begin
  if p_booking_id is null or p_attempt_id is null then
    return jsonb_build_object('success', false, 'status', 'invalid_input');
  end if;

  if nullif(trim(coalesce(p_stripe_checkout_session_id, '')), '') is null then
    return jsonb_build_object('success', false, 'status', 'invalid_input');
  end if;

  select *
  into v_attempt
  from public.booking_checkout_attempts a
  where a.id = p_attempt_id
    and a.booking_id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'attempt_not_found');
  end if;

  if v_attempt.attempt_kind <> 'customer_temporary_deposit' then
    return jsonb_build_object('success', false, 'status', 'attempt_kind_invalid');
  end if;

  if v_attempt.state = 'finalized' then
    return jsonb_build_object(
      'success', true,
      'status', 'already_finalized',
      'booking_id', p_booking_id,
      'attempt_id', p_attempt_id
    );
  end if;

  if v_attempt.state <> 'stripe_bound' then
    return jsonb_build_object('success', false, 'status', 'attempt_not_stripe_bound');
  end if;

  if v_attempt.stripe_checkout_session_id is null
     or v_attempt.stripe_checkout_session_id <> p_stripe_checkout_session_id then
    return jsonb_build_object('success', false, 'status', 'attempt_session_mismatch');
  end if;

  select array_agg(distinct bir.inventory_item_id order by bir.inventory_item_id)
  into v_item_ids
  from public.booking_inventory_requirements bir
  where bir.booking_id = p_booking_id;

  if v_item_ids is null or array_length(v_item_ids, 1) is null then
    return jsonb_build_object('success', false, 'status', 'requirements_missing');
  end if;

  perform 1
  from public.inventory_items ii
  where ii.id = any(v_item_ids)
  order by ii.id
  for update;

  perform public.cleanup_expired_temporary_inventory_holds(v_item_ids, array[p_attempt_id]);

  for v_requirement in
    select
      bir.booking_item_id,
      bir.inventory_item_id,
      bir.requirement_key,
      bir.quantity,
      bir.reserved_from,
      bir.reserved_until
    from public.booking_inventory_requirements bir
    where bir.booking_id = p_booking_id
    order by bir.inventory_item_id, bir.requirement_key
  loop
    select coalesce(sum(greatest(coalesce(ir.quantity, 0), 1)), 0)
    into v_allocated
    from public.inventory_reservations ir
    where ir.hold_attempt_id = p_attempt_id
      and ir.booking_item_id = v_requirement.booking_item_id
      and ir.inventory_item_id = v_requirement.inventory_item_id
      and ir.hold_requirement_key = v_requirement.requirement_key
      and ir.status = 'reserved'
      and (ir.hold_expires_at is null or ir.hold_expires_at > now())
      and tstzrange(ir.reserved_from, ir.reserved_until, '[)')
          && tstzrange(v_requirement.reserved_from, v_requirement.reserved_until, '[)');

    if coalesce(v_allocated, 0) < v_requirement.quantity then
      v_missing := v_missing || jsonb_build_object(
        'requirement_key', v_requirement.requirement_key,
        'inventory_item_id', v_requirement.inventory_item_id,
        'required', v_requirement.quantity,
        'allocated', coalesce(v_allocated, 0)
      );
    end if;
  end loop;

  if jsonb_array_length(v_missing) > 0 then
    return jsonb_build_object(
      'success', false,
      'status', 'inventory_hold_missing_after_payment',
      'missing_requirements', v_missing
    );
  end if;

  v_finalize := public.finalize_booking_after_external_payment(p_booking_id);

  if coalesce((v_finalize ->> 'success')::boolean, false) is false
     or coalesce(v_finalize ->> 'status', '') <> 'confirmed' then
    return v_finalize;
  end if;

  update public.inventory_reservations ir
  set hold_expires_at = null,
      hold_attempt_id = null,
      hold_requirement_key = null,
      updated_at = now(),
      notes = trim(both from concat_ws(' | ', nullif(ir.notes, ''), 'temporary hold finalized'))
  where ir.hold_attempt_id = p_attempt_id
    and ir.status = 'reserved';

  update public.booking_checkout_attempts
  set state = 'finalized',
      finalized_at = now(),
      updated_at = now()
  where id = p_attempt_id;

  return jsonb_build_object(
    'success', true,
    'status', 'confirmed',
    'booking_id', p_booking_id,
    'attempt_id', p_attempt_id
  );
end;
$$;

revoke all on function public.finalize_booking_after_temporary_checkout_attempt(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.finalize_booking_after_temporary_checkout_attempt(uuid, uuid, text)
  to service_role;

create or replace function public.get_my_action_required_booking_hold_state(
  p_booking_ids uuid[] default null
)
returns table (
  booking_id uuid,
  has_active_hold boolean,
  hold_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with my_bookings as (
    select b.id
    from public.bookings b
    join public.customers c
      on c.id = b.customer_id
    where c.auth_user_id = auth.uid()
      and b.status = 'pending_deposit'
      and coalesce(b.booking_source, '') = 'admin'
      and (
        p_booking_ids is null
        or b.id = any(p_booking_ids)
      )
  ),
  active_attempts as (
    select a.id, a.booking_id, a.hold_expires_at
    from public.booking_checkout_attempts a
    join my_bookings mb on mb.id = a.booking_id
    where a.state in ('holding', 'stripe_bound')
      and a.hold_expires_at > now()
  ),
  coverage as (
    select
      aa.id as attempt_id,
      aa.booking_id,
      bool_and(
        coalesce(req_alloc.allocated, 0) >= req.quantity
      ) as covered
    from active_attempts aa
    join public.booking_inventory_requirements req
      on req.booking_id = aa.booking_id
    left join lateral (
      select coalesce(sum(greatest(coalesce(ir.quantity, 0), 1)), 0) as allocated
      from public.inventory_reservations ir
      where ir.hold_attempt_id = aa.id
        and ir.booking_item_id = req.booking_item_id
        and ir.inventory_item_id = req.inventory_item_id
        and ir.hold_requirement_key = req.requirement_key
        and ir.status = 'reserved'
        and ir.hold_expires_at > now()
        and tstzrange(ir.reserved_from, ir.reserved_until, '[)')
            && tstzrange(req.reserved_from, req.reserved_until, '[)')
    ) req_alloc on true
    group by aa.id, aa.booking_id
  ),
  valid_attempts as (
    select aa.booking_id, aa.hold_expires_at
    from active_attempts aa
    join coverage c
      on c.attempt_id = aa.id
     and c.covered = true
  )
  select
    mb.id as booking_id,
    max(va.hold_expires_at) is not null as has_active_hold,
    max(va.hold_expires_at) as hold_expires_at
  from my_bookings mb
  left join valid_attempts va
    on va.booking_id = mb.id
  group by mb.id;
$$;

revoke all on function public.get_my_action_required_booking_hold_state(uuid[])
  from public, anon;
grant execute on function public.get_my_action_required_booking_hold_state(uuid[])
  to authenticated;

commit;

begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.system_settings
  add column if not exists customer_booking_last_minute_enabled boolean not null default false,
  add column if not exists customer_booking_last_minute_value integer not null default 24 check (customer_booking_last_minute_value > 0),
  add column if not exists customer_booking_last_minute_unit text not null default 'hours' check (customer_booking_last_minute_unit in ('hours', 'days')),
  add column if not exists customer_booking_park_venue_limit_enabled boolean not null default false,
  add column if not exists customer_booking_park_venue_daily_limit integer not null default 0 check (customer_booking_park_venue_daily_limit >= 0);

alter table public.bookings
  add column if not exists customer_approval_state text,
  add column if not exists customer_approval_revision integer not null default 0,
  add column if not exists customer_approval_expires_at timestamptz,
  add column if not exists customer_approval_reasons text[] not null default '{}'::text[];

alter table public.booking_checkout_attempts
  add column if not exists approval_revision integer;

update public.bookings
set customer_approval_state = case
  when coalesce(booking_source, '') = 'customer_self_service' then 'not_required'
  else 'none'
end
where customer_approval_state is null;

alter table public.bookings
  alter column customer_approval_state set default 'none';

alter table public.bookings
  drop constraint if exists bookings_customer_approval_state_check;

alter table public.bookings
  add constraint bookings_customer_approval_state_check
  check (customer_approval_state in ('none', 'not_required', 'pending', 'approved', 'rejected', 'expired'));

create table if not exists public.customer_booking_approval_option_map (
  id uuid primary key default gen_random_uuid(),
  modifier_group_option_id uuid not null references public.modifier_group_options(id) on delete cascade,
  location_kind text not null check (location_kind in ('park', 'venue')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modifier_group_option_id)
);

create table if not exists public.customer_booking_approvals (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  revision integer not null default 1,
  state text not null check (state in ('pending', 'approved', 'rejected', 'expired', 'not_required')),
  reasons text[] not null default '{}'::text[],
  snapshot jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  requested_by_auth_user_id uuid,
  reviewed_at timestamptz,
  reviewed_by_auth_user_id uuid,
  customer_comment text,
  active_hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_booking_approval_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  revision integer not null,
  from_state text,
  to_state text not null,
  reasons text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  acted_by_auth_user_id uuid,
  acted_at timestamptz not null default now()
);

create table if not exists public.customer_booking_approval_day_locks (
  event_date date primary key,
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_booking_approval_map_active
  on public.customer_booking_approval_option_map(active, modifier_group_option_id);

create index if not exists idx_customer_booking_approvals_state
  on public.customer_booking_approvals(state, requested_at desc);

create index if not exists idx_customer_booking_approval_history_booking
  on public.customer_booking_approval_history(booking_id, acted_at desc);

create index if not exists idx_bookings_customer_approval_state
  on public.bookings(customer_approval_state, event_date);

create or replace function public.touch_customer_booking_approval_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_customer_booking_approval_option_map_updated_at on public.customer_booking_approval_option_map;
create trigger trg_customer_booking_approval_option_map_updated_at
before update on public.customer_booking_approval_option_map
for each row execute function public.touch_customer_booking_approval_updated_at();

drop trigger if exists trg_customer_booking_approvals_updated_at on public.customer_booking_approvals;
create trigger trg_customer_booking_approvals_updated_at
before update on public.customer_booking_approvals
for each row execute function public.touch_customer_booking_approval_updated_at();

alter table public.customer_booking_approval_option_map enable row level security;
alter table public.customer_booking_approvals enable row level security;
alter table public.customer_booking_approval_history enable row level security;
alter table public.customer_booking_approval_day_locks enable row level security;

create policy customer_booking_approval_option_map_staff_all
on public.customer_booking_approval_option_map
for all
using (public.current_user_can_create_bookings())
with check (public.current_user_can_create_bookings());

create policy customer_booking_approval_option_map_auth_read
on public.customer_booking_approval_option_map
for select
to authenticated
using (active = true);

create policy customer_booking_approvals_staff_all
on public.customer_booking_approvals
for all
using (public.current_user_can_create_bookings())
with check (public.current_user_can_create_bookings());

create policy customer_booking_approvals_customer_read_own
on public.customer_booking_approvals
for select
to authenticated
using (public.current_user_owns_booking(booking_id));

create policy customer_booking_approval_history_staff_all
on public.customer_booking_approval_history
for all
using (public.current_user_can_create_bookings())
with check (public.current_user_can_create_bookings());

create policy customer_booking_approval_history_customer_read_own
on public.customer_booking_approval_history
for select
to authenticated
using (public.current_user_owns_booking(booking_id));

create policy customer_booking_approval_day_locks_staff_all
on public.customer_booking_approval_day_locks
for all
using (public.current_user_can_create_bookings())
with check (public.current_user_can_create_bookings());

create or replace function public.get_customer_booking_approval_public_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_mapped_count integer := 0;
begin
  select
    coalesce(ss.timezone, 'America/Los_Angeles') as timezone,
    ss.customer_booking_last_minute_enabled as last_minute_enabled,
    ss.customer_booking_last_minute_value as last_minute_value,
    ss.customer_booking_last_minute_unit as last_minute_unit,
    ss.customer_booking_park_venue_limit_enabled as park_venue_limit_enabled,
    ss.customer_booking_park_venue_daily_limit as park_venue_daily_limit
  into v_settings
  from public.system_settings ss
  order by ss.id
  limit 1;

  if not found then
    v_settings := (
      select row(
        'America/Los_Angeles'::text,
        false,
        24,
        'hours'::text,
        false,
        0
      )
    );
  end if;

  select count(*)
  into v_mapped_count
  from public.customer_booking_approval_option_map m
  where m.active = true;

  return jsonb_build_object(
    'timezone', coalesce(v_settings.timezone, 'America/Los_Angeles'),
    'last_minute_enabled', coalesce(v_settings.last_minute_enabled, false),
    'last_minute_value', greatest(coalesce(v_settings.last_minute_value, 24), 1),
    'last_minute_unit', case when coalesce(v_settings.last_minute_unit, 'hours') in ('hours', 'days') then v_settings.last_minute_unit else 'hours' end,
    'park_venue_limit_enabled', coalesce(v_settings.park_venue_limit_enabled, false),
    'park_venue_daily_limit', greatest(coalesce(v_settings.park_venue_daily_limit, 0), 0),
    'park_venue_mapped_options_count', coalesce(v_mapped_count, 0)
  );
end;
$$;

revoke all on function public.get_customer_booking_approval_public_settings() from public, anon;
grant execute on function public.get_customer_booking_approval_public_settings() to authenticated;
grant execute on function public.get_customer_booking_approval_public_settings() to service_role;

create or replace function public.evaluate_customer_booking_approval(
  p_event_date date,
  p_event_start_time text,
  p_selected_modifier_option_ids uuid[] default null,
  p_booking_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb;
  v_timezone text := 'America/Los_Angeles';
  v_last_minute_enabled boolean := false;
  v_last_minute_value integer := 24;
  v_last_minute_unit text := 'hours';
  v_park_limit_enabled boolean := false;
  v_park_daily_limit integer := 0;
  v_has_park_venue boolean := false;
  v_now timestamptz := now();
  v_threshold interval := interval '24 hours';
  v_event_start timestamptz;
  v_reason_codes text[] := '{}'::text[];
  v_config_errors text[] := '{}'::text[];
  v_event_count integer := 0;
  v_mapped_count integer := 0;
  v_year integer;
  v_month integer;
  v_day integer;
  v_hour integer;
  v_minute integer;
  v_time_parts text[];
begin
  if p_event_date is null then
    return jsonb_build_object('ok', false, 'status', 'invalid_event_date');
  end if;

  v_settings := public.get_customer_booking_approval_public_settings();
  v_timezone := coalesce(v_settings ->> 'timezone', 'America/Los_Angeles');
  v_last_minute_enabled := coalesce((v_settings ->> 'last_minute_enabled')::boolean, false);
  v_last_minute_value := greatest(coalesce((v_settings ->> 'last_minute_value')::integer, 24), 1);
  v_last_minute_unit := case
    when coalesce(v_settings ->> 'last_minute_unit', 'hours') in ('hours', 'days')
      then v_settings ->> 'last_minute_unit'
    else 'hours'
  end;
  v_park_limit_enabled := coalesce((v_settings ->> 'park_venue_limit_enabled')::boolean, false);
  v_park_daily_limit := greatest(coalesce((v_settings ->> 'park_venue_daily_limit')::integer, 0), 0);
  v_mapped_count := greatest(coalesce((v_settings ->> 'park_venue_mapped_options_count')::integer, 0), 0);

  if v_last_minute_unit = 'days' then
    v_threshold := make_interval(hours => v_last_minute_value * 24);
  else
    v_threshold := make_interval(hours => v_last_minute_value);
  end if;

  if coalesce(array_length(p_selected_modifier_option_ids, 1), 0) > 0 then
    select exists (
      select 1
      from public.customer_booking_approval_option_map m
      where m.active = true
        and m.modifier_group_option_id = any(p_selected_modifier_option_ids)
    ) into v_has_park_venue;
  elsif p_booking_id is not null then
    select exists (
      select 1
      from public.booking_modifiers bm
      join public.customer_booking_approval_option_map m
        on m.modifier_group_option_id = bm.modifier_group_option_id
       and m.active = true
      where bm.booking_id = p_booking_id
    ) into v_has_park_venue;
  end if;

  if v_last_minute_enabled then
    if nullif(trim(coalesce(p_event_start_time, '')), '') is null then
      v_config_errors := array_append(v_config_errors, 'event_start_time_required');
    elsif not (p_event_start_time ~ '^\d{2}:\d{2}(:\d{2})?$') then
      v_config_errors := array_append(v_config_errors, 'event_start_time_invalid');
    else
      v_time_parts := regexp_split_to_array(split_part(p_event_start_time, ':', 1) || ':' || split_part(p_event_start_time, ':', 2), ':');
      v_year := extract(year from p_event_date)::integer;
      v_month := extract(month from p_event_date)::integer;
      v_day := extract(day from p_event_date)::integer;
      v_hour := coalesce(v_time_parts[1], '0')::integer;
      v_minute := coalesce(v_time_parts[2], '0')::integer;

      v_event_start := make_timestamptz(v_year, v_month, v_day, v_hour, v_minute, 0, v_timezone);

      if v_event_start <= v_now then
        v_config_errors := array_append(v_config_errors, 'event_time_in_past');
      elsif v_event_start <= (v_now + v_threshold) then
        v_reason_codes := array_append(v_reason_codes, 'last_minute');
      end if;
    end if;
  end if;

  if v_park_limit_enabled and v_has_park_venue then
    if v_mapped_count = 0 then
      v_config_errors := array_append(v_config_errors, 'park_venue_mapping_required');
    else
      insert into public.customer_booking_approval_day_locks(event_date, updated_at)
      values (p_event_date, now())
      on conflict (event_date) do update set updated_at = excluded.updated_at;

      perform 1
      from public.customer_booking_approval_day_locks l
      where l.event_date = p_event_date
      for update;

      select count(distinct b.id)
      into v_event_count
      from public.bookings b
      where b.event_date = p_event_date
        and (p_booking_id is null or b.id <> p_booking_id)
        and exists (
          select 1
          from public.booking_modifiers bm
          join public.customer_booking_approval_option_map m
            on m.modifier_group_option_id = bm.modifier_group_option_id
           and m.active = true
          where bm.booking_id = b.id
        )
        and coalesce(b.customer_approval_state, 'none') not in ('pending', 'rejected', 'expired')
        and (
          lower(coalesce(b.status::text, '')) in (
            'booked', 'scheduled', 'inventory_reserved', 'picking', 'loaded',
            'out_for_delivery', 'installed', 'pickup_scheduled', 'picked_up', 'returned', 'cleaning'
          )
          or (
            lower(coalesce(b.status::text, '')) = 'pending_deposit'
            and (
              (
                coalesce(b.booking_source, '') = 'customer_self_service'
                and coalesce(b.customer_approval_state, 'none') in ('none', 'not_required', 'approved')
              )
              or exists (
                select 1
                from public.booking_checkout_attempts a
                where a.booking_id = b.id
                  and a.state in ('holding', 'stripe_bound')
                  and a.hold_expires_at > now()
              )
            )
          )
        );

      if v_event_count >= v_park_daily_limit then
        v_reason_codes := array_append(v_reason_codes, 'park_venue_capacity');
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', array_length(v_config_errors, 1) is null,
    'requires_approval', array_length(v_reason_codes, 1) is not null,
    'reasons', coalesce(v_reason_codes, '{}'::text[]),
    'config_errors', coalesce(v_config_errors, '{}'::text[]),
    'has_park_venue', v_has_park_venue,
    'park_venue_count', v_event_count,
    'park_venue_limit', v_park_daily_limit,
    'timezone', v_timezone,
    'last_minute_threshold_value', v_last_minute_value,
    'last_minute_threshold_unit', v_last_minute_unit
  );
end;
$$;

revoke all on function public.evaluate_customer_booking_approval(date, text, uuid[], uuid) from public, anon;
grant execute on function public.evaluate_customer_booking_approval(date, text, uuid[], uuid) to authenticated;
grant execute on function public.evaluate_customer_booking_approval(date, text, uuid[], uuid) to service_role;

create or replace function public.rebuild_booking_inventory_requirements_from_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_timezone text := 'America/Los_Angeles';
  v_start_time time;
  v_end_time time;
  v_reserved_from timestamptz;
  v_reserved_until timestamptz;
  v_rebuilt_count integer := 0;
begin
  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if v_booking.event_date is null then
    return jsonb_build_object('success', false, 'status', 'event_date_required');
  end if;

  select coalesce(ss.timezone, 'America/Los_Angeles')
  into v_timezone
  from public.system_settings ss
  order by ss.id
  limit 1;

  v_start_time := coalesce(v_booking.event_start_time, time '09:00');
  v_end_time := coalesce(v_booking.event_end_time, v_start_time + interval '8 hours');

  v_reserved_from := make_timestamptz(
    extract(year from v_booking.event_date)::integer,
    extract(month from v_booking.event_date)::integer,
    extract(day from v_booking.event_date)::integer,
    extract(hour from v_start_time)::integer,
    extract(minute from v_start_time)::integer,
    0,
    v_timezone
  );

  v_reserved_until := make_timestamptz(
    extract(year from v_booking.event_date)::integer,
    extract(month from v_booking.event_date)::integer,
    extract(day from v_booking.event_date)::integer,
    extract(hour from v_end_time)::integer,
    extract(minute from v_end_time)::integer,
    0,
    v_timezone
  );

  if v_reserved_until <= v_reserved_from then
    v_reserved_until := v_reserved_until + interval '1 day';
  end if;

  create temporary table if not exists pg_temp.tmp_rebuilt_booking_requirements (
    booking_id uuid not null,
    booking_item_id uuid not null,
    inventory_item_id uuid not null,
    quantity numeric(12,2) not null,
    reserved_from timestamptz not null,
    reserved_until timestamptz not null,
    requirement_key text not null,
    requirement_type text not null,
    product_id uuid,
    modifier_group_id uuid,
    modifier_option_id uuid,
    inventory_behavior text not null
  ) on commit drop;

  truncate table pg_temp.tmp_rebuilt_booking_requirements;

  with item_windows as (
    select
      bi.id as booking_item_id,
      coalesce(req.reserved_from, res.reserved_from, v_reserved_from) as reserved_from,
      coalesce(req.reserved_until, res.reserved_until, v_reserved_until) as reserved_until
    from public.booking_items bi
    left join lateral (
      select min(bir.reserved_from) as reserved_from, max(bir.reserved_until) as reserved_until
      from public.booking_inventory_requirements bir
      where bir.booking_id = p_booking_id
        and bir.booking_item_id = bi.id
    ) req on true
    left join lateral (
      select min(ir.reserved_from) as reserved_from, max(ir.reserved_until) as reserved_until
      from public.inventory_reservations ir
      where ir.booking_id = p_booking_id
        and ir.booking_item_id = bi.id
        and ir.status = 'reserved'
    ) res on true
    where bi.booking_id = p_booking_id
  ),
  product_requirements as (
    select
      bi.id as booking_item_id,
      pic.inventory_item_id,
      sum(greatest(coalesce(bi.quantity, 1), 1)::numeric * greatest(coalesce(pic.quantity, 1), 1))::numeric(12,2) as quantity,
      iw.reserved_from,
      iw.reserved_until,
      'product'::text as requirement_type,
      bi.product_id,
      null::uuid as modifier_group_id,
      null::uuid as modifier_option_id,
      case
        when coalesce(pic.inventory_behavior, 'reusable') = 'consumable' then 'consumable'
        else 'reusable'
      end as inventory_behavior
    from public.booking_items bi
    join item_windows iw on iw.booking_item_id = bi.id
    join public.product_inventory_components pic
      on pic.product_id = bi.product_id
     and coalesce(pic.required, true) = true
    where bi.booking_id = p_booking_id
      and pic.inventory_item_id is not null
    group by
      bi.id,
      bi.product_id,
      pic.inventory_item_id,
      iw.reserved_from,
      iw.reserved_until,
      case when coalesce(pic.inventory_behavior, 'reusable') = 'consumable' then 'consumable' else 'reusable' end
  ),
  modifier_requirements as (
    select
      bm.booking_item_id,
      coalesce(
        nullif(to_jsonb(mgo) ->> 'inventory_item_id', '')::uuid,
        nullif(to_jsonb(m) ->> 'inventory_item_id', '')::uuid
      ) as inventory_item_id,
      sum(
        greatest(coalesce(bm.quantity, 1), 1)::numeric
        * greatest(
          coalesce(
            nullif(to_jsonb(mgo) ->> 'inventory_quantity', '')::numeric,
            nullif(to_jsonb(m) ->> 'inventory_quantity', '')::numeric,
            1
          ),
          1
        )
      )::numeric(12,2) as quantity,
      iw.reserved_from,
      iw.reserved_until,
      'modifier'::text as requirement_type,
      bi.product_id,
      nullif(to_jsonb(bm) ->> 'modifier_group_id', '')::uuid as modifier_group_id,
      nullif(to_jsonb(bm) ->> 'modifier_group_option_id', '')::uuid as modifier_option_id,
      case
        when coalesce(to_jsonb(mgo) ->> 'inventory_behavior', to_jsonb(m) ->> 'inventory_behavior', 'reusable') = 'consumable' then 'consumable'
        else 'reusable'
      end as inventory_behavior
    from public.booking_modifiers bm
    join public.booking_items bi
      on bi.id = bm.booking_item_id
     and bi.booking_id = p_booking_id
    join item_windows iw
      on iw.booking_item_id = bm.booking_item_id
    left join public.modifier_group_options mgo
      on mgo.id = nullif(to_jsonb(bm) ->> 'modifier_group_option_id', '')::uuid
    left join public.modifiers m
      on m.id = bm.modifier_id
    where bm.booking_id = p_booking_id
      and coalesce(
        nullif(to_jsonb(mgo) ->> 'inventory_item_id', '')::uuid,
        nullif(to_jsonb(m) ->> 'inventory_item_id', '')::uuid
      ) is not null
      and coalesce(
        nullif(to_jsonb(mgo) ->> 'track_inventory', '')::boolean,
        nullif(to_jsonb(mgo) ->> 'affects_inventory', '')::boolean,
        nullif(to_jsonb(m) ->> 'affects_inventory', '')::boolean,
        true
      ) = true
    group by
      bm.booking_item_id,
      coalesce(
        nullif(to_jsonb(mgo) ->> 'inventory_item_id', '')::uuid,
        nullif(to_jsonb(m) ->> 'inventory_item_id', '')::uuid
      ),
      iw.reserved_from,
      iw.reserved_until,
      bi.product_id,
      nullif(to_jsonb(bm) ->> 'modifier_group_id', '')::uuid,
      nullif(to_jsonb(bm) ->> 'modifier_group_option_id', '')::uuid,
      case
        when coalesce(to_jsonb(mgo) ->> 'inventory_behavior', to_jsonb(m) ->> 'inventory_behavior', 'reusable') = 'consumable' then 'consumable'
        else 'reusable'
      end
  ),
  merged as (
    select * from product_requirements
    union all
    select * from modifier_requirements
  )
  insert into pg_temp.tmp_rebuilt_booking_requirements (
    booking_id,
    booking_item_id,
    inventory_item_id,
    quantity,
    reserved_from,
    reserved_until,
    requirement_key,
    requirement_type,
    product_id,
    modifier_group_id,
    modifier_option_id,
    inventory_behavior
  )
  select
    p_booking_id,
    m.booking_item_id,
    m.inventory_item_id,
    m.quantity,
    m.reserved_from,
    m.reserved_until,
    m.requirement_type || ':' || md5(
      p_booking_id::text || ':' ||
      m.booking_item_id::text || ':' ||
      m.inventory_item_id::text || ':' ||
      m.requirement_type || ':' ||
      m.reserved_from::text || ':' ||
      m.reserved_until::text || ':' ||
      coalesce(m.modifier_option_id::text, '')
    ) as requirement_key,
    m.requirement_type,
    m.product_id,
    m.modifier_group_id,
    m.modifier_option_id,
    m.inventory_behavior
  from merged m
  where m.quantity > 0;

  get diagnostics v_rebuilt_count = row_count;

  if v_rebuilt_count <= 0 then
    return jsonb_build_object('success', false, 'status', 'requirements_rebuild_failed');
  end if;

  delete from public.booking_inventory_requirements bir
  where bir.booking_id = p_booking_id;

  insert into public.booking_inventory_requirements (
    booking_id,
    booking_item_id,
    inventory_item_id,
    quantity,
    reserved_from,
    reserved_until,
    requirement_key,
    requirement_type,
    product_id,
    modifier_group_id,
    modifier_option_id,
    inventory_behavior
  )
  select
    booking_id,
    booking_item_id,
    inventory_item_id,
    quantity,
    reserved_from,
    reserved_until,
    requirement_key,
    requirement_type,
    product_id,
    modifier_group_id,
    modifier_option_id,
    inventory_behavior
  from pg_temp.tmp_rebuilt_booking_requirements;

  return jsonb_build_object(
    'success', true,
    'status', 'requirements_rebuilt',
    'requirements_count', v_rebuilt_count
  );
exception
  when others then
    return jsonb_build_object(
      'success', false,
      'status', 'requirements_rebuild_error',
      'error', sqlerrm
    );
end;
$$;

revoke all on function public.rebuild_booking_inventory_requirements_from_booking(uuid) from public, anon;
grant execute on function public.rebuild_booking_inventory_requirements_from_booking(uuid) to authenticated;
grant execute on function public.rebuild_booking_inventory_requirements_from_booking(uuid) to service_role;

create or replace function public.request_my_customer_booking_approval(
  p_booking_id uuid,
  p_reasons text[],
  p_snapshot jsonb default '{}'::jsonb,
  p_customer_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_revision integer;
  v_existing public.customer_booking_approvals%rowtype;
  v_reason_codes text[] := coalesce(p_reasons, '{}'::text[]);
  v_snapshot jsonb := coalesce(p_snapshot, '{}'::jsonb);
  v_comment text := nullif(trim(coalesce(p_customer_comment, '')), '');
begin
  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if not public.current_user_owns_booking(p_booking_id) then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if coalesce(v_booking.booking_source, '') <> 'customer_self_service' then
    return jsonb_build_object('success', false, 'status', 'unsupported_booking_source');
  end if;

  if lower(coalesce(v_booking.status::text, '')) in ('booked', 'closed', 'cancelled', 'refunded') then
    return jsonb_build_object('success', false, 'status', 'booking_not_approvable');
  end if;

  select * into v_existing
  from public.customer_booking_approvals a
  where a.booking_id = p_booking_id
  for update;

  if found
     and coalesce(v_existing.state, 'pending') = 'pending'
     and coalesce(v_existing.reasons, '{}'::text[]) = v_reason_codes
     and coalesce(v_existing.snapshot, '{}'::jsonb) = v_snapshot
     and coalesce(v_existing.customer_comment, '') = coalesce(v_comment, '')
     and coalesce(v_booking.customer_approval_state, 'none') = 'pending' then
    return jsonb_build_object('success', true, 'status', 'pending', 'revision', v_existing.revision, 'idempotent', true);
  end if;

  v_revision := greatest(coalesce(v_booking.customer_approval_revision, 0), coalesce(v_existing.revision, 0)) + 1;

  insert into public.customer_booking_approvals(
    booking_id,
    revision,
    state,
    reasons,
    snapshot,
    requested_at,
    requested_by_auth_user_id,
    reviewed_at,
    reviewed_by_auth_user_id,
    customer_comment,
    active_hold_expires_at,
    updated_at
  ) values (
    p_booking_id,
    v_revision,
    'pending',
    v_reason_codes,
    v_snapshot,
    now(),
    auth.uid(),
    null,
    null,
    v_comment,
    null,
    now()
  )
  on conflict (booking_id)
  do update set
    revision = excluded.revision,
    state = 'pending',
    reasons = excluded.reasons,
    snapshot = excluded.snapshot,
    requested_at = now(),
    requested_by_auth_user_id = auth.uid(),
    reviewed_at = null,
    reviewed_by_auth_user_id = null,
    customer_comment = excluded.customer_comment,
    active_hold_expires_at = null,
    updated_at = now();

  update public.bookings
  set customer_approval_state = 'pending',
      customer_approval_revision = v_revision,
      customer_approval_reasons = v_reason_codes,
      customer_approval_expires_at = null,
      updated_at = now()
  where id = p_booking_id;

  perform public.release_booking_checkout_attempt_hold(
    p_booking_id,
    a.id,
    a.stripe_checkout_session_id,
    'approval_re_requested'
  )
  from public.booking_checkout_attempts a
  where a.booking_id = p_booking_id
    and a.state in ('holding', 'stripe_bound');

  insert into public.customer_booking_approval_history(
    booking_id,
    revision,
    from_state,
    to_state,
    reasons,
    payload,
    acted_by_auth_user_id,
    acted_at
  ) values (
    p_booking_id,
    v_revision,
    coalesce(v_existing.state, v_booking.customer_approval_state),
    'pending',
    v_reason_codes,
    v_snapshot,
    auth.uid(),
    now()
  );

  return jsonb_build_object('success', true, 'status', 'pending', 'revision', v_revision);
end;
$$;

revoke all on function public.request_my_customer_booking_approval(uuid, text[], jsonb, text) from public, anon;
grant execute on function public.request_my_customer_booking_approval(uuid, text[], jsonb, text) to authenticated;
grant execute on function public.request_my_customer_booking_approval(uuid, text[], jsonb, text) to service_role;

create or replace function public.prepare_customer_booking_for_pending_approval(
  p_booking_id uuid,
  p_reason text default 'capacity_recheck'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_requirements_count integer := 0;
  v_reservations_released integer := 0;
  v_rebuild jsonb;
  v_hold record;
begin
  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if not (
    public.current_user_owns_booking(p_booking_id)
    or public.current_user_can_create_bookings()
    or auth.role() = 'service_role'
  ) then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if coalesce(v_booking.booking_source, '') <> 'customer_self_service' then
    return jsonb_build_object('success', true, 'status', 'not_self_service', 'applied', false);
  end if;

  if lower(coalesce(v_booking.status::text, '')) <> 'pending_deposit' then
    return jsonb_build_object('success', false, 'status', 'booking_not_pending_deposit');
  end if;

  if lower(coalesce(v_booking.payment_status::text, '')) in ('paid', 'partial')
     or coalesce(v_booking.amount_paid, 0) > 0 then
    return jsonb_build_object('success', false, 'status', 'already_paid');
  end if;

  v_rebuild := public.rebuild_booking_inventory_requirements_from_booking(p_booking_id);

  if coalesce((v_rebuild ->> 'success')::boolean, false) is false then
    return v_rebuild;
  end if;

  v_requirements_count := coalesce((v_rebuild ->> 'requirements_count')::integer, 0);

  for v_hold in
    select a.id, a.stripe_checkout_session_id
    from public.booking_checkout_attempts a
    where a.booking_id = p_booking_id
      and a.state in ('holding', 'stripe_bound')
    for update
  loop
    perform public.release_booking_checkout_attempt_hold(
      p_booking_id,
      v_hold.id,
      v_hold.stripe_checkout_session_id,
      'prepare_pending_approval'
    );
  end loop;

  delete from public.inventory_reservations ir
  where ir.booking_id = p_booking_id
    and ir.status = 'reserved';

  get diagnostics v_reservations_released = row_count;

  return jsonb_build_object(
    'success', true,
    'status', 'prepared',
    'requirements_count', v_requirements_count,
    'reservations_released', v_reservations_released,
    'reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'capacity_recheck')
  );
end;
$$;

revoke all on function public.prepare_customer_booking_for_pending_approval(uuid, text) from public, anon;
grant execute on function public.prepare_customer_booking_for_pending_approval(uuid, text) to authenticated;
grant execute on function public.prepare_customer_booking_for_pending_approval(uuid, text) to service_role;

create or replace function public.reset_customer_booking_approval_for_admin(
  p_booking_id uuid,
  p_reason text,
  p_snapshot jsonb default '{}'::jsonb,
  p_invalidate_attempts boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_existing public.customer_booking_approvals%rowtype;
  v_revision integer;
  v_hold record;
  v_requirements_count integer := 0;
  v_rebuild jsonb;
begin
  if not public.current_user_can_create_bookings() then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if coalesce(v_booking.booking_source, '') <> 'customer_self_service' then
    return jsonb_build_object('success', true, 'status', 'not_self_service', 'applied', false);
  end if;

  if lower(coalesce(v_booking.status::text, '')) in ('booked', 'closed', 'cancelled', 'refunded')
     or lower(coalesce(v_booking.payment_status::text, '')) in ('paid', 'partial')
     or coalesce(v_booking.amount_paid, 0) > 0 then
    return jsonb_build_object('success', true, 'status', 'already_finalized_or_paid', 'applied', false);
  end if;

  v_rebuild := public.rebuild_booking_inventory_requirements_from_booking(p_booking_id);

  if coalesce((v_rebuild ->> 'success')::boolean, false) is false then
    return jsonb_build_object(
      'success', false,
      'status', coalesce(v_rebuild ->> 'status', 'requirements_missing_after_rebuild'),
      'rebuild', v_rebuild
    );
  end if;

  v_requirements_count := coalesce((v_rebuild ->> 'requirements_count')::integer, 0);

  if v_requirements_count <= 0 then
    return jsonb_build_object('success', false, 'status', 'requirements_missing_after_rebuild');
  end if;

  delete from public.inventory_reservations ir
  where ir.booking_id = p_booking_id
    and ir.status = 'reserved';

  select * into v_existing
  from public.customer_booking_approvals a
  where a.booking_id = p_booking_id
  for update;

  v_revision := greatest(coalesce(v_booking.customer_approval_revision, 0), coalesce(v_existing.revision, 0)) + 1;

  insert into public.customer_booking_approvals(
    booking_id,
    revision,
    state,
    reasons,
    snapshot,
    requested_at,
    requested_by_auth_user_id,
    reviewed_at,
    reviewed_by_auth_user_id,
    customer_comment,
    active_hold_expires_at,
    updated_at
  ) values (
    p_booking_id,
    v_revision,
    'pending',
    '{}'::text[],
    coalesce(p_snapshot, '{}'::jsonb),
    now(),
    auth.uid(),
    null,
    null,
    null,
    null,
    now()
  )
  on conflict (booking_id)
  do update set
    revision = excluded.revision,
    state = 'pending',
    snapshot = excluded.snapshot,
    requested_at = now(),
    requested_by_auth_user_id = auth.uid(),
    reviewed_at = null,
    reviewed_by_auth_user_id = null,
    active_hold_expires_at = null,
    updated_at = now();

  update public.bookings
  set customer_approval_state = 'pending',
      customer_approval_revision = v_revision,
      customer_approval_reasons = '{}'::text[],
      customer_approval_expires_at = null,
      status = 'pending_deposit'::public.booking_status,
      updated_at = now()
  where id = p_booking_id;

  if coalesce(p_invalidate_attempts, true) then
    for v_hold in
      select a.id, a.stripe_checkout_session_id
      from public.booking_checkout_attempts a
      where a.booking_id = p_booking_id
        and a.state in ('holding', 'stripe_bound')
      for update
    loop
      perform public.release_booking_checkout_attempt_hold(
        p_booking_id,
        v_hold.id,
        v_hold.stripe_checkout_session_id,
        coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'approval_reset')
      );
    end loop;
  end if;

  insert into public.customer_booking_approval_history(
    booking_id,
    revision,
    from_state,
    to_state,
    reasons,
    payload,
    acted_by_auth_user_id,
    acted_at
  ) values (
    p_booking_id,
    v_revision,
    coalesce(v_existing.state, v_booking.customer_approval_state),
    'pending',
    '{}'::text[],
    jsonb_build_object(
      'reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'approval_reset'),
      'snapshot', coalesce(p_snapshot, '{}'::jsonb),
      'requirements_count', v_requirements_count
    ),
    auth.uid(),
    now()
  );

  return jsonb_build_object('success', true, 'status', 'pending', 'revision', v_revision, 'applied', true);
end;
$$;

revoke all on function public.reset_customer_booking_approval_for_admin(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.reset_customer_booking_approval_for_admin(uuid, text, jsonb, boolean) to authenticated;
grant execute on function public.reset_customer_booking_approval_for_admin(uuid, text, jsonb, boolean) to service_role;

create or replace function public.expire_customer_booking_approval_if_needed(
  p_booking_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_existing public.customer_booking_approvals%rowtype;
  v_has_active_hold boolean := false;
begin
  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if not (public.current_user_can_create_bookings() or public.current_user_owns_booking(p_booking_id) or auth.role() = 'service_role') then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if coalesce(v_booking.customer_approval_state, 'none') <> 'approved' then
    return jsonb_build_object('success', true, 'status', 'no_change');
  end if;

  if lower(coalesce(v_booking.status::text, '')) in ('booked', 'closed', 'cancelled', 'refunded')
     or lower(coalesce(v_booking.payment_status::text, '')) in ('paid', 'partial')
     or coalesce(v_booking.amount_paid, 0) > 0 then
    return jsonb_build_object('success', true, 'status', 'no_change_finalized');
  end if;

  select exists (
    select 1
    from public.booking_checkout_attempts a
    where a.booking_id = p_booking_id
      and a.state in ('holding', 'stripe_bound')
      and a.hold_expires_at > now()
  ) into v_has_active_hold;

  if v_has_active_hold then
    return jsonb_build_object('success', true, 'status', 'no_change');
  end if;

  if coalesce(v_booking.customer_approval_expires_at, '-infinity'::timestamptz) > now() then
    return jsonb_build_object('success', true, 'status', 'no_change');
  end if;

  select * into v_existing
  from public.customer_booking_approvals a
  where a.booking_id = p_booking_id
  for update;

  update public.customer_booking_approvals
  set state = 'expired',
      reviewed_at = now(),
      reviewed_by_auth_user_id = auth.uid(),
      active_hold_expires_at = null,
      updated_at = now()
  where booking_id = p_booking_id;

  update public.bookings
  set customer_approval_state = 'expired',
      customer_approval_expires_at = null,
      updated_at = now()
  where id = p_booking_id;

  insert into public.customer_booking_approval_history(
    booking_id,
    revision,
    from_state,
    to_state,
    reasons,
    payload,
    acted_by_auth_user_id,
    acted_at
  ) values (
    p_booking_id,
    coalesce(v_existing.revision, v_booking.customer_approval_revision),
    coalesce(v_existing.state, v_booking.customer_approval_state),
    'expired',
    coalesce(v_existing.reasons, v_booking.customer_approval_reasons, '{}'::text[]),
    jsonb_build_object('reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'approval_expired')),
    auth.uid(),
    now()
  );

  return jsonb_build_object('success', true, 'status', 'expired');
end;
$$;

revoke all on function public.expire_customer_booking_approval_if_needed(uuid, text) from public, anon;
grant execute on function public.expire_customer_booking_approval_if_needed(uuid, text) to authenticated;
grant execute on function public.expire_customer_booking_approval_if_needed(uuid, text) to service_role;

create or replace function public.review_customer_booking_approval(
  p_booking_id uuid,
  p_revision integer,
  p_decision text,
  p_customer_comment text default null,
  p_hold_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_current public.customer_booking_approvals%rowtype;
  v_decision text;
  v_attempt_id uuid;
  v_hold_result jsonb;
  v_hold_status text;
  v_hold_expires_at timestamptz;
  v_capacity_check jsonb;
  v_has_park_venue boolean := false;
  v_capacity_limit integer := 0;
  v_capacity_count integer := 0;
begin
  if not public.current_user_can_create_bookings() then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  v_decision := lower(coalesce(p_decision, ''));

  if v_decision not in ('approved', 'rejected', 'expired') then
    return jsonb_build_object('success', false, 'status', 'invalid_decision');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if coalesce(v_booking.booking_source, '') <> 'customer_self_service' then
    return jsonb_build_object('success', false, 'status', 'not_customer_self_service');
  end if;

  if lower(coalesce(v_booking.status::text, '')) in ('booked', 'closed', 'refunded') and v_decision = 'rejected' then
    return jsonb_build_object('success', false, 'status', 'already_paid_or_closed');
  end if;

  select * into v_current
  from public.customer_booking_approvals a
  where a.booking_id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'approval_not_found');
  end if;

  if p_revision is not null and p_revision <> v_current.revision then
    return jsonb_build_object('success', false, 'status', 'revision_conflict', 'current_revision', v_current.revision);
  end if;

  if v_current.state = v_decision then
    return jsonb_build_object(
      'success', true,
      'status', case
        when v_decision = 'approved' then 'already_approved'
        when v_decision = 'rejected' then 'already_rejected'
        when v_decision = 'expired' then 'already_expired'
        else v_decision
      end,
      'revision', v_current.revision,
      'hold_expires_at', v_current.active_hold_expires_at
    );
  end if;

  if coalesce(v_current.state, 'pending') <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'status', 'state_conflict',
      'current_state', coalesce(v_current.state, 'pending')
    );
  end if;

  if v_decision = 'approved' then
    if lower(coalesce(v_booking.status::text, '')) <> 'pending_deposit' then
      return jsonb_build_object('success', false, 'status', 'booking_not_pending_deposit');
    end if;

    v_hold_result := public.acquire_booking_temporary_inventory_hold(
      p_booking_id,
      'admin_initial_hold',
      60,
      false
    );

    v_hold_status := coalesce(v_hold_result ->> 'status', 'unknown_error');
    if v_hold_status <> 'ok' then
      return jsonb_build_object(
        'success', false,
        'status', 'hold_acquire_failed',
        'hold_status', v_hold_status,
        'hold_payload', v_hold_result
      );
    end if;

    v_hold_expires_at := nullif(v_hold_result ->> 'hold_expires_at', '')::timestamptz;
    if v_hold_expires_at is null or v_hold_expires_at <= now() then
      return jsonb_build_object('success', false, 'status', 'hold_acquire_invalid');
    end if;

    v_attempt_id := nullif(v_hold_result ->> 'attempt_id', '')::uuid;
    if v_attempt_id is null then
      return jsonb_build_object('success', false, 'status', 'hold_attempt_missing');
    end if;

    update public.booking_checkout_attempts a
    set approval_revision = v_current.revision,
        hold_expires_at = least(a.hold_expires_at, now() + interval '60 minutes'),
        updated_at = now()
    where a.id = v_attempt_id
      and a.booking_id = p_booking_id
    returning a.hold_expires_at into v_hold_expires_at;

    if v_hold_expires_at is null or v_hold_expires_at <= now() then
      return jsonb_build_object('success', false, 'status', 'hold_attempt_invalid');
    end if;
  end if;

  update public.customer_booking_approvals
  set state = v_decision,
      reviewed_at = now(),
      reviewed_by_auth_user_id = auth.uid(),
      customer_comment = coalesce(nullif(trim(coalesce(p_customer_comment, '')), ''), customer_comment),
      active_hold_expires_at = case when v_decision = 'approved' then v_hold_expires_at else null end,
      updated_at = now()
  where booking_id = p_booking_id;

  update public.bookings
  set customer_approval_state = v_decision,
      customer_approval_reasons = coalesce(v_current.reasons, '{}'::text[]),
      customer_approval_expires_at = case when v_decision = 'approved' then v_hold_expires_at else null end,
      updated_at = now()
  where id = p_booking_id;

  insert into public.customer_booking_approval_history(
    booking_id,
    revision,
    from_state,
    to_state,
    reasons,
    payload,
    acted_by_auth_user_id,
    acted_at
  ) values (
    p_booking_id,
    v_current.revision,
    v_current.state,
    v_decision,
    coalesce(v_current.reasons, '{}'::text[]),
    jsonb_build_object(
      'customer_comment', coalesce(nullif(trim(coalesce(p_customer_comment, '')), ''), null),
      'hold_expires_at', case when v_decision = 'approved' then v_hold_expires_at else null end
    ),
    auth.uid(),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'status', v_decision,
    'revision', v_current.revision,
    'hold_expires_at', case when v_decision = 'approved' then v_hold_expires_at else null end
  );
end;
$$;

revoke all on function public.review_customer_booking_approval(uuid, integer, text, text, timestamptz) from public, anon;
grant execute on function public.review_customer_booking_approval(uuid, integer, text, text, timestamptz) to authenticated;
grant execute on function public.review_customer_booking_approval(uuid, integer, text, text, timestamptz) to service_role;

create or replace function public.approve_customer_booking_approval(
  p_booking_id uuid,
  p_revision integer,
  p_customer_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_current public.customer_booking_approvals%rowtype;
  v_hold_minutes integer := 60;
  v_attempt_id uuid;
  v_hold_result jsonb;
  v_hold_status text;
  v_hold_expires_at timestamptz;
  v_capacity_check jsonb;
  v_capacity_warning boolean := false;
begin
  if not public.current_user_can_create_bookings() then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if coalesce(v_booking.booking_source, '') <> 'customer_self_service'
     or lower(coalesce(v_booking.status::text, '')) <> 'pending_deposit' then
    return jsonb_build_object('success', false, 'status', 'booking_not_pending_self_service');
  end if;

  select * into v_current
  from public.customer_booking_approvals a
  where a.booking_id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'approval_not_found');
  end if;

  if p_revision is not null and p_revision <> v_current.revision then
    return jsonb_build_object('success', false, 'status', 'revision_conflict', 'current_revision', v_current.revision);
  end if;

  if v_current.state = 'approved' then
    return jsonb_build_object(
      'success', true,
      'status', 'already_approved',
      'revision', v_current.revision,
      'hold_expires_at', v_current.active_hold_expires_at
    );
  end if;

  if coalesce(v_current.state, 'pending') <> 'pending' then
    return jsonb_build_object(
      'success', false,
      'status', 'state_conflict',
      'current_state', coalesce(v_current.state, 'pending')
    );
  end if;

  v_capacity_check := public.evaluate_customer_booking_approval(
    v_booking.event_date,
    v_booking.event_start_time::text,
    null,
    p_booking_id
  );

  if coalesce((v_capacity_check ->> 'ok')::boolean, false) is false then
    return jsonb_build_object(
      'success', false,
      'status', 'approval_settings_invalid',
      'config_errors', coalesce(v_capacity_check -> 'config_errors', '[]'::jsonb)
    );
  end if;

  v_capacity_warning := coalesce((v_capacity_check ->> 'has_park_venue')::boolean, false)
    and greatest(coalesce((v_capacity_check ->> 'park_venue_limit')::integer, 0), 0) > 0
    and greatest(coalesce((v_capacity_check ->> 'park_venue_count')::integer, 0), 0)
        >= greatest(coalesce((v_capacity_check ->> 'park_venue_limit')::integer, 0), 0);

  v_hold_result := public.acquire_booking_temporary_inventory_hold(
    p_booking_id,
    'admin_initial_hold',
    v_hold_minutes,
    false
  );

  v_hold_status := coalesce(v_hold_result ->> 'status', 'unknown_error');
  if v_hold_status <> 'ok' then
    return jsonb_build_object(
      'success', false,
      'status', 'hold_acquire_failed',
      'hold_status', v_hold_status,
      'hold_payload', v_hold_result
    );
  end if;

  v_hold_expires_at := nullif(v_hold_result ->> 'hold_expires_at', '')::timestamptz;

  v_attempt_id := nullif(v_hold_result ->> 'attempt_id', '')::uuid;
  if v_attempt_id is null then
    return jsonb_build_object('success', false, 'status', 'hold_attempt_missing');
  end if;

  update public.booking_checkout_attempts a
  set approval_revision = v_current.revision,
      hold_expires_at = least(a.hold_expires_at, now() + interval '60 minutes'),
      updated_at = now()
  where a.id = v_attempt_id
    and a.booking_id = p_booking_id
  returning a.hold_expires_at into v_hold_expires_at;

  if v_hold_expires_at is null or v_hold_expires_at <= now() then
    return jsonb_build_object('success', false, 'status', 'hold_attempt_invalid');
  end if;

  update public.customer_booking_approvals
  set state = 'approved',
      reviewed_at = now(),
      reviewed_by_auth_user_id = auth.uid(),
      customer_comment = coalesce(nullif(trim(coalesce(p_customer_comment, '')), ''), customer_comment),
      active_hold_expires_at = v_hold_expires_at,
      updated_at = now()
  where booking_id = p_booking_id;

  update public.bookings
  set customer_approval_state = 'approved',
      customer_approval_reasons = coalesce(v_current.reasons, '{}'::text[]),
      customer_approval_expires_at = v_hold_expires_at,
      updated_at = now()
  where id = p_booking_id;

  insert into public.customer_booking_approval_history(
    booking_id,
    revision,
    from_state,
    to_state,
    reasons,
    payload,
    acted_by_auth_user_id,
    acted_at
  ) values (
    p_booking_id,
    v_current.revision,
    v_current.state,
    'approved',
    coalesce(v_current.reasons, '{}'::text[]),
    jsonb_build_object(
      'customer_comment', coalesce(nullif(trim(coalesce(p_customer_comment, '')), ''), null),
      'hold_expires_at', v_hold_expires_at,
      'park_venue_capacity_warning', v_capacity_warning,
      'capacity_check', v_capacity_check
    ),
    auth.uid(),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'status', 'approved',
    'revision', v_current.revision,
    'hold_expires_at', v_hold_expires_at,
    'park_venue_capacity_warning', v_capacity_warning,
    'capacity_check', v_capacity_check
  );
end;
$$;

revoke all on function public.approve_customer_booking_approval(uuid, integer, text) from public, anon;
grant execute on function public.approve_customer_booking_approval(uuid, integer, text) to authenticated;
grant execute on function public.approve_customer_booking_approval(uuid, integer, text) to service_role;

create or replace function public.guard_customer_checkout_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_max_hold interval := interval '60 minutes';
  v_min_hold interval := interval '60 minutes';
begin
  if coalesce(new.attempt_kind, '') <> 'customer_temporary_deposit' then
    return new;
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = new.booking_id;

  if not found then
    raise exception 'booking_not_found';
  end if;

  if coalesce(v_booking.booking_source, '') = 'customer_self_service' then
    if lower(coalesce(v_booking.status::text, '')) <> 'pending_deposit' then
      raise exception 'self_service_booking_not_pending_deposit';
    end if;

    if coalesce(v_booking.customer_approval_state, 'none') <> 'approved' then
      raise exception 'self_service_approval_not_active';
    end if;

    if coalesce(v_booking.customer_approval_expires_at, '-infinity'::timestamptz) <= now() then
      perform public.expire_customer_booking_approval_if_needed(v_booking.id, 'guard_expired');
      raise exception 'approval_expired';
    end if;

    if new.approval_revision is null then
      new.approval_revision := v_booking.customer_approval_revision;
    elsif new.approval_revision is distinct from v_booking.customer_approval_revision then
      raise exception 'approval_revision_mismatch';
    end if;
  else
    if auth.role() <> 'service_role'
       and not public.current_user_can_create_bookings()
       and not public.current_user_has_active_completion_session(v_booking.id) then
      raise exception 'completion_session_required';
    end if;
  end if;

  if new.hold_expires_at is null then
    new.hold_expires_at := now() + interval '60 minutes';
  end if;

  if new.hold_expires_at < now() + v_min_hold then
    if coalesce(v_booking.booking_source, '') = 'customer_self_service' then
      new.hold_expires_at := least(v_booking.customer_approval_expires_at, now() + v_min_hold);
    else
      new.hold_expires_at := now() + v_min_hold;
    end if;
  end if;

  if new.hold_expires_at > now() + v_max_hold then
    new.hold_expires_at := now() + v_max_hold;
  end if;

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and new.hold_expires_at > v_booking.customer_approval_expires_at then
    new.hold_expires_at := v_booking.customer_approval_expires_at;
  end if;

  if new.hold_expires_at <= now() then
    perform public.expire_customer_booking_approval_if_needed(v_booking.id, 'guard_expired');
    raise exception 'approval_expired';
  end if;

  return new;
end;
$$;

create or replace function public.sync_inventory_reservation_hold_with_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_hold_expires_at timestamptz;
begin
  if new.hold_attempt_id is null then
    return new;
  end if;

  select a.hold_expires_at
  into v_attempt_hold_expires_at
  from public.booking_checkout_attempts a
  where a.id = new.hold_attempt_id;

  if v_attempt_hold_expires_at is not null then
    new.hold_expires_at := v_attempt_hold_expires_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_customer_checkout_attempt_ins on public.booking_checkout_attempts;
create trigger trg_guard_customer_checkout_attempt_ins
before insert on public.booking_checkout_attempts
for each row execute function public.guard_customer_checkout_attempt();

drop trigger if exists trg_guard_customer_checkout_attempt_upd on public.booking_checkout_attempts;
create trigger trg_guard_customer_checkout_attempt_upd
before update of hold_expires_at, attempt_kind on public.booking_checkout_attempts
for each row execute function public.guard_customer_checkout_attempt();

drop trigger if exists trg_sync_inventory_reservation_hold_with_attempt_ins on public.inventory_reservations;
create trigger trg_sync_inventory_reservation_hold_with_attempt_ins
before insert on public.inventory_reservations
for each row execute function public.sync_inventory_reservation_hold_with_attempt();

drop trigger if exists trg_sync_inventory_reservation_hold_with_attempt_upd on public.inventory_reservations;
create trigger trg_sync_inventory_reservation_hold_with_attempt_upd
before update of hold_attempt_id, hold_expires_at on public.inventory_reservations
for each row execute function public.sync_inventory_reservation_hold_with_attempt();

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
  v_booking public.bookings%rowtype;
  v_authorized boolean := false;
  v_effective_hold_expires_at timestamptz;
begin
  if p_booking_id is null or p_attempt_id is null or nullif(trim(coalesce(p_stripe_checkout_session_id, '')), '') is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('status', 'booking_not_found');
  end if;

  v_authorized := public.current_user_can_create_bookings()
    or (
      public.current_user_owns_booking(p_booking_id)
      and (
        public.current_user_has_active_completion_session(p_booking_id)
        or (
          coalesce(v_booking.booking_source, '') = 'customer_self_service'
          and coalesce(v_booking.customer_approval_state, 'none') = 'approved'
          and coalesce(v_booking.customer_approval_expires_at, '-infinity'::timestamptz) > now()
        )
      )
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

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and v_attempt.attempt_kind = 'customer_temporary_deposit'
     and coalesce(v_booking.customer_approval_state, 'none') <> 'approved' then
    return jsonb_build_object('status', 'approval_not_active');
  end if;

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and v_attempt.attempt_kind = 'customer_temporary_deposit'
     and coalesce(v_booking.customer_approval_expires_at, '-infinity'::timestamptz) <= now() then
    perform public.expire_customer_booking_approval_if_needed(p_booking_id, 'bind_expired');
    return jsonb_build_object('status', 'approval_expired');
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

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and v_attempt.attempt_kind = 'customer_temporary_deposit'
      and v_attempt.approval_revision is not null
      and v_attempt.approval_revision <> v_booking.customer_approval_revision then
    return jsonb_build_object('status', 'approval_revision_mismatch');
  end if;

  v_effective_hold_expires_at := greatest(
    v_attempt.hold_expires_at,
    coalesce(p_stripe_expires_at + interval '10 minutes', v_attempt.hold_expires_at)
  );

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and v_attempt.attempt_kind = 'customer_temporary_deposit' then
    v_effective_hold_expires_at := least(v_effective_hold_expires_at, v_booking.customer_approval_expires_at);
    if v_effective_hold_expires_at <= now() then
      perform public.expire_customer_booking_approval_if_needed(p_booking_id, 'bind_expired');
      return jsonb_build_object('status', 'approval_expired');
    end if;
  end if;

  update public.booking_checkout_attempts
  set stripe_checkout_session_id = p_stripe_checkout_session_id,
      stripe_expires_at = p_stripe_expires_at,
      hold_expires_at = v_effective_hold_expires_at,
      approval_revision = case
        when coalesce(v_booking.booking_source, '') = 'customer_self_service'
             and v_attempt.attempt_kind = 'customer_temporary_deposit'
          then v_booking.customer_approval_revision
        else approval_revision
      end,
      state = 'stripe_bound',
      updated_at = now()
  where id = p_attempt_id
  returning hold_expires_at into v_effective_hold_expires_at;

  update public.inventory_reservations ir
  set hold_expires_at = v_effective_hold_expires_at,
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
  v_booking public.bookings%rowtype;
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
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
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

  if v_attempt.stripe_checkout_session_id is null
     or v_attempt.stripe_checkout_session_id <> p_stripe_checkout_session_id then
    return jsonb_build_object('success', false, 'status', 'attempt_session_mismatch');
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

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and coalesce(v_booking.customer_approval_state, 'none') <> 'approved' then
    return jsonb_build_object('success', false, 'status', 'approval_not_active');
  end if;

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and coalesce(v_booking.customer_approval_expires_at, '-infinity'::timestamptz) <= now() then
    perform public.expire_customer_booking_approval_if_needed(p_booking_id, 'finalize_expired');
    return jsonb_build_object('success', false, 'status', 'approval_expired');
  end if;

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and v_attempt.approval_revision is not null
     and v_attempt.approval_revision <> v_booking.customer_approval_revision then
    return jsonb_build_object('success', false, 'status', 'approval_revision_mismatch');
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

create or replace function public.complete_customer_booking_checkout(
  p_booking_id uuid,
  p_amount numeric,
  p_method text,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_attempt public.booking_checkout_attempts%rowtype;
  v_paid numeric := 0;
  v_required numeric := 0;
  v_missing jsonb := '[]'::jsonb;
  v_requirement record;
  v_allocated numeric(12,2);
  v_contract_signed boolean := false;
  v_items_summary text := '';
  v_customer_name text := '';
  v_customer_phone text := '';
  v_now timestamptz := now();
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'status', 'authentication_required');
  end if;

  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if round(greatest(coalesce(p_amount, 0), 0), 2) <> 0 then
    return jsonb_build_object('success', false, 'status', 'payment_must_be_recorded_server_side');
  end if;

  select b.*
  into v_booking
  from public.bookings b
  join public.customers c
    on c.id = b.customer_id
  where b.id = p_booking_id
    and c.auth_user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if lower(coalesce(v_booking.status::text, '')) = 'booked'
     and lower(coalesce(v_booking.payment_status::text, '')) in ('paid', 'partial') then
    return jsonb_build_object('success', true, 'status', 'already_booked', 'idempotent', true);
  end if;

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and coalesce(v_booking.customer_approval_state, 'none') = 'approved'
     and coalesce(v_booking.customer_approval_expires_at, '-infinity'::timestamptz) <= now() then
    perform public.expire_customer_booking_approval_if_needed(p_booking_id, 'complete_expired');

    select b.*
    into v_booking
    from public.bookings b
    where b.id = p_booking_id
    for update;
  end if;

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and lower(coalesce(v_booking.status::text, '')) = 'pending_deposit'
      and coalesce(v_booking.customer_approval_state, 'none') not in ('approved', 'not_required', 'none') then
    return jsonb_build_object('success', false, 'status', 'approval_not_active');
  end if;

  select exists (
    select 1
    from public.contracts c
    where c.booking_id = p_booking_id
      and lower(coalesce(c.status::text, '')) = 'signed'
  )
  into v_contract_signed;

  if not v_contract_signed
     and coalesce(v_booking.contract_status, 'not_sent') <> 'signed' then
    return jsonb_build_object('success', false, 'status', 'contract_required');
  end if;

  select coalesce(
    sum(
      greatest(
        coalesce(p.amount, 0) -
        coalesce(p.tip_amount, 0),
        0
      )
    ),
    0
  )
  into v_paid
  from public.payments p
  where p.booking_id = p_booking_id
    and lower(coalesce(p.status, '')) in ('paid', 'completed', 'succeeded');

  v_required := greatest(coalesce(v_booking.deposit_amount, 0) - v_paid, 0);

  if coalesce(v_booking.booking_source, '') = 'customer_self_service'
     and lower(coalesce(v_booking.status::text, '')) = 'pending_deposit'
     and coalesce(v_booking.customer_approval_state, 'none') = 'approved'
     and v_required <= 0 then
    select *
    into v_attempt
    from public.booking_checkout_attempts a
    where a.booking_id = p_booking_id
      and a.state in ('holding', 'stripe_bound')
      and a.hold_expires_at > now()
      and (
        a.approval_revision = v_booking.customer_approval_revision
        or a.approval_revision is null
      )
    order by a.created_at desc
    limit 1
    for update;

    if not found then
      return jsonb_build_object('success', false, 'status', 'approval_hold_missing');
    end if;

    if v_attempt.approval_revision is null then
      update public.booking_checkout_attempts
      set approval_revision = v_booking.customer_approval_revision,
          updated_at = now()
      where id = v_attempt.id;
    end if;

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
      where ir.hold_attempt_id = v_attempt.id
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
        'status', 'inventory_hold_missing_for_zero_deposit',
        'missing_requirements', v_missing
      );
    end if;

    update public.inventory_reservations ir
    set hold_expires_at = null,
        hold_attempt_id = null,
        hold_requirement_key = null,
        updated_at = now(),
        notes = trim(both from concat_ws(' | ', nullif(ir.notes, ''), 'temporary hold finalized (zero deposit)'))
    where ir.hold_attempt_id = v_attempt.id
      and ir.status = 'reserved';

    update public.booking_checkout_attempts
    set state = 'finalized',
        finalized_at = now(),
        updated_at = now()
    where id = v_attempt.id;
  end if;

  if v_required > 0 then
    update public.bookings
    set amount_paid = v_paid,
        balance_due = greatest(coalesce(total_amount, 0) - v_paid, 0),
        payment_status = (
          case
            when v_paid >= coalesce(total_amount, 0) then 'paid'
            when v_paid > 0 then 'partial'
            else 'unpaid'
          end
        )::payment_status,
        updated_at = v_now
    where id = p_booking_id;

    return jsonb_build_object(
      'success', false,
      'status', 'deposit_required',
      'contract_signed', true,
      'deposit_paid', false,
      'amount_paid', v_paid,
      'deposit_amount', coalesce(v_booking.deposit_amount, 0),
      'required_now', v_required
    );
  end if;

  update public.bookings
  set status = 'booked',
      contract_status = 'signed',
      amount_paid = v_paid,
      balance_due = greatest(coalesce(total_amount, 0) - v_paid, 0),
      payment_status = (
        case
          when v_paid >= coalesce(total_amount, 0) then 'paid'
          when v_paid > 0 then 'partial'
          else 'unpaid'
        end
      )::payment_status,
      updated_at = v_now
  where id = p_booking_id;

  select coalesce(c.full_name, ''), coalesce(c.phone, '')
  into v_customer_name, v_customer_phone
  from public.customers c
  where c.id = v_booking.customer_id;

  select coalesce(
    string_agg(
      coalesce(p.name, 'Product') ||
      ' x ' ||
      greatest(coalesce(bi.quantity, 1), 1)::text,
      E'\n'
      order by bi.created_at
    ),
    ''
  )
  into v_items_summary
  from public.booking_items bi
  left join public.products p
    on p.id = bi.product_id
  where bi.booking_id = p_booking_id;

  if not exists (
    select 1
    from public.route_stops rs
    where rs.booking_id = p_booking_id
      and rs.stop_type = 'delivery'
      and coalesce(rs.status::text, '') not in ('cancelled', 'failed')
  ) then
    insert into public.route_stops (
      booking_id,
      stop_date,
      stop_type,
      status,
      customer_name,
      customer_phone,
      address,
      city,
      state,
      zip,
      scheduled_start_time,
      scheduled_end_time,
      driver_name,
      truck_name,
      items_summary,
      setup_notes,
      balance_due,
      sort_order,
      updated_at
    )
    values (
      p_booking_id,
      coalesce(v_booking.delivery_date, v_booking.event_date),
      'delivery',
      'scheduled',
      nullif(v_customer_name, ''),
      nullif(v_customer_phone, ''),
      v_booking.setup_address,
      v_booking.setup_city,
      coalesce(v_booking.setup_state, 'CA'),
      v_booking.setup_zip,
      coalesce(v_booking.delivery_window_start::time, v_booking.event_start_time),
      coalesce(v_booking.delivery_window_end::time, v_booking.event_start_time),
      null,
      null,
      nullif(v_items_summary, ''),
      case
        when v_booking.event_start_time is not null
          then 'Event starts at ' || v_booking.event_start_time::text || '. Setup should be completed before start time.'
        else null
      end,
      greatest(coalesce(v_booking.total_amount, 0) - v_paid, 0),
      100,
      v_now
    );
  end if;

  if not exists (
    select 1
    from public.route_stops rs
    where rs.booking_id = p_booking_id
      and rs.stop_type = 'pickup'
      and coalesce(rs.status::text, '') not in ('cancelled', 'failed')
  ) then
    insert into public.route_stops (
      booking_id,
      stop_date,
      stop_type,
      status,
      customer_name,
      customer_phone,
      address,
      city,
      state,
      zip,
      scheduled_start_time,
      scheduled_end_time,
      driver_name,
      truck_name,
      items_summary,
      pickup_notes,
      balance_due,
      sort_order,
      updated_at
    )
    values (
      p_booking_id,
      coalesce(v_booking.pickup_date, v_booking.event_date),
      'pickup',
      'scheduled',
      nullif(v_customer_name, ''),
      nullif(v_customer_phone, ''),
      v_booking.setup_address,
      v_booking.setup_city,
      coalesce(v_booking.setup_state, 'CA'),
      v_booking.setup_zip,
      coalesce(v_booking.pickup_window_start::time, v_booking.event_end_time),
      coalesce(v_booking.pickup_window_end::time, v_booking.event_end_time),
      null,
      null,
      nullif(v_items_summary, ''),
      case
        when v_booking.event_end_time is not null
          then 'Event ends at ' || v_booking.event_end_time::text || '. Pickup can be scheduled after event end.'
        else null
      end,
      0,
      200,
      v_now
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'status', 'confirmed',
    'booking_id', p_booking_id,
    'amount_paid', v_paid,
    'balance_due', greatest(coalesce(v_booking.total_amount, 0) - v_paid, 0)
  );
end;
$function$;

create or replace function public.get_my_booking_approval_state(
  p_booking_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_approval public.customer_booking_approvals%rowtype;
  v_active_hold timestamptz;
begin
  if p_booking_id is null or not public.current_user_owns_booking(p_booking_id) then
    return null;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    return null;
  end if;

  select * into v_approval
  from public.customer_booking_approvals a
  where a.booking_id = p_booking_id;

  select max(a.hold_expires_at)
  into v_active_hold
  from public.booking_checkout_attempts a
  where a.booking_id = p_booking_id
    and a.state in ('holding', 'stripe_bound')
    and a.hold_expires_at > now();

  return jsonb_build_object(
    'state', coalesce(v_booking.customer_approval_state, 'none'),
    'revision', coalesce(v_booking.customer_approval_revision, 0),
    'reasons', coalesce(v_booking.customer_approval_reasons, '{}'::text[]),
    'expires_at', coalesce(v_active_hold, v_booking.customer_approval_expires_at),
    'requested_at', v_approval.requested_at,
    'reviewed_at', v_approval.reviewed_at,
    'customer_comment', v_approval.customer_comment
  );
end;
$$;

revoke all on function public.get_my_booking_approval_state(uuid) from public, anon;
grant execute on function public.get_my_booking_approval_state(uuid) to authenticated;
grant execute on function public.get_my_booking_approval_state(uuid) to service_role;

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
      and (
        coalesce(b.booking_source, '') = 'admin'
        or (
          coalesce(b.booking_source, '') = 'customer_self_service'
          and coalesce(b.customer_approval_state, 'none') = 'approved'
        )
      )
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

do $$
begin
  -- Keep the robust implementation from 111_admin_temporary_inventory_holds.sql.
  -- This migration adds approval orchestration and must not downgrade hold
  -- locking, allocation, or cleanup semantics.
  null;
end;
$$;

-- Ensure the notification category required by approval events exists so this
-- migration remains self-contained when reference seed data is absent.
insert into public.notification_categories
  (code, label, description, customer_configurable, mandatory, sort_order)
values
  ('reservation', 'Reservation & event updates', 'Booking confirmations, changes, cancellations and event reminders.', true, false, 10)
on conflict (code) do nothing;

insert into public.notification_events(code, category_code, label, description, sort_order, active)
values
  ('customer_booking_approval_requested', 'reservation', 'Booking approval requested', 'Customer booking requested delivery availability approval.', 31, true),
  ('customer_booking_approval_approved', 'reservation', 'Booking approval approved', 'Customer booking delivery approval was granted.', 32, true),
  ('customer_booking_approval_rejected', 'reservation', 'Booking approval rejected', 'Customer booking delivery approval was rejected.', 33, true),
  ('customer_booking_approval_expired', 'reservation', 'Booking approval expired', 'Approved customer booking payment window expired.', 34, true)
on conflict (code) do update set
  category_code = excluded.category_code,
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();

insert into public.notification_templates(event_code, channel, name, subject, body_text, active)
values
  ('customer_booking_approval_requested', 'email', 'Customer booking approval requested email', 'Your booking request is awaiting review', E'Hi {{customer_first_name}},\n\nYour booking request for {{event_date}} is awaiting our team''s review. No payment has been taken yet.\n\nView booking: {{booking_url}}', true),
  ('customer_booking_approval_approved', 'email', 'Customer booking approval approved email', 'Your booking request has been approved', E'Hi {{customer_first_name}},\n\nYour booking request was approved. Complete your deposit payment by {{expires_at}} to secure your reservation.\n\nContinue: {{action_url}}', true),
  ('customer_booking_approval_rejected', 'email', 'Customer booking approval rejected email', 'Update on your booking request', E'Hi {{customer_first_name}},\n\nUnfortunately, we''re unable to accommodate delivery for your requested date and time.\n\nView booking: {{booking_url}}', true),
  ('customer_booking_approval_expired', 'email', 'Customer booking approval expired email', 'Your booking payment window expired', E'Hi {{customer_first_name}},\n\nYour payment window expired. Your booking details are saved and you can request confirmation again.\n\nView booking: {{booking_url}}', true),
  ('customer_booking_approval_requested', 'in_app', 'Customer booking approval requested in-app', 'Booking approval request received', 'Your booking request is awaiting review.', true),
  ('customer_booking_approval_approved', 'in_app', 'Customer booking approval approved in-app', 'Booking approved', 'Your booking request was approved. Complete payment before {{expires_at}}.', true),
  ('customer_booking_approval_rejected', 'in_app', 'Customer booking approval rejected in-app', 'Booking request update', 'Your booking request was reviewed and declined.', true),
  ('customer_booking_approval_expired', 'in_app', 'Customer booking approval expired in-app', 'Payment window expired', 'Your approved payment window expired. Request confirmation again.', true)
on conflict (event_code, channel) do update set
  name = excluded.name,
  subject = excluded.subject,
  body_text = excluded.body_text,
  active = excluded.active,
  updated_at = now();

insert into public.notification_rules(event_code, recipient_role, channel, enabled, template_id)
select e.code, 'customer', t.channel, true, t.id
from public.notification_events e
join public.notification_templates t
  on t.event_code = e.code
 and t.channel in ('email', 'in_app')
where e.code in (
  'customer_booking_approval_requested',
  'customer_booking_approval_approved',
  'customer_booking_approval_rejected',
  'customer_booking_approval_expired'
)
on conflict (event_code, recipient_role, channel) do update set
  enabled = excluded.enabled,
  template_id = excluded.template_id,
  updated_at = now();

insert into public.notification_rules(event_code, recipient_role, channel, enabled)
values
  ('customer_booking_approval_requested', 'admin', 'in_app', true),
  ('customer_booking_approval_requested', 'manager', 'in_app', true)
on conflict (event_code, recipient_role, channel) do update set
  enabled = excluded.enabled,
  updated_at = now();

create or replace function public.enqueue_staff_booking_notification(
  p_event_code text,
  p_booking_id uuid,
  p_recipient_role text,
  p_dedupe_suffix text default null,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.notification_events%rowtype;
  v_rule record;
  v_inserted integer := 0;
  v_key text;
begin
  select * into v_event
  from public.notification_events
  where code = p_event_code and active = true;

  if not found then
    return 0;
  end if;

  for v_rule in
    select r.*, cs.enabled as channel_enabled
    from public.notification_rules r
    join public.notification_channel_settings cs on cs.channel = r.channel
    where r.event_code = p_event_code
      and r.recipient_role = p_recipient_role
      and r.enabled = true
      and cs.enabled = true
  loop
    v_key := concat_ws(':', p_event_code, p_booking_id::text, p_recipient_role, v_rule.channel, coalesce(p_dedupe_suffix, 'booking'));

    insert into public.notification_deliveries(
      event_code,
      category_code,
      channel,
      recipient_role,
      booking_id,
      template_id,
      status,
      scheduled_for,
      dedupe_key,
      payload
    ) values (
      p_event_code,
      v_event.category_code,
      v_rule.channel,
      p_recipient_role,
      p_booking_id,
      v_rule.template_id,
      'queued',
      now() + make_interval(mins => greatest(coalesce(v_rule.delay_minutes, 0), 0)),
      v_key,
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.enqueue_staff_booking_notification(text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_staff_booking_notification(text, uuid, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;

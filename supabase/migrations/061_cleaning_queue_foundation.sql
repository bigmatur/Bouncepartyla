-- =========================================================
-- 061 Cleaning Queue foundation
-- Bounce Party LA Booking System
--
-- Extends the existing inventory + Route Board architecture.
-- No duplicate inventory source is introduced.
-- =========================================================

create extension if not exists "uuid-ossp";

alter table if exists public.inventory_items
  add column if not exists needs_cleaning boolean not null default false;

alter table if exists public.inventory_reservations
  add column if not exists picked_up_at timestamptz;

create table if not exists public.inventory_cleaning_tasks (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references public.bookings(id) on delete set null,
  route_stop_id uuid references public.route_stops(id) on delete set null,
  reservation_id uuid references public.inventory_reservations(id) on delete set null,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  inventory_unit_id uuid references public.inventory_units(id) on delete set null,
  quantity numeric(12,2) not null default 1,
  status text not null default 'waiting',
  source text not null default 'route_pickup',
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  problem_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_cleaning_tasks_quantity_positive check (quantity > 0),
  constraint inventory_cleaning_tasks_status_check check (
    status in ('waiting', 'in_progress', 'completed', 'problem', 'skipped')
  )
);

create unique index if not exists uq_inventory_cleaning_tasks_reservation
  on public.inventory_cleaning_tasks(reservation_id)
  where reservation_id is not null;

create index if not exists idx_inventory_cleaning_tasks_status
  on public.inventory_cleaning_tasks(status, created_at);

create index if not exists idx_inventory_cleaning_tasks_booking
  on public.inventory_cleaning_tasks(booking_id);

create index if not exists idx_inventory_cleaning_tasks_item
  on public.inventory_cleaning_tasks(inventory_item_id);

create index if not exists idx_inventory_cleaning_tasks_unit
  on public.inventory_cleaning_tasks(inventory_unit_id);

alter table public.inventory_cleaning_tasks enable row level security;

drop policy if exists inventory_cleaning_tasks_staff_all
  on public.inventory_cleaning_tasks;
create policy inventory_cleaning_tasks_staff_all
on public.inventory_cleaning_tasks
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role <> 'customer'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role <> 'customer'
  )
);

create or replace function public.enqueue_cleaning_for_booking(
  p_booking_id uuid,
  p_route_stop_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_booking_id is null then
    return 0;
  end if;

  -- Route pickup is also the authoritative moment that the equipment has
  -- been collected from the customer. Keep the existing reservation row and
  -- mark only the timestamp; Returns can still process the warehouse arrival.
  update public.inventory_reservations
  set
    picked_up_at = coalesce(picked_up_at, now()),
    updated_at = now()
  where booking_id = p_booking_id;

  insert into public.inventory_cleaning_tasks (
    booking_id,
    route_stop_id,
    reservation_id,
    inventory_item_id,
    inventory_unit_id,
    quantity,
    status,
    source,
    created_at,
    updated_at
  )
  select
    r.booking_id,
    p_route_stop_id,
    r.id,
    r.inventory_item_id,
    r.inventory_unit_id,
    greatest(coalesce(r.quantity, 1), 0.01),
    'waiting',
    'route_pickup',
    now(),
    now()
  from public.inventory_reservations r
  join public.inventory_items i
    on i.id = r.inventory_item_id
  where r.booking_id = p_booking_id
    and i.needs_cleaning = true
    and coalesce(i.active, true) = true
  on conflict (reservation_id) where reservation_id is not null do nothing;

  get diagnostics v_count = row_count;

  -- Serialized units must not become bookable while waiting for cleaning.
  update public.inventory_units u
  set
    status = 'dirty',
    updated_at = now()
  where u.id in (
    select t.inventory_unit_id
    from public.inventory_cleaning_tasks t
    where t.booking_id = p_booking_id
      and t.inventory_unit_id is not null
      and t.status in ('waiting', 'in_progress')
  )
  and u.status not in ('damaged', 'maintenance', 'missing', 'retired');

  return v_count;
end;
$$;

create or replace function public.route_pickup_enqueue_cleaning_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stop_type = 'pickup'
     and new.booking_id is not null
     and new.status in ('picked_up', 'completed')
     and old.status is distinct from new.status then
    perform public.enqueue_cleaning_for_booking(new.booking_id, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists route_pickup_enqueue_cleaning
  on public.route_stops;
create trigger route_pickup_enqueue_cleaning
after update of status on public.route_stops
for each row
execute function public.route_pickup_enqueue_cleaning_trigger();

create or replace function public.start_inventory_cleaning_task(p_task_id uuid)
returns public.inventory_cleaning_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_task public.inventory_cleaning_tasks;
begin
  select p.id
  into v_profile_id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.is_active = true
  limit 1;

  if v_profile_id is null then
    raise exception 'Staff profile is required.';
  end if;

  update public.inventory_cleaning_tasks
  set
    status = 'in_progress',
    assigned_profile_id = coalesce(assigned_profile_id, v_profile_id),
    started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = p_task_id
    and status = 'waiting'
  returning * into v_task;

  if v_task.id is null then
    select * into v_task
    from public.inventory_cleaning_tasks
    where id = p_task_id;
  end if;

  if v_task.inventory_unit_id is not null then
    update public.inventory_units
    set status = 'cleaning', updated_at = now()
    where id = v_task.inventory_unit_id
      and status not in ('damaged', 'maintenance', 'missing', 'retired');
  end if;

  return v_task;
end;
$$;

create or replace function public.complete_inventory_cleaning_task(p_task_id uuid)
returns public.inventory_cleaning_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.inventory_cleaning_tasks;
begin
  update public.inventory_cleaning_tasks
  set
    status = 'completed',
    completed_at = coalesce(completed_at, now()),
    updated_at = now()
  where id = p_task_id
    and status in ('waiting', 'in_progress')
  returning * into v_task;

  if v_task.id is null then
    select * into v_task
    from public.inventory_cleaning_tasks
    where id = p_task_id;
  end if;

  if v_task.inventory_unit_id is not null then
    update public.inventory_units
    set
      status = 'available',
      condition = 'good',
      last_cleaned_at = now(),
      updated_at = now()
    where id = v_task.inventory_unit_id
      and status not in ('damaged', 'maintenance', 'missing', 'retired');
  end if;

  return v_task;
end;
$$;

create or replace function public.problem_inventory_cleaning_task(
  p_task_id uuid,
  p_notes text default null
)
returns public.inventory_cleaning_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.inventory_cleaning_tasks;
begin
  update public.inventory_cleaning_tasks
  set
    status = 'problem',
    problem_at = coalesce(problem_at, now()),
    notes = coalesce(nullif(trim(p_notes), ''), notes),
    updated_at = now()
  where id = p_task_id
    and status in ('waiting', 'in_progress')
  returning * into v_task;

  if v_task.id is null then
    select * into v_task
    from public.inventory_cleaning_tasks
    where id = p_task_id;
  end if;

  if v_task.inventory_unit_id is not null then
    update public.inventory_units
    set status = 'maintenance', updated_at = now()
    where id = v_task.inventory_unit_id
      and status not in ('damaged', 'missing', 'retired');
  end if;

  return v_task;
end;
$$;

grant execute on function public.enqueue_cleaning_for_booking(uuid, uuid) to authenticated;
grant execute on function public.start_inventory_cleaning_task(uuid) to authenticated;
grant execute on function public.complete_inventory_cleaning_task(uuid) to authenticated;
grant execute on function public.problem_inventory_cleaning_task(uuid, text) to authenticated;

notify pgrst, 'reload schema';

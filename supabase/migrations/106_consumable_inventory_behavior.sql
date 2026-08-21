-- =========================================================
-- 106 Consumable inventory behavior
-- Adds relationship-level reusable/consumable behavior without changing
-- existing rental defaults.
-- =========================================================

begin;

alter table if exists public.product_inventory_components
  add column if not exists inventory_behavior text not null default 'reusable';

alter table if exists public.inventory_recipes
  add column if not exists inventory_behavior text not null default 'reusable';

alter table if exists public.modifier_group_options
  add column if not exists inventory_behavior text not null default 'reusable';

alter table if exists public.inventory_reservations
  add column if not exists inventory_behavior text not null default 'reusable',
  add column if not exists consumed_at timestamptz;

do $$
begin
  alter table public.product_inventory_components
    add constraint product_inventory_components_inventory_behavior_check
    check (inventory_behavior in ('reusable', 'consumable'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.inventory_recipes
    add constraint inventory_recipes_inventory_behavior_check
    check (inventory_behavior in ('reusable', 'consumable'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.modifier_group_options
    add constraint modifier_group_options_inventory_behavior_check
    check (inventory_behavior in ('reusable', 'consumable'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.inventory_reservations
    add constraint inventory_reservations_inventory_behavior_check
    check (inventory_behavior in ('reusable', 'consumable'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter type public.inventory_reservation_status add value if not exists 'consumed';
exception when undefined_object then null;
end $$;

create or replace function public.process_inventory_return(
  p_reservation_id uuid,
  p_item_id uuid,
  p_unit_id uuid default null,
  p_booking_id uuid default null,
  p_current_status text default null,
  p_result_status text default 'returned',
  p_location_id uuid default null,
  p_damage_reported boolean default false,
  p_damage_notes text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.inventory_reservations%rowtype;
  v_unit public.inventory_units%rowtype;
  v_now timestamptz := now();
  v_movement_type text;
  v_returned_at timestamptz;
  v_return_movement_exists boolean;
  v_maintenance_log_exists boolean;
  v_quantity numeric(12,2);
begin
  if not public.current_user_can_manage_inventory() then
    raise exception 'Inventory management permission is required.';
  end if;

  if p_reservation_id is null or p_item_id is null then
    raise exception 'Missing return data.';
  end if;

  if p_result_status not in ('available', 'returned', 'cleaning', 'maintenance', 'damaged') then
    raise exception 'Invalid return status.';
  end if;

  select *
  into v_reservation
  from public.inventory_reservations
  where id = p_reservation_id
  for update;

  if v_reservation.id is null then
    raise exception 'Inventory reservation not found.';
  end if;

  if v_reservation.inventory_item_id <> p_item_id then
    raise exception 'Return item does not match the reservation.';
  end if;

  select exists (
    select 1
    from public.inventory_movements
    where reference_type = 'inventory_reservation'
      and reference_id = v_reservation.id
      and movement_type in ('return_to_warehouse', 'send_to_cleaning', 'send_to_repair', 'consume_inventory')
  )
  into v_return_movement_exists;

  if v_return_movement_exists then
    return jsonb_build_object(
      'status', 'already_processed',
      'reservation_id', v_reservation.id,
      'returned_at', v_reservation.returned_at,
      'consumed_at', v_reservation.consumed_at
    );
  end if;

  v_returned_at := coalesce(v_reservation.returned_at, v_now);
  v_quantity := greatest(coalesce(v_reservation.quantity, 1), 0);

  if v_reservation.inventory_behavior = 'consumable'
     and v_reservation.inventory_unit_id is null then
    update public.inventory_items
    set
      quantity_on_hand = greatest(coalesce(quantity_on_hand, 0) - v_quantity, 0),
      quantity_available = least(
        greatest(coalesce(quantity_available, 0), 0),
        greatest(coalesce(quantity_on_hand, 0) - v_quantity, 0)
      ),
      updated_at = v_now
    where id = p_item_id;

    update public.inventory_reservations
    set
      status = 'consumed',
      returned_at = v_returned_at,
      consumed_at = coalesce(consumed_at, v_now),
      warehouse_location_id = p_location_id,
      updated_at = v_now
    where id = p_reservation_id;

    insert into public.inventory_movements (
      movement_type,
      inventory_item_id,
      inventory_unit_id,
      booking_id,
      quantity,
      from_status,
      to_status,
      to_location_id,
      reference_type,
      reference_id,
      reason,
      notes
    )
    values (
      'consume_inventory',
      p_item_id,
      null,
      p_booking_id,
      v_quantity,
      coalesce(p_current_status, v_reservation.status::text),
      'consumed',
      p_location_id,
      'inventory_reservation',
      p_reservation_id,
      'Consumed by booking',
      p_notes
    );

    return jsonb_build_object(
      'status', 'consumed',
      'reservation_id', p_reservation_id,
      'consumed_at', v_now
    );
  end if;

  if p_unit_id is not null then
    select *
    into v_unit
    from public.inventory_units
    where id = p_unit_id
    for update;

    if v_unit.id is null then
      raise exception 'Inventory unit not found.';
    end if;

    if v_reservation.inventory_unit_id is distinct from p_unit_id then
      raise exception 'Return unit does not match the reservation.';
    end if;

    update public.inventory_units
    set
      status = p_result_status,
      warehouse_location_id = p_location_id,
      last_inspected_at = case
        when p_result_status = 'available' then v_now
        else last_inspected_at
      end,
      last_cleaned_at = case
        when p_result_status = 'cleaning' then null
        else last_cleaned_at
      end,
      updated_at = v_now
    where id = p_unit_id;
  end if;

  update public.inventory_reservations
  set
    returned_at = v_returned_at,
    warehouse_location_id = p_location_id,
    damage_reported = p_damage_reported,
    damage_notes = p_damage_notes,
    inspected_at = case
      when p_result_status = 'available' then v_now
      else inspected_at
    end,
    cleaned_at = case
      when p_result_status = 'cleaning' then null
      else cleaned_at
    end,
    updated_at = v_now
  where id = p_reservation_id;

  v_movement_type := case
    when p_result_status = 'cleaning' then 'send_to_cleaning'
    when p_result_status in ('maintenance', 'damaged') then 'send_to_repair'
    else 'return_to_warehouse'
  end;

  insert into public.inventory_movements (
    movement_type,
    inventory_item_id,
    inventory_unit_id,
    booking_id,
    quantity,
    from_status,
    to_status,
    to_location_id,
    reference_type,
    reference_id,
    reason,
    notes
  )
  values (
    v_movement_type,
    p_item_id,
    p_unit_id,
    p_booking_id,
    coalesce(v_reservation.quantity, 1),
    p_current_status,
    p_result_status,
    p_location_id,
    'inventory_reservation',
    p_reservation_id,
    'Returned from booking',
    p_notes
  );

  if p_damage_reported or p_result_status in ('damaged', 'maintenance') then
    if v_reservation.returned_at is not null then
      select exists (
        select 1
        from public.inventory_maintenance_logs
        where inventory_item_id = p_item_id
          and inventory_unit_id is not distinct from p_unit_id
          and booking_id is not distinct from p_booking_id
          and log_type = case when p_damage_reported then 'damage' else 'maintenance' end
          and title = case
            when p_damage_reported then 'Damage reported on return'
            else 'Needs maintenance after return'
          end
          and description is not distinct from coalesce(p_damage_notes, p_notes)
      )
      into v_maintenance_log_exists;
    else
      v_maintenance_log_exists := false;
    end if;

    if not v_maintenance_log_exists then
      insert into public.inventory_maintenance_logs (
        inventory_item_id,
        inventory_unit_id,
        booking_id,
        log_type,
        status,
        title,
        description
      )
      values (
        p_item_id,
        p_unit_id,
        p_booking_id,
        case when p_damage_reported then 'damage' else 'maintenance' end,
        'open',
        case
          when p_damage_reported then 'Damage reported on return'
          else 'Needs maintenance after return'
        end,
        coalesce(p_damage_notes, p_notes)
      );
    end if;
  end if;

  return jsonb_build_object(
    'status', 'processed',
    'reservation_id', p_reservation_id,
    'result_status', p_result_status,
    'returned_at', v_returned_at
  );
end;
$$;

revoke all on function public.process_inventory_return(
  uuid, uuid, uuid, uuid, text, text, uuid, boolean, text, text
) from public, anon;

grant execute on function public.process_inventory_return(
  uuid, uuid, uuid, uuid, text, text, uuid, boolean, text, text
) to authenticated;

notify pgrst, 'reload schema';

commit;
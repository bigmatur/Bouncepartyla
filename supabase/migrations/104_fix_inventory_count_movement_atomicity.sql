-- 104_fix_inventory_count_movement_atomicity.sql
-- Make Inventory Count start and completion atomic with their audit movements.

begin;

create or replace function public.start_inventory_count(
  p_count_number text,
  p_warehouse_location_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_id uuid;
  v_line_count integer := 0;
  v_item record;
  v_unit record;
  v_has_units boolean;
  v_now timestamptz := now();
begin
  if not public.current_user_can_manage_inventory() then
    raise exception 'Inventory management permission is required.';
  end if;

  if nullif(trim(p_count_number), '') is null then
    raise exception 'Missing inventory count number.';
  end if;

  insert into public.inventory_counts (
    count_number,
    status,
    warehouse_location_id,
    notes
  )
  values (
    trim(p_count_number),
    'in_progress',
    p_warehouse_location_id,
    p_notes
  )
  returning id into v_count_id;

  for v_item in
    select
      i.id,
      i.tracking_type,
      i.quantity_on_hand
    from public.inventory_items i
    where i.active = true
  loop
    if v_item.tracking_type in ('quantity', 'consumable') then
      insert into public.inventory_count_lines (
        inventory_count_id,
        inventory_item_id,
        inventory_unit_id,
        expected_quantity,
        counted_quantity,
        difference_quantity,
        expected_status,
        counted_status
      )
      values (
        v_count_id,
        v_item.id,
        null,
        coalesce(v_item.quantity_on_hand, 0),
        coalesce(v_item.quantity_on_hand, 0),
        0,
        null,
        null
      );

      v_line_count := v_line_count + 1;
      continue;
    end if;

    v_has_units := false;

    for v_unit in
      select
        u.id,
        u.status,
        u.warehouse_location_id
      from public.inventory_units u
      where u.inventory_item_id = v_item.id
    loop
      v_has_units := true;

      if p_warehouse_location_id is not null
        and v_unit.warehouse_location_id is not null
        and v_unit.warehouse_location_id <> p_warehouse_location_id then
        continue;
      end if;

      insert into public.inventory_count_lines (
        inventory_count_id,
        inventory_item_id,
        inventory_unit_id,
        expected_quantity,
        counted_quantity,
        difference_quantity,
        expected_status,
        counted_status
      )
      values (
        v_count_id,
        v_item.id,
        v_unit.id,
        1,
        1,
        0,
        v_unit.status,
        v_unit.status
      );

      v_line_count := v_line_count + 1;
    end loop;

    if not v_has_units then
      insert into public.inventory_count_lines (
        inventory_count_id,
        inventory_item_id,
        inventory_unit_id,
        expected_quantity,
        counted_quantity,
        difference_quantity,
        expected_status,
        counted_status,
        notes
      )
      values (
        v_count_id,
        v_item.id,
        null,
        0,
        0,
        0,
        null,
        null,
        'No units found for this item.'
      );

      v_line_count := v_line_count + 1;
    end if;
  end loop;

  insert into public.inventory_movements (
    movement_type,
    quantity,
    reason,
    notes,
    to_location_id
  )
  values (
    'inventory_count',
    v_line_count,
    'Inventory count started',
    trim(p_count_number),
    p_warehouse_location_id
  );

  return jsonb_build_object(
    'status', 'processed',
    'count_id', v_count_id,
    'line_count', v_line_count
  );
end;
$$;

create or replace function public.complete_inventory_count(
  p_count_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count public.inventory_counts%rowtype;
  v_now timestamptz := now();
begin
  if not public.current_user_can_manage_inventory() then
    raise exception 'Inventory management permission is required.';
  end if;

  if p_count_id is null then
    raise exception 'Missing count id.';
  end if;

  select *
  into v_count
  from public.inventory_counts
  where id = p_count_id
  for update;

  if v_count.id is null then
    raise exception 'Count not found.';
  end if;

  if v_count.status = 'completed' then
    return jsonb_build_object(
      'status', 'already_processed',
      'count_id', v_count.id
    );
  end if;

  if v_count.status = 'cancelled' then
    raise exception 'Cancelled inventory count cannot be completed.';
  end if;

  if v_count.status not in ('draft', 'in_progress') then
    raise exception 'Inventory count has an unknown lifecycle status: %.', v_count.status;
  end if;

  update public.inventory_counts
  set
    status = 'completed',
    completed_at = v_now
  where id = p_count_id;

  insert into public.inventory_movements (
    movement_type,
    quantity,
    reason,
    notes,
    to_location_id
  )
  values (
    'inventory_count',
    1,
    'Inventory count completed',
    v_count.count_number,
    v_count.warehouse_location_id
  );

  return jsonb_build_object(
    'status', 'processed',
    'count_id', v_count.id,
    'completed_at', v_now
  );
end;
$$;

revoke all on function public.start_inventory_count(text, uuid, text)
from public, anon;

grant execute on function public.start_inventory_count(text, uuid, text)
to authenticated;

revoke all on function public.complete_inventory_count(uuid)
from public, anon;

grant execute on function public.complete_inventory_count(uuid)
to authenticated;

commit;

notify pgrst, 'reload schema';

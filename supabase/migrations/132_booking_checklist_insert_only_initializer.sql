begin;

create or replace function public.initialize_booking_checklist_items_insert_only_internal(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking_id uuid;
  v_inserted integer := 0;
  v_inserted_second integer := 0;
  v_key bigint;
  v_has_fractional_quantity boolean := false;
begin
  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'invalid_input');
  end if;

  select b.id
  into v_booking_id
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  v_key := hashtextextended(coalesce(p_booking_id::text, ''), 0);
  perform pg_advisory_xact_lock(v_key);

  select exists (
    select 1
    from public.inventory_reservations ir
    where ir.booking_id = p_booking_id
      and coalesce(ir.status, '') in ('reserved', 'picked', 'loaded', 'delivered', 'installed')
      and floor(coalesce(ir.quantity, 0)) <> coalesce(ir.quantity, 0)
  ) into v_has_fractional_quantity;

  if v_has_fractional_quantity then
    return jsonb_build_object(
      'success', false,
      'status', 'fractional_quantity_unsupported',
      'booking_id', p_booking_id
    );
  end if;

  with booking_item_rows as (
    select
      bi.id as booking_item_id,
      bi.booking_id,
      coalesce(nullif(trim(p.name), ''), 'Booking item') as title,
      greatest(coalesce(bi.quantity, 1), 1)::int as quantity,
      row_number() over (order by bi.created_at, bi.id) as rn
    from public.booking_items bi
    left join public.products p on p.id = bi.product_id
    where bi.booking_id = p_booking_id
  )
  insert into public.booking_checklist_items (
    booking_id,
    booking_item_id,
    inventory_item_id,
    inventory_unit_id,
    title,
    item_type,
    source,
    quantity,
    sort_order,
    status,
    created_at,
    updated_at
  )
  select
    bir.booking_id,
    bir.booking_item_id,
    null,
    null,
    bir.title,
    'equipment',
    'booking_item',
    bir.quantity,
    (bir.rn * 10),
    'open',
    now(),
    now()
  from booking_item_rows bir
  where not exists (
    select 1
    from public.booking_checklist_items existing
    where existing.booking_id = p_booking_id
      and coalesce(existing.source, '') = 'booking_item'
      and existing.booking_item_id = bir.booking_item_id
  );

  get diagnostics v_inserted = row_count;

  with reservation_rows as (
    select
      ir.id as reservation_id,
      ir.booking_id,
      ir.booking_item_id,
      ir.inventory_item_id,
      ir.inventory_unit_id,
      coalesce(ii.name, 'Inventory item') as item_name,
      nullif(trim(coalesce(iu.unit_code, iu.serial_number, '')), '') as unit_code,
      greatest(coalesce(ir.quantity, 1), 1) as quantity,
      row_number() over (order by ir.created_at, ir.id) as rn
    from public.inventory_reservations ir
    left join public.inventory_items ii on ii.id = ir.inventory_item_id
    left join public.inventory_units iu on iu.id = ir.inventory_unit_id
    where ir.booking_id = p_booking_id
      and coalesce(ir.status, '') in ('reserved', 'picked', 'loaded', 'delivered', 'installed')
  ),
  reservation_groups as (
    select
      rr.booking_id,
      rr.booking_item_id,
      rr.inventory_item_id,
      rr.inventory_unit_id,
      rr.item_name,
      rr.unit_code,
      sum(rr.quantity) as quantity,
      min(rr.rn) as min_rn
    from reservation_rows rr
    group by
      rr.booking_id,
      rr.booking_item_id,
      rr.inventory_item_id,
      rr.inventory_unit_id,
      rr.item_name,
      rr.unit_code
  )
  insert into public.booking_checklist_items (
    booking_id,
    booking_item_id,
    inventory_item_id,
    inventory_unit_id,
    title,
    item_type,
    source,
    quantity,
    sort_order,
    status,
    created_at,
    updated_at
  )
  select
    rg.booking_id,
    rg.booking_item_id,
    rg.inventory_item_id,
    rg.inventory_unit_id,
    case
      when rg.unit_code is not null then rg.item_name || ' - ' || rg.unit_code
      else rg.item_name
    end,
    'component',
    'inventory_reservation',
    rg.quantity,
    1000 + (rg.min_rn * 10),
    'open',
    now(),
    now()
  from reservation_groups rg
  where not exists (
    select 1
    from public.booking_checklist_items existing
    where existing.booking_id = p_booking_id
      and coalesce(existing.source, '') = 'inventory_reservation'
      and (
        (rg.inventory_unit_id is not null and existing.inventory_unit_id = rg.inventory_unit_id)
        or (
          rg.inventory_unit_id is null
          and existing.inventory_unit_id is null
          and coalesce(existing.booking_item_id::text, '') = coalesce(rg.booking_item_id::text, '')
          and coalesce(existing.inventory_item_id::text, '') = coalesce(rg.inventory_item_id::text, '')
        )
      )
  );

  get diagnostics v_inserted_second = row_count;
  v_inserted := v_inserted + v_inserted_second;

  return jsonb_build_object(
    'success', true,
    'status', 'ok',
    'booking_id', p_booking_id,
    'inserted', v_inserted
  );
end;
$$;

revoke all on function public.initialize_booking_checklist_items_insert_only_internal(uuid)
  from public, anon, authenticated;
grant execute on function public.initialize_booking_checklist_items_insert_only_internal(uuid)
  to service_role;

create or replace function public.initialize_booking_checklist_items_insert_only(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auth_role text := coalesce(auth.role(), '');
begin
  if p_booking_id is null then
    return jsonb_build_object('success', false, 'status', 'invalid_input');
  end if;

  if v_auth_role <> 'authenticated' then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  if not public.current_user_can_create_bookings() then
    return jsonb_build_object('success', false, 'status', 'forbidden');
  end if;

  return public.initialize_booking_checklist_items_insert_only_internal(p_booking_id);
end;
$$;

revoke all on function public.initialize_booking_checklist_items_insert_only(uuid)
  from public, anon;
grant execute on function public.initialize_booking_checklist_items_insert_only(uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;

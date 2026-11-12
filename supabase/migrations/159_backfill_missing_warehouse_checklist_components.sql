begin;

-- Older checklist snapshots may contain the correct physical item but no
-- booking_item_id. Restore that parent only when the active reservation data
-- points to exactly one product in the booking. Ambiguous rows remain untouched.
with unique_parent as (
  select
    bci.id as checklist_item_id,
    min(ir.booking_item_id::text)::uuid as booking_item_id
  from public.booking_checklist_items bci
  join public.inventory_reservations ir
    on ir.booking_id = bci.booking_id
   and ir.inventory_item_id = bci.inventory_item_id
   and (
     (ir.inventory_unit_id is not null and ir.inventory_unit_id = bci.inventory_unit_id)
     or (ir.inventory_unit_id is null and bci.inventory_unit_id is null)
   )
  where bci.booking_item_id is null
    and bci.inventory_item_id is not null
    and ir.booking_item_id is not null
    and coalesce(ir.status::text, '') in (
      'reserved',
      'picked',
      'loaded',
      'delivered',
      'installed'
    )
  group by bci.id
  having count(distinct ir.booking_item_id) = 1
)
update public.booking_checklist_items bci
set
  booking_item_id = unique_parent.booking_item_id,
  updated_at = now()
from unique_parent
where bci.id = unique_parent.checklist_item_id;

-- Repair older bookings whose inventory reservations were completed after the
-- initial warehouse checklist snapshot. This is insert-only: existing checks,
-- quantities and completion state are preserved. Keep the repair self-contained
-- instead of invoking an older initializer that may still compare enum values to
-- an invalid empty-string enum literal.
with reservation_rows as (
  select
    ir.booking_id,
    ir.booking_item_id,
    ir.inventory_item_id,
    ir.inventory_unit_id,
    coalesce(ii.name, 'Inventory item') as item_name,
    nullif(trim(coalesce(iu.unit_code, iu.serial_number, '')), '') as unit_code,
    greatest(coalesce(ir.quantity, 1), 1) as quantity,
    row_number() over (
      partition by ir.booking_id
      order by ir.created_at, ir.id
    ) as rn
  from public.inventory_reservations ir
  left join public.inventory_items ii on ii.id = ir.inventory_item_id
  left join public.inventory_units iu on iu.id = ir.inventory_unit_id
  where ir.booking_id is not null
    and coalesce(ir.status::text, '') in (
      'reserved',
      'picked',
      'loaded',
      'delivered',
      'installed'
    )
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
  where existing.booking_id = rg.booking_id
    and coalesce(existing.source, '') = 'inventory_reservation'
    and (
      (
        rg.inventory_unit_id is not null
        and existing.inventory_unit_id = rg.inventory_unit_id
      )
      or (
        rg.inventory_unit_id is null
        and existing.inventory_unit_id is null
        and coalesce(existing.booking_item_id::text, '') = coalesce(rg.booking_item_id::text, '')
        and coalesce(existing.inventory_item_id::text, '') = coalesce(rg.inventory_item_id::text, '')
      )
    )
);

notify pgrst, 'reload schema';

commit;

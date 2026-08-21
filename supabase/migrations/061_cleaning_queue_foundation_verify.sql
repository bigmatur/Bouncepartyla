-- 061 Cleaning Queue verification (read-only)

-- 1) Column exists and can be configured per inventory item.
select
  column_name,
  data_type,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'inventory_items'
  and column_name = 'needs_cleaning';

-- 2) Cleaning task table / current queue.
select
  t.id,
  t.status,
  t.quantity,
  t.created_at,
  i.name as inventory_item,
  i.tracking_type,
  i.needs_cleaning,
  u.unit_code,
  b.booking_number
from public.inventory_cleaning_tasks t
join public.inventory_items i on i.id = t.inventory_item_id
left join public.inventory_units u on u.id = t.inventory_unit_id
left join public.bookings b on b.id = t.booking_id
order by t.created_at desc
limit 100;

-- 3) Inventory flagged for automatic cleaning.
select
  i.id,
  i.name,
  i.sku,
  i.tracking_type,
  i.needs_cleaning,
  c.name as category
from public.inventory_items i
left join public.inventory_categories c on c.id = i.category_id
where i.active = true
order by c.sort_order nulls last, i.sort_order, i.name;

-- 4) Open cleaning tasks should be unique per reservation.
select
  reservation_id,
  count(*) as task_count
from public.inventory_cleaning_tasks
where reservation_id is not null
group by reservation_id
having count(*) > 1;

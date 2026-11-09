-- Verification for migration 153.
-- Expected result: one row, with all values true.

select exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'inventory_reservations'
    and column_name = 'modifier_id'
) as modifier_id_present,
exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'inventory_reservations'
    and column_name = 'product_id'
) as product_id_present,
exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'inventory_reservations'
    and column_name = 'requirement_type'
) as requirement_type_present;

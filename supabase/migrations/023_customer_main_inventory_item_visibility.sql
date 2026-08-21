-- =========================================================
-- 023 Customer main inventory item visibility
-- Ensures customer booking availability can read the primary inventory item
-- linked directly from active products, not only component or recipe rows.
-- =========================================================

alter table if exists public.inventory_items enable row level security;
alter table if exists public.inventory_units enable row level security;

drop policy if exists inventory_items_select_customer_active_product_items on public.inventory_items;
create policy inventory_items_select_customer_active_product_items
on public.inventory_items
for select
to authenticated
using (
    select 1
    from public.products as products
    where products.active = true
      and products.inventory_item_id = inventory_items.id
  )
  or exists (
    select 1
    from public.product_inventory_components as components
    join public.products as products
      on products.id = components.product_id
    where components.inventory_item_id = inventory_items.id
      and products.active = true
  )
  or exists (
    select 1
    from public.inventory_recipes as recipes
    join public.products as products
      on products.id = recipes.product_id
    where recipes.inventory_item_id = inventory_items.id
      and products.active = true
  )
  or exists (
    select 1
    from public.modifier_group_options as options
    join public.product_modifier_groups as product_modifier_groups
      on product_modifier_groups.modifier_group_id = options.modifier_group_id
    join public.products as products
      on products.id = product_modifier_groups.product_id
    where options.inventory_item_id = inventory_items.id
      and options.active = true
      and product_modifier_groups.active = true
      and products.active = true
  )
  or exists (
    select 1
    from public.profiles as profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.is_active = true
      and profiles.role is not null
      and profiles.role <> 'customer'
  )
);

drop policy if exists inventory_units_select_customer_active_product_items on public.inventory_units;
create policy inventory_units_select_customer_active_product_items
on public.inventory_units
for select
to authenticated
using (
  exists (
    select 1
    from public.products as products
    where products.active = true
      and products.inventory_item_id = inventory_items.id
  )
      and products.inventory_item_id = inventory_units.inventory_item_id
  )
  or exists (
    select 1
    from public.product_inventory_components as components
    join public.products as products
      on products.id = components.product_id
    where components.inventory_item_id = inventory_units.inventory_item_id
      and products.active = true
  )
  or exists (
    select 1
    from public.inventory_recipes as recipes
    join public.products as products
      on products.id = recipes.product_id
    where recipes.inventory_item_id = inventory_units.inventory_item_id
      and products.active = true
  )
  or exists (
    select 1
    from public.profiles as profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.is_active = true
      and profiles.role is not null
      and profiles.role <> 'customer'
  )
);

notify pgrst, 'reload schema';
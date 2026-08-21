-- =========================================================
-- 018 Customer catalog visibility and component read access
-- Allows customer accounts to see active products while staff can see all.
-- Safe/idempotent migration.
-- =========================================================

alter table if exists public.products enable row level security;
alter table if exists public.product_inventory_components enable row level security;
alter table if exists public.inventory_items enable row level security;

drop policy if exists products_select_staff_or_customer_active on public.products;
create policy products_select_staff_or_customer_active
on public.products
for select
to authenticated
using (
  active = true
  or exists (
    select 1
    from public.profiles as profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.is_active = true
      and profiles.role is not null
      and profiles.role <> 'customer'
  )
);

drop policy if exists product_inventory_components_select_staff_or_active_products on public.product_inventory_components;
create policy product_inventory_components_select_staff_or_active_products
on public.product_inventory_components
for select
to authenticated
using (
  exists (
    select 1
    from public.products as products
    where products.id = product_inventory_components.product_id
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

drop policy if exists inventory_items_select_staff_or_active_product_components on public.inventory_items;
create policy inventory_items_select_staff_or_active_product_components
on public.inventory_items
for select
to authenticated
using (
  exists (
    select 1
    from public.product_inventory_components as components
    join public.products as products
      on products.id = components.product_id
    where components.inventory_item_id = inventory_items.id
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

-- =========================================================
-- 019 Customer modifier visibility for booking wizard
-- Allows authenticated customers to read active modifier groups/options
-- connected to active products.
-- =========================================================

alter table if exists public.product_modifier_groups enable row level security;
alter table if exists public.modifier_groups enable row level security;
alter table if exists public.modifier_group_options enable row level security;
alter table if exists public.inventory_items enable row level security;

-- product_modifier_groups

drop policy if exists product_modifier_groups_select_staff_or_active_products on public.product_modifier_groups;
create policy product_modifier_groups_select_staff_or_active_products
on public.product_modifier_groups
for select
to authenticated
using (
  (
    active = true
    and exists (
      select 1
      from public.products as products
      where products.id = product_modifier_groups.product_id
        and products.active = true
    )
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

-- modifier_groups

drop policy if exists modifier_groups_select_staff_or_active_products on public.modifier_groups;
create policy modifier_groups_select_staff_or_active_products
on public.modifier_groups
for select
to authenticated
using (
  (
    active = true
    and exists (
      select 1
      from public.product_modifier_groups as pmg
      join public.products as products on products.id = pmg.product_id
      where pmg.modifier_group_id = modifier_groups.id
        and pmg.active = true
        and products.active = true
    )
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

-- modifier_group_options

drop policy if exists modifier_group_options_select_staff_or_active_products on public.modifier_group_options;
create policy modifier_group_options_select_staff_or_active_products
on public.modifier_group_options
for select
to authenticated
using (
  (
    active = true
    and exists (
      select 1
      from public.product_modifier_groups as pmg
      join public.products as products on products.id = pmg.product_id
      where pmg.modifier_group_id = modifier_group_options.modifier_group_id
        and pmg.active = true
        and products.active = true
    )
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

-- inventory_items used by modifier options

drop policy if exists inventory_items_select_staff_or_active_modifiers on public.inventory_items;
create policy inventory_items_select_staff_or_active_modifiers
on public.inventory_items
for select
to authenticated
using (
  exists (
    select 1
    from public.modifier_group_options as mgo
    join public.product_modifier_groups as pmg
      on pmg.modifier_group_id = mgo.modifier_group_id
    join public.products as products
      on products.id = pmg.product_id
    where mgo.inventory_item_id = inventory_items.id
      and mgo.active = true
      and pmg.active = true
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

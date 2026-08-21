-- =========================================================
-- 089 Secure catalog RLS
--
-- Goals:
-- 1. Remove legacy PUBLIC/TRUE write access.
-- 2. Keep customer-facing SELECT access for active catalog data.
-- 3. Restrict catalog writes to:
--      super_admin
--      admin
--      manager
--      content_manager
-- 4. Keep availability/customer booking reads working.
-- 5. Do not rely on is_staff(), because it currently includes driver.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- Catalog manager helper
-- ---------------------------------------------------------

create or replace function public.current_user_can_manage_catalog()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role in (
        'super_admin',
        'admin',
        'manager',
        'content_manager'
      )
  );
$$;

revoke all
on function public.current_user_can_manage_catalog()
from public;

grant execute
on function public.current_user_can_manage_catalog()
to authenticated;


-- =========================================================
-- categories
-- =========================================================

drop policy if exists
  "Allow admin all categories"
on public.categories;

create policy categories_select_authenticated
on public.categories
for select
to authenticated
using (true);

create policy categories_manage_catalog_staff
on public.categories
for all
to authenticated
using (
  public.current_user_can_manage_catalog()
)
with check (
  public.current_user_can_manage_catalog()
);


-- =========================================================
-- products
-- =========================================================

drop policy if exists
  "Staff full access products"
on public.products;

drop policy if exists
  "products_select_staff_or_customer_active"
on public.products;

create policy products_select_active_or_catalog_staff
on public.products
for select
to authenticated
using (
  active = true
  or public.current_user_can_manage_catalog()
);

create policy products_manage_catalog_staff
on public.products
for all
to authenticated
using (
  public.current_user_can_manage_catalog()
)
with check (
  public.current_user_can_manage_catalog()
);


-- =========================================================
-- modifier_groups
-- =========================================================

drop policy if exists
  "Allow admin delete modifier_groups"
on public.modifier_groups;

drop policy if exists
  "Allow admin insert modifier_groups"
on public.modifier_groups;

drop policy if exists
  "Allow admin read modifier_groups"
on public.modifier_groups;

drop policy if exists
  "Allow admin update modifier_groups"
on public.modifier_groups;

drop policy if exists
  "modifier_groups_select_staff_or_active_products"
on public.modifier_groups;

create policy modifier_groups_select_active_or_catalog_staff
on public.modifier_groups
for select
to authenticated
using (
  (
    active = true
    and exists (
      select 1
      from public.product_modifier_groups pmg
      join public.products p
        on p.id = pmg.product_id
      where pmg.modifier_group_id = modifier_groups.id
        and pmg.active = true
        and p.active = true
    )
  )
  or public.current_user_can_manage_catalog()
);

create policy modifier_groups_manage_catalog_staff
on public.modifier_groups
for all
to authenticated
using (
  public.current_user_can_manage_catalog()
)
with check (
  public.current_user_can_manage_catalog()
);


-- =========================================================
-- modifier_group_options
-- =========================================================

drop policy if exists
  "Allow admin delete modifier_group_options"
on public.modifier_group_options;

drop policy if exists
  "Allow admin insert modifier_group_options"
on public.modifier_group_options;

drop policy if exists
  "Allow admin read modifier_group_options"
on public.modifier_group_options;

drop policy if exists
  "Allow admin update modifier_group_options"
on public.modifier_group_options;

drop policy if exists
  "modifier_group_options_select_staff_or_active_products"
on public.modifier_group_options;

create policy modifier_group_options_select_active_or_catalog_staff
on public.modifier_group_options
for select
to authenticated
using (
  (
    active = true
    and exists (
      select 1
      from public.product_modifier_groups pmg
      join public.products p
        on p.id = pmg.product_id
      where pmg.modifier_group_id =
            modifier_group_options.modifier_group_id
        and pmg.active = true
        and p.active = true
    )
  )
  or public.current_user_can_manage_catalog()
);

create policy modifier_group_options_manage_catalog_staff
on public.modifier_group_options
for all
to authenticated
using (
  public.current_user_can_manage_catalog()
)
with check (
  public.current_user_can_manage_catalog()
);


-- =========================================================
-- modifiers
--
-- Legacy modifier records are still referenced by booking code.
-- Customers only need SELECT.
-- =========================================================

drop policy if exists
  "Allow admin delete modifiers"
on public.modifiers;

drop policy if exists
  "Allow admin insert modifiers"
on public.modifiers;

drop policy if exists
  "Allow admin read modifiers"
on public.modifiers;

drop policy if exists
  "Allow admin update modifiers"
on public.modifiers;

create policy modifiers_select_authenticated
on public.modifiers
for select
to authenticated
using (true);

create policy modifiers_manage_catalog_staff
on public.modifiers
for all
to authenticated
using (
  public.current_user_can_manage_catalog()
)
with check (
  public.current_user_can_manage_catalog()
);


-- =========================================================
-- product_modifier_groups
-- =========================================================

drop policy if exists
  "Staff full access product_modifier_groups"
on public.product_modifier_groups;

drop policy if exists
  "product_modifier_groups_select_staff_or_active_products"
on public.product_modifier_groups;

create policy product_modifier_groups_select_active_or_catalog_staff
on public.product_modifier_groups
for select
to authenticated
using (
  (
    active = true
    and exists (
      select 1
      from public.products p
      where p.id = product_modifier_groups.product_id
        and p.active = true
    )
  )
  or public.current_user_can_manage_catalog()
);

create policy product_modifier_groups_manage_catalog_staff
on public.product_modifier_groups
for all
to authenticated
using (
  public.current_user_can_manage_catalog()
)
with check (
  public.current_user_can_manage_catalog()
);


-- =========================================================
-- product_variants
-- =========================================================

drop policy if exists
  "Staff full access product_variants"
on public.product_variants;

create policy product_variants_select_authenticated
on public.product_variants
for select
to authenticated
using (true);

create policy product_variants_manage_catalog_staff
on public.product_variants
for all
to authenticated
using (
  public.current_user_can_manage_catalog()
)
with check (
  public.current_user_can_manage_catalog()
);


-- =========================================================
-- product_inventory_components
-- =========================================================

drop policy if exists
  "Allow admin all product_inventory_components"
on public.product_inventory_components;

drop policy if exists
  "product_inventory_components_select_staff_or_active_products"
on public.product_inventory_components;

create policy product_inventory_components_select_active_or_catalog_staff
on public.product_inventory_components
for select
to authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_inventory_components.product_id
      and p.active = true
  )
  or public.current_user_can_manage_catalog()
);

create policy product_inventory_components_manage_catalog_staff
on public.product_inventory_components
for all
to authenticated
using (
  public.current_user_can_manage_catalog()
)
with check (
  public.current_user_can_manage_catalog()
);


-- =========================================================
-- inventory_recipes
--
-- Customer-facing availability requires SELECT for active products.
-- Inventory/catalog managers may read/write all.
-- =========================================================

drop policy if exists
  "inventory_recipes_select_customer_active_products"
on public.inventory_recipes;

drop policy if exists
  "inventory_recipes_select_staff_all"
on public.inventory_recipes;

create policy inventory_recipes_select_active_or_catalog_staff
on public.inventory_recipes
for select
to authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = inventory_recipes.product_id
      and p.active = true
  )
  or public.current_user_can_manage_catalog()
  or public.current_user_can_manage_inventory()
);

create policy inventory_recipes_manage_catalog_or_inventory_staff
on public.inventory_recipes
for all
to authenticated
using (
  public.current_user_can_manage_catalog()
  or public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_catalog()
  or public.current_user_can_manage_inventory()
);


-- =========================================================
-- Remove dangerous anon write grants from catalog internals
--
-- We deliberately keep SELECT grants for now.
-- RLS will decide which rows can be read.
-- =========================================================

revoke insert, update, delete, truncate
on table public.categories
from anon;

revoke insert, update, delete, truncate
on table public.products
from anon;

revoke insert, update, delete, truncate
on table public.modifier_groups
from anon;

revoke insert, update, delete, truncate
on table public.modifier_group_options
from anon;

revoke insert, update, delete, truncate
on table public.modifiers
from anon;

revoke insert, update, delete, truncate
on table public.product_modifier_groups
from anon;

revoke insert, update, delete, truncate
on table public.product_variants
from anon;

revoke insert, update, delete, truncate
on table public.product_inventory_components
from anon;

revoke insert, update, delete, truncate
on table public.inventory_recipes
from anon;

commit;
-- =========================================================
-- 088 Secure inventory RLS
--
-- Removes legacy PUBLIC/TRUE policies and authenticated/TRUE
-- policies from internal inventory tables.
--
-- Inventory management is limited to operational inventory staff:
--   super_admin
--   admin
--   manager
--   warehouse
--
-- Customer-facing SELECT policies on inventory_units are preserved.
-- =========================================================

begin;

create or replace function public.current_user_can_manage_inventory()
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
        'warehouse'
      )
  );
$$;

revoke all
on function public.current_user_can_manage_inventory()
from public;

grant execute
on function public.current_user_can_manage_inventory()
to authenticated;


-- ---------------------------------------------------------
-- inventory_adjustments
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_adjustments"
on public.inventory_adjustments;

drop policy if exists
  "Authenticated can manage inventory adjustments"
on public.inventory_adjustments;

create policy inventory_adjustments_manage_inventory_staff
on public.inventory_adjustments
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_categories
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_categories"
on public.inventory_categories;

drop policy if exists
  "Authenticated can manage inventory categories"
on public.inventory_categories;

create policy inventory_categories_manage_inventory_staff
on public.inventory_categories
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_cleaning_logs
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_cleaning_logs"
on public.inventory_cleaning_logs;

create policy inventory_cleaning_logs_manage_inventory_staff
on public.inventory_cleaning_logs
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_count_lines
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_count_lines"
on public.inventory_count_lines;

drop policy if exists
  "Authenticated can manage inventory count lines"
on public.inventory_count_lines;

create policy inventory_count_lines_manage_inventory_staff
on public.inventory_count_lines
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_counts
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_counts"
on public.inventory_counts;

drop policy if exists
  "Authenticated can manage inventory counts"
on public.inventory_counts;

create policy inventory_counts_manage_inventory_staff
on public.inventory_counts
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_damage_reports
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_damage_reports"
on public.inventory_damage_reports;

create policy inventory_damage_reports_manage_inventory_staff
on public.inventory_damage_reports
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_inspections
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_inspections"
on public.inventory_inspections;

create policy inventory_inspections_manage_inventory_staff
on public.inventory_inspections
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_maintenance_logs
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_maintenance_logs"
on public.inventory_maintenance_logs;

drop policy if exists
  "Authenticated can manage inventory maintenance logs"
on public.inventory_maintenance_logs;

create policy inventory_maintenance_logs_manage_inventory_staff
on public.inventory_maintenance_logs
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_movements
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_movements"
on public.inventory_movements;

drop policy if exists
  "Authenticated can manage inventory movements"
on public.inventory_movements;

create policy inventory_movements_manage_inventory_staff
on public.inventory_movements
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_supplies
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_supplies"
on public.inventory_supplies;

create policy inventory_supplies_manage_inventory_staff
on public.inventory_supplies
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_supply_lines
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_supply_lines"
on public.inventory_supply_lines;

create policy inventory_supply_lines_manage_inventory_staff
on public.inventory_supply_lines
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);


-- ---------------------------------------------------------
-- inventory_units
--
-- IMPORTANT:
-- We preserve existing customer-facing SELECT policies:
--
-- inventory_units_select_customer_active_main_products
-- inventory_units_select_customer_active_products
-- inventory_units_select_staff_all
--
-- Only the unsafe PUBLIC ALL policy is removed and a proper
-- management policy is added.
-- ---------------------------------------------------------

drop policy if exists
  "Allow admin all inventory_units"
on public.inventory_units;

create policy inventory_units_manage_inventory_staff
on public.inventory_units
for all
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);

commit;
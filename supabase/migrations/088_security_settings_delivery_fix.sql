-- 088_security_settings_delivery_fix.sql
--
-- Security hardening for:
--   business_settings
--   system_settings
--   delivery_zones
--   delivery_radius_zones
--   delivery_zip_zones
--   tax_rate_cache
--   warehouse_locations
--   warehouse_working_hours
--   warehouse_working_hour_exceptions
--   damage_reports
--
-- Important:
-- Customer booking flow still needs authenticated SELECT access to
-- pricing/delivery/time configuration.
--
-- Mutations are restricted to the appropriate staff roles.

begin;

-- ============================================================================
-- 1. Remove legacy permissive PUBLIC policies
-- ============================================================================

drop policy if exists "Allow admin delete business_settings"
on public.business_settings;

drop policy if exists "Allow admin insert business_settings"
on public.business_settings;

drop policy if exists "Allow admin read business_settings"
on public.business_settings;

drop policy if exists "Allow admin update business_settings"
on public.business_settings;


drop policy if exists "Allow admin all system_settings"
on public.system_settings;


drop policy if exists "Allow admin all delivery_zones"
on public.delivery_zones;

drop policy if exists "Allow admin delete delivery_zones"
on public.delivery_zones;

drop policy if exists "Allow admin insert delivery_zones"
on public.delivery_zones;

drop policy if exists "Allow admin read delivery_zones"
on public.delivery_zones;

drop policy if exists "Allow admin update delivery_zones"
on public.delivery_zones;


drop policy if exists "Allow admin all delivery_radius_zones"
on public.delivery_radius_zones;


drop policy if exists "Allow admin all delivery_zip_zones"
on public.delivery_zip_zones;


drop policy if exists "Allow admin delete tax_rate_cache"
on public.tax_rate_cache;

drop policy if exists "Allow admin insert tax_rate_cache"
on public.tax_rate_cache;

drop policy if exists "Allow admin read tax_rate_cache"
on public.tax_rate_cache;

drop policy if exists "Allow admin update tax_rate_cache"
on public.tax_rate_cache;


drop policy if exists "Allow admin all warehouse_locations"
on public.warehouse_locations;

drop policy if exists "Allow admin delete warehouse_locations"
on public.warehouse_locations;

drop policy if exists "Allow admin insert warehouse_locations"
on public.warehouse_locations;

drop policy if exists "Allow admin read warehouse_locations"
on public.warehouse_locations;

drop policy if exists "Allow admin update warehouse_locations"
on public.warehouse_locations;

drop policy if exists "Authenticated can manage warehouse locations"
on public.warehouse_locations;


drop policy if exists "Allow admin all warehouse_working_hours"
on public.warehouse_working_hours;

drop policy if exists "Allow admin all warehouse_working_hour_exceptions"
on public.warehouse_working_hour_exceptions;


drop policy if exists "Allow admin all damage_reports"
on public.damage_reports;


-- ============================================================================
-- 2. Ensure RLS remains enabled
-- ============================================================================

alter table public.business_settings enable row level security;
alter table public.system_settings enable row level security;

alter table public.delivery_zones enable row level security;
alter table public.delivery_radius_zones enable row level security;
alter table public.delivery_zip_zones enable row level security;

alter table public.tax_rate_cache enable row level security;

alter table public.warehouse_locations enable row level security;
alter table public.warehouse_working_hours enable row level security;
alter table public.warehouse_working_hour_exceptions enable row level security;

alter table public.damage_reports enable row level security;


-- ============================================================================
-- 3. Business settings
--
-- Booking / pricing flow needs to read tax_enabled and delivery configuration.
-- Only admins may change configuration.
-- ============================================================================

create policy business_settings_select_authenticated
on public.business_settings
for select
to authenticated
using (true);

create policy business_settings_insert_admin
on public.business_settings
for insert
to authenticated
with check (
  public.is_admin()
);

create policy business_settings_update_admin
on public.business_settings
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy business_settings_delete_admin
on public.business_settings
for delete
to authenticated
using (
  public.is_admin()
);


-- ============================================================================
-- 4. System settings
--
-- Customer Book Now reads time_format.
-- Delivery calculation may fall back to system_settings.
-- Driver / Route Board also reads system configuration.
-- ============================================================================

create policy system_settings_select_authenticated
on public.system_settings
for select
to authenticated
using (true);

create policy system_settings_insert_admin
on public.system_settings
for insert
to authenticated
with check (
  public.is_admin()
);

create policy system_settings_update_admin
on public.system_settings
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy system_settings_delete_admin
on public.system_settings
for delete
to authenticated
using (
  public.is_admin()
);


-- ============================================================================
-- 5. Delivery zones
--
-- Customer pricing needs active zones.
-- Configuration changes are administrative.
-- ============================================================================

create policy delivery_zones_select_authenticated
on public.delivery_zones
for select
to authenticated
using (true);

create policy delivery_zones_insert_admin
on public.delivery_zones
for insert
to authenticated
with check (
  public.is_admin()
);

create policy delivery_zones_update_admin
on public.delivery_zones
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy delivery_zones_delete_admin
on public.delivery_zones
for delete
to authenticated
using (
  public.is_admin()
);


create policy delivery_radius_zones_select_authenticated
on public.delivery_radius_zones
for select
to authenticated
using (true);

create policy delivery_radius_zones_insert_admin
on public.delivery_radius_zones
for insert
to authenticated
with check (
  public.is_admin()
);

create policy delivery_radius_zones_update_admin
on public.delivery_radius_zones
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy delivery_radius_zones_delete_admin
on public.delivery_radius_zones
for delete
to authenticated
using (
  public.is_admin()
);


create policy delivery_zip_zones_select_authenticated
on public.delivery_zip_zones
for select
to authenticated
using (true);

create policy delivery_zip_zones_insert_admin
on public.delivery_zip_zones
for insert
to authenticated
with check (
  public.is_admin()
);

create policy delivery_zip_zones_update_admin
on public.delivery_zip_zones
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy delivery_zip_zones_delete_admin
on public.delivery_zip_zones
for delete
to authenticated
using (
  public.is_admin()
);


-- ============================================================================
-- 6. Tax-rate cache
--
-- Do NOT allow customers to populate arbitrary cache rows.
--
-- canonical-pricing.ts already treats cache INSERT failure as optional:
--
--   [pricing] tax cache write skipped
--
-- Therefore blocking customer INSERT here does not break booking/tax
-- calculation.
--
-- Staff/admin code can still read the cache where needed.
-- ============================================================================

create policy tax_rate_cache_select_staff
on public.tax_rate_cache
for select
to authenticated
using (
  public.current_user_is_staff()
);

create policy tax_rate_cache_insert_admin
on public.tax_rate_cache
for insert
to authenticated
with check (
  public.is_admin()
);

create policy tax_rate_cache_update_admin
on public.tax_rate_cache
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy tax_rate_cache_delete_admin
on public.tax_rate_cache
for delete
to authenticated
using (
  public.is_admin()
);


-- ============================================================================
-- 7. Warehouse locations
--
-- Inventory staff needs normal warehouse management.
-- Route/other staff may need to read warehouse locations.
-- Customers do not need this table directly.
-- ============================================================================

create policy warehouse_locations_select_staff
on public.warehouse_locations
for select
to authenticated
using (
  public.current_user_is_staff()
);

create policy warehouse_locations_insert_inventory_staff
on public.warehouse_locations
for insert
to authenticated
with check (
  public.current_user_can_manage_inventory()
);

create policy warehouse_locations_update_inventory_staff
on public.warehouse_locations
for update
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);

create policy warehouse_locations_delete_inventory_staff
on public.warehouse_locations
for delete
to authenticated
using (
  public.current_user_can_manage_inventory()
);


-- ============================================================================
-- 8. Warehouse working hours
--
-- Customer Book Now needs SELECT for availability.
-- Configuration changes remain admin-only.
-- ============================================================================

create policy warehouse_working_hours_select_authenticated
on public.warehouse_working_hours
for select
to authenticated
using (true);

create policy warehouse_working_hours_insert_admin
on public.warehouse_working_hours
for insert
to authenticated
with check (
  public.is_admin()
);

create policy warehouse_working_hours_update_admin
on public.warehouse_working_hours
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy warehouse_working_hours_delete_admin
on public.warehouse_working_hours
for delete
to authenticated
using (
  public.is_admin()
);


create policy warehouse_working_hour_exceptions_select_authenticated
on public.warehouse_working_hour_exceptions
for select
to authenticated
using (true);

create policy warehouse_working_hour_exceptions_insert_admin
on public.warehouse_working_hour_exceptions
for insert
to authenticated
with check (
  public.is_admin()
);

create policy warehouse_working_hour_exceptions_update_admin
on public.warehouse_working_hour_exceptions
for update
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

create policy warehouse_working_hour_exceptions_delete_admin
on public.warehouse_working_hour_exceptions
for delete
to authenticated
using (
  public.is_admin()
);


-- ============================================================================
-- 9. Damage reports
--
-- Inventory/warehouse management only.
-- ============================================================================

create policy damage_reports_select_inventory_staff
on public.damage_reports
for select
to authenticated
using (
  public.current_user_can_manage_inventory()
);

create policy damage_reports_insert_inventory_staff
on public.damage_reports
for insert
to authenticated
with check (
  public.current_user_can_manage_inventory()
);

create policy damage_reports_update_inventory_staff
on public.damage_reports
for update
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);

create policy damage_reports_delete_inventory_staff
on public.damage_reports
for delete
to authenticated
using (
  public.current_user_can_manage_inventory()
);


-- ============================================================================
-- 10. Remove ANON table access
--
-- Public catalog / booking pages that need server-side public information
-- should use the existing controlled server/service layer.
-- ============================================================================

revoke all
on table public.business_settings
from anon;

revoke all
on table public.system_settings
from anon;

revoke all
on table public.delivery_zones
from anon;

revoke all
on table public.delivery_radius_zones
from anon;

revoke all
on table public.delivery_zip_zones
from anon;

revoke all
on table public.tax_rate_cache
from anon;

revoke all
on table public.warehouse_locations
from anon;

revoke all
on table public.warehouse_working_hours
from anon;

revoke all
on table public.warehouse_working_hour_exceptions
from anon;

revoke all
on table public.damage_reports
from anon;


-- ============================================================================
-- 11. Keep only required authenticated privileges
--
-- PostgreSQL GRANT is still required in addition to RLS.
-- ============================================================================

revoke all
on table public.business_settings
from authenticated;

grant select, insert, update, delete
on table public.business_settings
to authenticated;


revoke all
on table public.system_settings
from authenticated;

grant select, insert, update, delete
on table public.system_settings
to authenticated;


revoke all
on table public.delivery_zones
from authenticated;

grant select, insert, update, delete
on table public.delivery_zones
to authenticated;


revoke all
on table public.delivery_radius_zones
from authenticated;

grant select, insert, update, delete
on table public.delivery_radius_zones
to authenticated;


revoke all
on table public.delivery_zip_zones
from authenticated;

grant select, insert, update, delete
on table public.delivery_zip_zones
to authenticated;


revoke all
on table public.tax_rate_cache
from authenticated;

grant select, insert, update, delete
on table public.tax_rate_cache
to authenticated;


revoke all
on table public.warehouse_locations
from authenticated;

grant select, insert, update, delete
on table public.warehouse_locations
to authenticated;


revoke all
on table public.warehouse_working_hours
from authenticated;

grant select, insert, update, delete
on table public.warehouse_working_hours
to authenticated;


revoke all
on table public.warehouse_working_hour_exceptions
from authenticated;

grant select, insert, update, delete
on table public.warehouse_working_hour_exceptions
to authenticated;


revoke all
on table public.damage_reports
from authenticated;

grant select, insert, update, delete
on table public.damage_reports
to authenticated;

commit;
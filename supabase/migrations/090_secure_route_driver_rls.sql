-- =========================================================
-- 090 Secure Route Board / Driver RLS
--
-- Goals:
--   * remove PUBLIC/anon unrestricted access
--   * route managers keep operational access
--   * driver sees only own route_driver record
--   * driver sees/updates only stops assigned to own driver name
--   * driver can work with checklist only for bookings on own route
--   * location/ETA data is protected
--
-- IMPORTANT:
-- Current route_stops assignment is based on driver_name, not driver_id.
-- Therefore drivers must NOT be allowed to modify route_drivers.name.
-- =========================================================


-- =========================================================
-- 1. Helper functions
-- =========================================================

create or replace function public.current_user_can_manage_routes()
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
        'dispatcher'
      )
  );
$$;


create or replace function public.current_route_driver_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rd.name
  from public.route_drivers rd
  where rd.auth_user_id = auth.uid()
    and rd.active = true
    and rd.deleted_at is null
  order by rd.sort_order asc, rd.created_at asc
  limit 1;
$$;


create or replace function public.current_user_is_route_driver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.route_drivers rd
    where rd.auth_user_id = auth.uid()
      and rd.active = true
      and rd.deleted_at is null
  );
$$;


create or replace function public.current_driver_has_booking(
  p_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.route_stops rs
    where rs.booking_id = p_booking_id
      and rs.driver_name = public.current_route_driver_name()
  );
$$;


-- Do not expose helper execution to anon.
revoke all on function public.current_user_can_manage_routes() from public;
revoke all on function public.current_route_driver_name() from public;
revoke all on function public.current_user_is_route_driver() from public;
revoke all on function public.current_driver_has_booking(uuid) from public;

grant execute on function public.current_user_can_manage_routes() to authenticated;
grant execute on function public.current_route_driver_name() to authenticated;
grant execute on function public.current_user_is_route_driver() to authenticated;
grant execute on function public.current_driver_has_booking(uuid) to authenticated;


-- =========================================================
-- 2. Ensure RLS
-- =========================================================

alter table public.route_drivers enable row level security;
alter table public.route_stops enable row level security;
alter table public.booking_checklist_items enable row level security;
alter table public.driver_location_pings enable row level security;
alter table public.driver_eta_cache enable row level security;


-- =========================================================
-- 3. Remove dangerous legacy PUBLIC policies
-- =========================================================

drop policy if exists "Allow admin all route_drivers"
  on public.route_drivers;

drop policy if exists "Allow admin all route_stops"
  on public.route_stops;

drop policy if exists "Allow admin all booking_checklist_items"
  on public.booking_checklist_items;

drop policy if exists "Allow admin all driver location pings"
  on public.driver_location_pings;

drop policy if exists "Allow admin all driver_location_pings"
  on public.driver_location_pings;

drop policy if exists "Allow admin all driver eta cache"
  on public.driver_eta_cache;

drop policy if exists "Allow admin all driver_eta_cache"
  on public.driver_eta_cache;


-- Remove policies from a previous partial execution of this migration.
drop policy if exists route_drivers_select_route_staff
  on public.route_drivers;

drop policy if exists route_drivers_manage_route_staff
  on public.route_drivers;

drop policy if exists route_stops_select_route_staff
  on public.route_stops;

drop policy if exists route_stops_insert_route_staff
  on public.route_stops;

drop policy if exists route_stops_update_route_staff
  on public.route_stops;

drop policy if exists route_stops_delete_route_staff
  on public.route_stops;

drop policy if exists booking_checklist_items_select_route_staff
  on public.booking_checklist_items;

drop policy if exists booking_checklist_items_insert_route_staff
  on public.booking_checklist_items;

drop policy if exists booking_checklist_items_update_route_staff
  on public.booking_checklist_items;

drop policy if exists booking_checklist_items_delete_route_staff
  on public.booking_checklist_items;

drop policy if exists driver_location_pings_select_route_staff
  on public.driver_location_pings;

drop policy if exists driver_location_pings_insert_route_staff
  on public.driver_location_pings;

drop policy if exists driver_location_pings_update_route_staff
  on public.driver_location_pings;

drop policy if exists driver_location_pings_delete_route_staff
  on public.driver_location_pings;

drop policy if exists driver_eta_cache_select_route_staff
  on public.driver_eta_cache;

drop policy if exists driver_eta_cache_manage_route_staff
  on public.driver_eta_cache;


-- =========================================================
-- 4. Remove anon table privileges
-- =========================================================

revoke all privileges
on table public.route_drivers
from anon;

revoke all privileges
on table public.route_stops
from anon;

revoke all privileges
on table public.booking_checklist_items
from anon;

revoke all privileges
on table public.driver_location_pings
from anon;

revoke all privileges
on table public.driver_eta_cache
from anon;


-- =========================================================
-- 5. authenticated grants
--
-- RLS will decide which rows are actually accessible.
-- =========================================================

revoke all privileges
on table public.route_drivers
from authenticated;

grant select, insert, update, delete
on table public.route_drivers
to authenticated;


revoke all privileges
on table public.route_stops
from authenticated;

grant select, insert, update, delete
on table public.route_stops
to authenticated;


revoke all privileges
on table public.booking_checklist_items
from authenticated;

grant select, insert, update, delete
on table public.booking_checklist_items
to authenticated;


revoke all privileges
on table public.driver_location_pings
from authenticated;

grant select, insert, update, delete
on table public.driver_location_pings
to authenticated;


revoke all privileges
on table public.driver_eta_cache
from authenticated;

grant select, insert, update, delete
on table public.driver_eta_cache
to authenticated;


-- =========================================================
-- 6. route_drivers
-- =========================================================

-- Managers can see all drivers.
-- Driver can see only own linked record.
create policy route_drivers_select_route_staff
on public.route_drivers
for select
to authenticated
using (
  public.current_user_can_manage_routes()
  or auth_user_id = auth.uid()
);


-- Only Route Board management staff may modify driver definitions.
--
-- This is intentionally NOT granted to a normal driver.
-- Because route_stops currently uses driver_name as assignment key,
-- letting a driver rename their own route_drivers row would be unsafe.
create policy route_drivers_manage_route_staff
on public.route_drivers
for all
to authenticated
using (
  public.current_user_can_manage_routes()
)
with check (
  public.current_user_can_manage_routes()
);


-- =========================================================
-- 7. route_stops
-- =========================================================

-- Managers see every stop.
-- Driver sees only stops whose driver_name matches their linked record.
create policy route_stops_select_route_staff
on public.route_stops
for select
to authenticated
using (
  public.current_user_can_manage_routes()
  or (
    public.current_user_is_route_driver()
    and driver_name = public.current_route_driver_name()
  )
);


-- Creation/reassignment stays Route Board staff only.
create policy route_stops_insert_route_staff
on public.route_stops
for insert
to authenticated
with check (
  public.current_user_can_manage_routes()
);


-- Managers may modify every stop.
--
-- Drivers may update only an already-assigned own stop,
-- and WITH CHECK prevents them from reassigning the row to another driver.
create policy route_stops_update_route_staff
on public.route_stops
for update
to authenticated
using (
  public.current_user_can_manage_routes()
  or (
    public.current_user_is_route_driver()
    and driver_name = public.current_route_driver_name()
  )
)
with check (
  public.current_user_can_manage_routes()
  or (
    public.current_user_is_route_driver()
    and driver_name = public.current_route_driver_name()
  )
);


-- Drivers must never delete route stops.
create policy route_stops_delete_route_staff
on public.route_stops
for delete
to authenticated
using (
  public.current_user_can_manage_routes()
);


-- =========================================================
-- 8. booking_checklist_items
-- =========================================================

-- Driver may see checklist only for bookings assigned to their route.
create policy booking_checklist_items_select_route_staff
on public.booking_checklist_items
for select
to authenticated
using (
  public.current_user_can_manage_routes()
  or public.current_driver_has_booking(booking_id)
);


-- Creation remains staff/admin workflow.
create policy booking_checklist_items_insert_route_staff
on public.booking_checklist_items
for insert
to authenticated
with check (
  public.current_user_can_manage_routes()
);


-- Driver can update checklist for a booking assigned to them.
create policy booking_checklist_items_update_route_staff
on public.booking_checklist_items
for update
to authenticated
using (
  public.current_user_can_manage_routes()
  or public.current_driver_has_booking(booking_id)
)
with check (
  public.current_user_can_manage_routes()
  or public.current_driver_has_booking(booking_id)
);


-- Checklist deletion remains management-only.
create policy booking_checklist_items_delete_route_staff
on public.booking_checklist_items
for delete
to authenticated
using (
  public.current_user_can_manage_routes()
);


-- =========================================================
-- 9. driver_location_pings
-- =========================================================

-- Route management can read every driver's location.
-- Driver can read only their own location history.
create policy driver_location_pings_select_route_staff
on public.driver_location_pings
for select
to authenticated
using (
  public.current_user_can_manage_routes()
  or (
    public.current_user_is_route_driver()
    and driver_name = public.current_route_driver_name()
  )
);


-- Allows future/live driver GPS inserts safely.
create policy driver_location_pings_insert_route_staff
on public.driver_location_pings
for insert
to authenticated
with check (
  public.current_user_can_manage_routes()
  or (
    public.current_user_is_route_driver()
    and driver_name = public.current_route_driver_name()
  )
);


-- Existing ping history normally does not need driver modification.
create policy driver_location_pings_update_route_staff
on public.driver_location_pings
for update
to authenticated
using (
  public.current_user_can_manage_routes()
)
with check (
  public.current_user_can_manage_routes()
);


create policy driver_location_pings_delete_route_staff
on public.driver_location_pings
for delete
to authenticated
using (
  public.current_user_can_manage_routes()
);


-- =========================================================
-- 10. driver_eta_cache
-- =========================================================

-- Currently this table is generated/read by Admin Live Route.
-- Normal driver code does not touch it.
create policy driver_eta_cache_select_route_staff
on public.driver_eta_cache
for select
to authenticated
using (
  public.current_user_can_manage_routes()
  or (
    public.current_user_is_route_driver()
    and driver_name = public.current_route_driver_name()
  )
);


create policy driver_eta_cache_manage_route_staff
on public.driver_eta_cache
for all
to authenticated
using (
  public.current_user_can_manage_routes()
)
with check (
  public.current_user_can_manage_routes()
);


-- =========================================================
-- 11. Explicitly remove dangerous table-level operations
--
-- TRUNCATE is not governed by ordinary row RLS the same way normal
-- INSERT/UPDATE/DELETE are. Application users do not need it.
-- =========================================================

revoke truncate
on table public.route_drivers
from authenticated;

revoke truncate
on table public.route_stops
from authenticated;

revoke truncate
on table public.booking_checklist_items
from authenticated;

revoke truncate
on table public.driver_location_pings
from authenticated;

revoke truncate
on table public.driver_eta_cache
from authenticated;
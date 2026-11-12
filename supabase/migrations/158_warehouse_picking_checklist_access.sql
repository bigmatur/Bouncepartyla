-- Allow inventory staff to use the shared outbound picking checklist.
-- The same `loaded` state is consumed by the driver workflow, so warehouse
-- and route teams never maintain separate packing records.

begin;

drop policy if exists booking_checklist_items_select_inventory_staff
  on public.booking_checklist_items;

create policy booking_checklist_items_select_inventory_staff
on public.booking_checklist_items
for select
to authenticated
using (
  public.current_user_can_manage_inventory()
);

drop policy if exists booking_checklist_items_update_inventory_staff
  on public.booking_checklist_items;

create policy booking_checklist_items_update_inventory_staff
on public.booking_checklist_items
for update
to authenticated
using (
  public.current_user_can_manage_inventory()
)
with check (
  public.current_user_can_manage_inventory()
);

drop policy if exists route_stops_select_inventory_staff
  on public.route_stops;

create policy route_stops_select_inventory_staff
on public.route_stops
for select
to authenticated
using (
  public.current_user_can_manage_inventory()
);

commit;

begin;

revoke execute
on function public.rebuild_booking_inventory_requirements_from_booking(uuid)
from authenticated;

commit;

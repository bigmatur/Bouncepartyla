-- 098_lock_internal_helper_functions_and_dedupe_payment_trigger.sql
begin;

revoke all on function public.generate_booking_number()
from public, anon, authenticated;

revoke all on function public.payments_after_change()
from public, anon, authenticated;

revoke all on function public.refresh_booking_payment_totals(uuid)
from public, anon, authenticated;

grant execute on function public.refresh_booking_payment_totals(uuid)
to service_role;

revoke all on function public.set_updated_at()
from public, anon, authenticated;

revoke all on function public.touch_notification_updated_at()
from public, anon, authenticated;

revoke all on function public.notification_booking_anchor(public.bookings, text)
from public, anon, authenticated;

revoke all on function public.notification_phone_key(text)
from public, anon, authenticated;

grant execute on function public.notification_booking_anchor(public.bookings, text)
to service_role;

grant execute on function public.notification_phone_key(text)
to service_role;

revoke all on function public.is_authenticated_route_driver()
from public, anon, authenticated;

grant execute on function public.is_authenticated_route_driver()
to authenticated, service_role;

drop trigger if exists payments_refresh_booking_totals_insert
on public.payments;

commit;

notify pgrst, 'reload schema';

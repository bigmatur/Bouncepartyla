-- 101_fix_payment_trigger_function_permissions.sql
-- Ensure payment trigger can refresh booking totals after hardening helper function grants.

begin;

create or replace function public.payments_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_booking_payment_totals(old.booking_id);
    return old;
  else
    perform public.refresh_booking_payment_totals(new.booking_id);
    return new;
  end if;
end;
$$;

revoke all on function public.payments_after_change()
from public, anon, authenticated;

grant execute on function public.payments_after_change()
to service_role;

commit;

notify pgrst, 'reload schema';

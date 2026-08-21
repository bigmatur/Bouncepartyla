-- 033_payment_ledger_details.sql
-- Adds payment audit details and repairs booking balances from the payment ledger.

alter table public.payments
  add column if not exists tip_amount numeric(10,2) not null default 0,
  add column if not exists accepted_by_auth_user_id uuid;

create index if not exists idx_payments_paid_at on public.payments(paid_at);
create index if not exists idx_payments_accepted_by on public.payments(accepted_by_auth_user_id);

-- Repair balances that may have been reduced twice by the old POS action.
do $$
declare
  booking_row record;
begin
  if to_regprocedure('public.refresh_booking_payment_totals(uuid)') is not null then
    for booking_row in select id from public.bookings loop
      perform public.refresh_booking_payment_totals(booking_row.id);
    end loop;
  end if;
end
$$;

notify pgrst, 'reload schema';

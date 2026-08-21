-- The customer previously received two near-identical emails for one payment
-- (payment_received + deposit_paid) when a single payment completed the
-- deposit threshold. Skip payment_received in that specific case so only the
-- more specific deposit_paid receipt is sent; all other payments still send
-- payment_received as before.
create or replace function public.queue_notifications_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(coalesce(new.status::text,''));
  v_old_status text := case when tg_op='UPDATE' then lower(coalesce(old.status::text,'')) else '' end;
  v_booking public.bookings%rowtype;
  v_base_paid numeric := 0;
  v_this_payment numeric := greatest(coalesce(new.amount,0)-coalesce(new.tip_amount,0),0);
  v_paid_before numeric := 0;
  v_completes_deposit boolean := false;
begin
  if v_status not in ('paid','completed','succeeded') then return new; end if;
  if tg_op='UPDATE' and v_old_status in ('paid','completed','succeeded') then return new; end if;

  select * into v_booking from public.bookings where id=new.booking_id;

  if found and coalesce(v_booking.deposit_amount,0) > 0 then
    select coalesce(sum(greatest(coalesce(p.amount,0)-coalesce(p.tip_amount,0),0)),0)
      into v_base_paid
    from public.payments p
    where p.booking_id=new.booking_id
      and lower(coalesce(p.status::text,'')) in ('paid','completed','succeeded');

    v_paid_before := v_base_paid - v_this_payment;
    v_completes_deposit := v_paid_before < coalesce(v_booking.deposit_amount,0)
      and v_base_paid >= coalesce(v_booking.deposit_amount,0);
  end if;

  if not v_completes_deposit then
    perform public.enqueue_customer_booking_notification(
      'payment_received', new.booking_id, new.id::text,
      jsonb_build_object('payment_id',new.id,'payment_amount',v_this_payment,'tip_amount',coalesce(new.tip_amount,0))
    );
  end if;

  if v_completes_deposit then
    perform public.enqueue_customer_booking_notification(
      'deposit_paid', new.booking_id, 'deposit-threshold',
      jsonb_build_object('payment_id',new.id,'payment_amount',v_this_payment)
    );
  end if;

  return new;
end;
$$;

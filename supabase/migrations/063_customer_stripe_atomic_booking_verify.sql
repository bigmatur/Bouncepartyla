-- 1) Stripe/customer booking payment state.
select
  b.id,
  b.booking_number,
  b.status,
  b.contract_status,
  b.payment_status,
  b.total_amount,
  b.deposit_amount,
  b.amount_paid,
  b.balance_due,
  coalesce((
    select sum(greatest(coalesce(p.amount, 0) - coalesce(p.tip_amount, 0), 0))
    from public.payments p
    where p.booking_id = b.id
      and lower(coalesce(p.status, '')) in ('paid', 'completed', 'succeeded')
  ), 0) as ledger_base_paid,
  (select count(*) from public.contracts c where c.booking_id = b.id) as contract_rows,
  (select count(*) from public.route_stops rs where rs.booking_id = b.id) as route_stop_rows
from public.bookings b
order by b.created_at desc
limit 20;

-- 2) These should normally be 0 rows for new bookings after migration 063.
-- A result means an old booking says "signed" but has no actual contract document row.
select
  b.id,
  b.booking_number,
  b.status,
  b.contract_status,
  b.created_at
from public.bookings b
where b.contract_status::text = 'signed'
  and not exists (
    select 1 from public.contracts c where c.booking_id = b.id
  )
order by b.created_at desc;

-- 3) Provisional customer Stripe holds. These are not final bookings.
select
  b.id,
  b.booking_number,
  b.status,
  b.total_amount,
  b.deposit_amount,
  b.amount_paid,
  b.balance_due,
  b.created_at
from public.bookings b
where b.status::text = 'pending_deposit'
order by b.created_at desc;

-- 4) Confirm required RPCs exist.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'finalize_booking_after_external_payment',
    'cancel_my_unpaid_customer_stripe_booking',
    'expire_unpaid_customer_stripe_booking',
    'sign_customer_booking_contract'
  )
order by p.proname;

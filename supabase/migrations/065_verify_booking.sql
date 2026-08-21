-- Replace the UUID below with the booking id you are testing.
with target as (
  select '00000000-0000-0000-0000-000000000000'::uuid as booking_id
)
select
  b.id,
  b.booking_number,
  b.status,
  b.booking_source,
  b.total_amount,
  b.deposit_amount,
  b.amount_paid,
  b.balance_due,
  b.payment_status,
  b.contract_status
from public.bookings b
join target t on t.booking_id = b.id;

with target as (
  select '00000000-0000-0000-0000-000000000000'::uuid as booking_id
)
select
  p.id,
  p.amount,
  p.tip_amount,
  p.method,
  p.status,
  p.external_reference,
  p.paid_at
from public.payments p
join target t on t.booking_id = p.booking_id
order by p.paid_at desc nulls last;

with target as (
  select '00000000-0000-0000-0000-000000000000'::uuid as booking_id
)
select
  c.id,
  c.status,
  c.signer_name,
  c.signed_at,
  c.pdf_url,
  length(coalesce(c.rendered_html, '')) as rendered_html_length,
  c.created_at
from public.contracts c
join target t on t.booking_id = c.booking_id
order by c.created_at desc;

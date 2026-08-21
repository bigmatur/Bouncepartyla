-- 067 verification: read-only

-- 1) Paid self-service bookings must not remain pending_deposit.
select
  b.id,
  b.booking_number,
  b.event_date,
  b.status::text as booking_status,
  b.booking_source,
  b.deposit_amount,
  b.amount_paid,
  b.balance_due,
  b.payment_status::text as payment_status,
  b.contract_status::text as contract_status,
  coalesce(sum(greatest(coalesce(p.amount,0)-coalesce(p.tip_amount,0),0))
    filter (where lower(coalesce(p.status::text,'')) in ('paid','completed','succeeded')), 0) as successful_base_payments
from public.bookings b
left join public.payments p on p.booking_id = b.id
where coalesce(b.booking_source,'') = 'customer_self_service'
group by b.id
order by b.created_at desc
limit 50;

-- 2) EXPECTED: 0 rows.
select
  b.id,
  b.booking_number,
  b.event_date,
  b.status::text,
  b.deposit_amount,
  b.amount_paid,
  b.payment_status::text,
  b.contract_status::text
from public.bookings b
where b.status::text = 'pending_deposit'
  and coalesce(b.booking_source,'') = 'customer_self_service'
  and exists (
    select 1 from public.payments p
    where p.booking_id = b.id
      and lower(coalesce(p.status::text,'')) in ('paid','completed','succeeded')
      and greatest(coalesce(p.amount,0)-coalesce(p.tip_amount,0),0) >= coalesce(b.deposit_amount,0)
  );

-- 3) Route-stop coverage for finalized self-service bookings. Missing stops are visible,
-- but they no longer hide or roll back the paid booking.
select
  b.id,
  b.booking_number,
  b.event_date,
  b.status::text as booking_status,
  count(rs.id) filter (where rs.stop_type::text='delivery' and coalesce(rs.status::text,'') not in ('cancelled','failed')) as delivery_stops,
  count(rs.id) filter (where rs.stop_type::text='pickup' and coalesce(rs.status::text,'') not in ('cancelled','failed')) as pickup_stops
from public.bookings b
left join public.route_stops rs on rs.booking_id=b.id
where coalesce(b.booking_source,'')='customer_self_service'
  and b.status::text='booked'
group by b.id
order by b.created_at desc
limit 50;

-- 4) August 15 visibility/state diagnostic.
select
  b.id,
  b.booking_number,
  b.event_date,
  b.status::text as booking_status,
  b.booking_source,
  b.amount_paid,
  b.balance_due,
  b.payment_status::text,
  b.contract_status::text,
  count(distinct ir.id) as inventory_reservations,
  count(distinct rs.id) as route_stops
from public.bookings b
left join public.inventory_reservations ir on ir.booking_id=b.id
left join public.route_stops rs on rs.booking_id=b.id
where b.event_date='2026-08-15'::date
group by b.id
order by b.created_at desc;

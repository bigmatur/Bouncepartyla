-- ============================================================
-- 086 — Inventory Reservation Integrity v2
-- FIXED VERSION
--
-- IMPORTANT:
-- PostgreSQL requires partial-index predicates to use IMMUTABLE
-- expressions. Do NOT cast enum columns to text and do NOT use
-- lower(status::text) / lower(payment_status::text) here.
-- ============================================================

drop index if exists public.bookings_customer_self_service_hold_cleanup_idx;

create index bookings_customer_self_service_hold_cleanup_idx
  on public.bookings (created_at)
  where booking_source = 'customer_self_service'
    and status = 'pending_deposit'
    and coalesce(amount_paid, 0) <= 0
    and payment_status = 'unpaid';

-- Verification:
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'bookings_customer_self_service_hold_cleanup_idx';

-- =========================================================
-- 015 Booking archive
-- Soft archive support for bookings.
-- =========================================================

alter table if exists public.bookings
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists archive_reason text;

create index if not exists idx_bookings_archived_at
on public.bookings(archived_at);

notify pgrst, 'reload schema';
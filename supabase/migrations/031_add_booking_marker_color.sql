-- 031_add_booking_marker_color.sql
--
-- Fixes:
--   column bookings_1.marker_color does not exist
--
-- Route Board, Bookings and Driver View use this field for the same
-- booking marker color.

alter table public.bookings
  add column if not exists marker_color text;

create index if not exists bookings_marker_color_idx
  on public.bookings (marker_color);

notify pgrst, 'reload schema';

alter table if exists public.bookings
  add column if not exists marker_color text;

create index if not exists bookings_marker_color_idx
  on public.bookings (marker_color);
-- 030_route_stop_fixed_timing.sql
-- Allows a dispatcher to pin an exact route-stop time so route recalculation
-- preserves it and recalculates the remaining chain around that anchor.

alter table if exists public.route_stops
  add column if not exists time_locked boolean not null default false;

create index if not exists idx_route_stops_time_locked
  on public.route_stops(time_locked)
  where time_locked = true;

notify pgrst, 'reload schema';

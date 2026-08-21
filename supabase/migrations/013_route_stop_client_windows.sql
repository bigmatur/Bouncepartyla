-- =========================================================
-- 013 Route stop client windows
-- Stores multiple client-delivery and client-pickup window periods per stop.
-- =========================================================

alter table if exists public.route_stops
  add column if not exists client_delivery_windows jsonb not null default '[]'::jsonb,
  add column if not exists client_pickup_windows jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

-- =========================================================
-- 087 Lock down unprotected public tables
--
-- Security goal:
-- 1. Every operational table exposed through public schema
--    must have RLS enabled.
-- 2. anon must not have direct CRUD access to internal tables.
-- 3. authenticated access will be governed by explicit RLS
--    policies / server-side service role where applicable.
--
-- This migration intentionally does NOT touch:
--   products
--   categories
--   public customer booking tables
--
-- because those are handled separately and may participate
-- in customer-facing flows.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- DELIVERY ROUTES
-- ---------------------------------------------------------

alter table if exists public.delivery_routes
  enable row level security;

revoke all on table public.delivery_routes from anon;


-- ---------------------------------------------------------
-- LEGACY DRIVERS
-- ---------------------------------------------------------

alter table if exists public.drivers
  enable row level security;

revoke all on table public.drivers from anon;


-- ---------------------------------------------------------
-- PRICE OVERRIDES
-- ---------------------------------------------------------

alter table if exists public.price_overrides
  enable row level security;

revoke all on table public.price_overrides from anon;


-- ---------------------------------------------------------
-- PRODUCT CATEGORIES
--
-- This appears to be a legacy/internal linking table.
-- Do not confuse it with public.categories.
-- ---------------------------------------------------------

alter table if exists public.product_categories
  enable row level security;

revoke all on table public.product_categories from anon;


-- ---------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------

alter table if exists public.tasks
  enable row level security;

revoke all on table public.tasks from anon;


-- ---------------------------------------------------------
-- LEGACY TAX CACHE
-- ---------------------------------------------------------

alter table if exists public.tax_rates_cache
  enable row level security;

revoke all on table public.tax_rates_cache from anon;


-- ---------------------------------------------------------
-- VEHICLES
-- ---------------------------------------------------------

alter table if exists public.vehicles
  enable row level security;

revoke all on table public.vehicles from anon;


-- ---------------------------------------------------------
-- WAREHOUSES
-- ---------------------------------------------------------

alter table if exists public.warehouses
  enable row level security;

revoke all on table public.warehouses from anon;

commit;
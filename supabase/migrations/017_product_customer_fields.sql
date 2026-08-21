-- =========================================================
-- 017 Product customer-facing fields
-- Adds marketing/SEO fields used by customer catalog product cards.
-- Safe/idempotent migration.
-- =========================================================

alter table if exists public.products
  add column if not exists public_title text,
  add column if not exists short_description text,
  add column if not exists gallery_urls text[] not null default '{}',
  add column if not exists indoor_allowed boolean not null default false,
  add column if not exists outdoor_allowed boolean not null default false,
  add column if not exists water_use boolean not null default false,
  add column if not exists setup_surface text,
  add column if not exists power_requirements text,
  add column if not exists what_included text,
  add column if not exists what_not_included text,
  add column if not exists safety_rules text,
  add column if not exists seo_title text,
  add column if not exists seo_description text;

create index if not exists idx_products_slug_active
on public.products(slug, active);

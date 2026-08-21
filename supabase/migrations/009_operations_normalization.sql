-- =========================================================
-- 009 Operations normalization
-- Bounce Party LA Booking System
-- Purpose: keep fast-moving admin modules aligned with one operational schema.
-- Safe/idempotent migration.
-- =========================================================

-- Required extension used by older migrations.
create extension if not exists "uuid-ossp";

-- =========================================================
-- Catalog compatibility
-- =========================================================

create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique,
  description text,
  parent_id uuid references public.categories(id) on delete set null,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.products
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete set null,
  add column if not exists image_url text,
  add column if not exists admin_notes text,
  add column if not exists rental_duration_min integer not null default 1440,
  add column if not exists setup_duration_min integer not null default 60,
  add column if not exists teardown_duration_min integer not null default 60,
  add column if not exists buffer_before_min integer not null default 0,
  add column if not exists buffer_after_min integer not null default 0;

create table if not exists public.product_inventory_components (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric not null default 1,
  required boolean not null default true,
  sort_order integer not null default 100,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_inventory_components_product_id
on public.product_inventory_components(product_id);

create index if not exists idx_product_inventory_components_inventory_item_id
on public.product_inventory_components(inventory_item_id);

-- =========================================================
-- Inventory compatibility
-- =========================================================

alter table if exists public.inventory_items
  add column if not exists description text,
  add column if not exists image_url text,
  add column if not exists quantity_on_hand numeric not null default 0,
  add column if not exists quantity_available numeric not null default 0,
  add column if not exists minimum_stock numeric not null default 0,
  add column if not exists reorder_point numeric not null default 0,
  add column if not exists default_purchase_price numeric not null default 0,
  add column if not exists deleted_at timestamptz,
  add column if not exists sort_order integer not null default 100;

update public.inventory_items
set
  quantity_on_hand = coalesce(nullif(quantity_on_hand, 0), total_quantity, 0),
  quantity_available = coalesce(nullif(quantity_available, 0), total_quantity, 0)
where total_quantity is not null;

alter table if exists public.inventory_units
  add column if not exists warehouse_location_id uuid references public.warehouse_locations(id) on delete set null,
  add column if not exists serial_number text,
  add column if not exists barcode text,
  add column if not exists purchase_price numeric not null default 0,
  add column if not exists image_url text,
  add column if not exists deleted_at timestamptz,
  add column if not exists retired_at timestamptz,
  add column if not exists supply_id uuid,
  add column if not exists supply_line_id uuid;

alter table if exists public.inventory_movements
  add column if not exists status text not null default 'completed',
  add column if not exists unit_cost numeric not null default 0,
  add column if not exists total_cost numeric not null default 0,
  add column if not exists from_location_id uuid references public.warehouse_locations(id) on delete set null,
  add column if not exists to_location_id uuid references public.warehouse_locations(id) on delete set null,
  add column if not exists inventory_unit_id uuid references public.inventory_units(id) on delete set null,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists supply_id uuid,
  add column if not exists supply_line_id uuid;

-- =========================================================
-- Business / system settings compatibility
-- =========================================================

create table if not exists public.system_settings (
  id uuid primary key default uuid_generate_v4(),
  business_name text,
  timezone text not null default 'America/Los_Angeles',
  time_format text not null default '12h',
  date_format text not null default 'us',
  warehouse_address text,
  warehouse_city text,
  warehouse_state text,
  warehouse_zip text,
  warehouse_lat numeric,
  warehouse_lng numeric,
  delivery_pricing_mode text not null default 'miles',
  free_delivery_miles numeric not null default 10,
  price_per_mile numeric not null default 1,
  minimum_delivery_fee numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.system_settings
  drop constraint if exists system_settings_time_format_check;

alter table public.system_settings
  add constraint system_settings_time_format_check
  check (time_format in ('12h', '24h'));

alter table public.system_settings
  drop constraint if exists system_settings_date_format_check;

alter table public.system_settings
  add constraint system_settings_date_format_check
  check (date_format in ('us', 'eu'));

alter table public.system_settings
  drop constraint if exists system_settings_delivery_pricing_mode_check;

alter table public.system_settings
  add constraint system_settings_delivery_pricing_mode_check
  check (delivery_pricing_mode in ('miles', 'radius_zones', 'zip_zones'));

insert into public.system_settings (
  business_name,
  timezone,
  time_format,
  date_format,
  delivery_pricing_mode
)
select
  'Bounce Party LA',
  'America/Los_Angeles',
  '12h',
  'us',
  'miles'
where not exists (select 1 from public.system_settings);

-- =========================================================
-- Warehouse working hours
-- =========================================================

create table if not exists public.warehouse_working_hours (
  id uuid primary key default uuid_generate_v4(),
  day_of_week integer not null check (day_of_week >= 0 and day_of_week <= 6),
  is_open boolean not null default true,
  open_time time,
  close_time time,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(day_of_week)
);

insert into public.warehouse_working_hours
  (day_of_week, is_open, open_time, close_time, sort_order)
values
  (0, true, '09:00', '21:00', 0),
  (1, true, '09:00', '21:00', 10),
  (2, true, '09:00', '21:00', 20),
  (3, true, '09:00', '21:00', 30),
  (4, true, '09:00', '21:00', 40),
  (5, true, '09:00', '21:00', 50),
  (6, true, '09:00', '21:00', 60)
on conflict (day_of_week) do nothing;

create table if not exists public.warehouse_working_hour_exceptions (
  id uuid primary key default uuid_generate_v4(),
  exception_date date not null unique,
  is_open boolean not null default false,
  open_time time,
  close_time time,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- Delivery pricing modes
-- =========================================================

create table if not exists public.delivery_radius_zones (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Radius zone',
  from_miles numeric not null default 0,
  to_miles numeric not null default 0,
  delivery_fee numeric not null default 0,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_zip_zones (
  id uuid primary key default uuid_generate_v4(),
  zone_name text not null default 'ZIP zone',
  zip_code text not null,
  delivery_fee numeric not null default 0,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Legacy delivery_zones compatibility. Keep it readable, but new code should use radius/ZIP zones.
alter table if exists public.delivery_zones
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists delivery_fee numeric not null default 0,
  add column if not exists polygon_geojson jsonb,
  add column if not exists zip_codes text[] not null default '{}',
  add column if not exists city_names text[] not null default '{}',
  add column if not exists sort_order integer not null default 100;

update public.delivery_zones
set
  name = coalesce(nullif(name, ''), zone_name),
  delivery_fee = coalesce(nullif(delivery_fee, 0), base_fee, 0),
  updated_at = now();

-- =========================================================
-- Operational workflow fields
-- =========================================================

alter table if exists public.bookings
  add column if not exists booking_source text not null default 'admin',
  add column if not exists lead_status text,
  add column if not exists delivery_status text,
  add column if not exists pickup_status text,
  add column if not exists coi_required boolean not null default false,
  add column if not exists coi_status text not null default 'not_required',
  add column if not exists venue_notes text,
  add column if not exists ball_colors text,
  add column if not exists setup_photo_url text,
  add column if not exists pickup_photo_url text;

create table if not exists public.booking_checklist_items (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  title text not null,
  category text,
  status text not null default 'open',
  sort_order integer not null default 100,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_booking_checklist_items_booking_id
on public.booking_checklist_items(booking_id);

create table if not exists public.inventory_inspections (
  id uuid primary key default uuid_generate_v4(),
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  inventory_unit_id uuid references public.inventory_units(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  inspection_type text not null default 'return',
  status text not null default 'needs_review',
  condition text,
  notes text,
  photo_url text,
  inspected_by text,
  inspected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_inspections_unit_id
on public.inventory_inspections(inventory_unit_id);

create index if not exists idx_inventory_inspections_booking_id
on public.inventory_inspections(booking_id);

create table if not exists public.damage_reports (
  id uuid primary key default uuid_generate_v4(),
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  inventory_unit_id uuid references public.inventory_units(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  title text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  repair_cost numeric not null default 0,
  description text,
  before_photo_url text,
  after_photo_url text,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- RLS policies for newly added operational tables
-- =========================================================

alter table public.system_settings enable row level security;
alter table public.warehouse_working_hours enable row level security;
alter table public.warehouse_working_hour_exceptions enable row level security;
alter table public.delivery_radius_zones enable row level security;
alter table public.delivery_zip_zones enable row level security;
alter table public.booking_checklist_items enable row level security;
alter table public.inventory_inspections enable row level security;
alter table public.damage_reports enable row level security;

drop policy if exists "Allow admin all system_settings" on public.system_settings;
create policy "Allow admin all system_settings"
on public.system_settings for all using (true) with check (true);

drop policy if exists "Allow admin all warehouse_working_hours" on public.warehouse_working_hours;
create policy "Allow admin all warehouse_working_hours"
on public.warehouse_working_hours for all using (true) with check (true);

drop policy if exists "Allow admin all warehouse_working_hour_exceptions" on public.warehouse_working_hour_exceptions;
create policy "Allow admin all warehouse_working_hour_exceptions"
on public.warehouse_working_hour_exceptions for all using (true) with check (true);

drop policy if exists "Allow admin all delivery_radius_zones" on public.delivery_radius_zones;
create policy "Allow admin all delivery_radius_zones"
on public.delivery_radius_zones for all using (true) with check (true);

drop policy if exists "Allow admin all delivery_zip_zones" on public.delivery_zip_zones;
create policy "Allow admin all delivery_zip_zones"
on public.delivery_zip_zones for all using (true) with check (true);

drop policy if exists "Allow admin all booking_checklist_items" on public.booking_checklist_items;
create policy "Allow admin all booking_checklist_items"
on public.booking_checklist_items for all using (true) with check (true);

drop policy if exists "Allow admin all inventory_inspections" on public.inventory_inspections;
create policy "Allow admin all inventory_inspections"
on public.inventory_inspections for all using (true) with check (true);

drop policy if exists "Allow admin all damage_reports" on public.damage_reports;
create policy "Allow admin all damage_reports"
on public.damage_reports for all using (true) with check (true);

notify pgrst, 'reload schema';

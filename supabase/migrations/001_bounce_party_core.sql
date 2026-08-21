-- START: 001_bounce_party_core.sql
-- =========================================================
-- Bounce Party LA Core Booking System
-- Migration: 001_bounce_party_core.sql
-- =========================================================

create extension if not exists "uuid-ossp";

-- =========================================================
-- ENUMS
-- =========================================================

do $$ begin
  create type booking_status as enum (
    'draft',
    'quote',
    'pending_deposit',
    'booked',
    'scheduled',
    'inventory_reserved',
    'picking',
    'loaded',
    'out_for_delivery',
    'installed',
    'pickup_scheduled',
    'picked_up',
    'returned',
    'cleaning',
    'closed',
    'cancelled',
    'refunded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_status as enum (
    'unpaid',
    'partial',
    'paid',
    'refunded',
    'failed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type contract_status as enum (
    'not_sent',
    'sent',
    'viewed',
    'signed',
    'expired',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type inventory_tracking_type as enum (
    'serialized',
    'quantity',
    'kit'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type inventory_unit_status as enum (
    'available',
    'reserved',
    'picked',
    'loaded',
    'out_for_delivery',
    'installed',
    'returned',
    'dirty',
    'cleaning',
    'maintenance',
    'damaged',
    'missing',
    'retired'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type inventory_reservation_status as enum (
    'reserved',
    'picked',
    'loaded',
    'delivered',
    'installed',
    'returned',
    'released',
    'missing',
    'damaged'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type route_stop_type as enum (
    'delivery',
    'pickup',
    'service',
    'warehouse_load',
    'warehouse_return'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type route_stop_status as enum (
    'scheduled',
    'on_the_way',
    'arrived',
    'completed',
    'failed',
    'rescheduled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_method as enum (
    'zelle',
    'venmo',
    'cash',
    'card',
    'check',
    'bank_transfer',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type venue_type as enum (
    'backyard',
    'park',
    'indoor_venue',
    'school',
    'church',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type surface_type as enum (
    'grass',
    'concrete',
    'turf',
    'asphalt',
    'indoor_floor',
    'mixed',
    'unknown'
  );
exception when duplicate_object then null;
end $$;

-- =========================================================
-- HELPERS
-- =========================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================================================
-- CUSTOMERS / CRM
-- =========================================================

create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),

  first_name text,
  last_name text,
  full_name text,

  phone text,
  email text,
  instagram text,

  default_address text,
  default_city text,
  default_state text default 'CA',
  default_zip text,

  notes text,
  warning_notes text,

  total_bookings integer not null default 0,
  total_spent numeric(10,2) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists customers_set_updated_at on customers;
create trigger customers_set_updated_at
before update on customers
for each row execute function set_updated_at();

create index if not exists idx_customers_phone on customers(phone);
create index if not exists idx_customers_email on customers(email);
create index if not exists idx_customers_full_name on customers(full_name);

-- =========================================================
-- PRODUCT CATALOG
-- =========================================================

create table if not exists product_categories (
  id uuid primary key default uuid_generate_v4(),

  name text not null,
  slug text not null unique,
  description text,

  sort_order integer not null default 0,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists product_categories_set_updated_at on product_categories;
create trigger product_categories_set_updated_at
before update on product_categories
for each row execute function set_updated_at();

create table if not exists products (
  id uuid primary key default uuid_generate_v4(),

  category_id uuid references product_categories(id) on delete set null,

  name text not null,
  slug text not null unique,
  description text,

  base_price numeric(10,2) not null default 0,
  deposit_amount numeric(10,2) not null default 50,

  setup_width_ft numeric(8,2),
  setup_length_ft numeric(8,2),
  setup_height_ft numeric(8,2),

  setup_minutes integer not null default 45,
  pickup_minutes integer not null default 30,
  loading_minutes integer not null default 15,

  vehicle_space_units numeric(8,2) not null default 1,
  delivery_size text,

  min_age integer,
  max_age integer,
  max_capacity integer,

  active boolean not null default true,
  sort_order integer not null default 0,

  internal_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at
before update on products
for each row execute function set_updated_at();

create index if not exists idx_products_category_id on products(category_id);
create index if not exists idx_products_active on products(active);

create table if not exists product_variants (
  id uuid primary key default uuid_generate_v4(),

  product_id uuid not null references products(id) on delete cascade,

  name text not null,
  slug text,
  price_delta numeric(10,2) not null default 0,

  active boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists product_variants_set_updated_at on product_variants;
create trigger product_variants_set_updated_at
before update on product_variants
for each row execute function set_updated_at();

create index if not exists idx_product_variants_product_id on product_variants(product_id);

-- =========================================================
-- MODIFIERS / ADD-ONS
-- =========================================================

create table if not exists modifiers (
  id uuid primary key default uuid_generate_v4(),

  name text not null,
  slug text not null unique,

  description text,

  base_price numeric(10,2) not null default 0,
  taxable boolean not null default true,

  active boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists modifiers_set_updated_at on modifiers;
create trigger modifiers_set_updated_at
before update on modifiers
for each row execute function set_updated_at();

create table if not exists product_modifiers (
  id uuid primary key default uuid_generate_v4(),

  product_id uuid not null references products(id) on delete cascade,
  modifier_id uuid not null references modifiers(id) on delete cascade,

  is_required boolean not null default false,
  is_default boolean not null default false,

  min_quantity integer not null default 0,
  max_quantity integer,

  created_at timestamptz not null default now(),

  unique(product_id, modifier_id)
);

create index if not exists idx_product_modifiers_product_id on product_modifiers(product_id);
create index if not exists idx_product_modifiers_modifier_id on product_modifiers(modifier_id);

-- =========================================================
-- WAREHOUSE / INVENTORY
-- =========================================================

create table if not exists warehouses (
  id uuid primary key default uuid_generate_v4(),

  name text not null,
  address text,
  city text,
  state text default 'CA',
  zip text,

  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists warehouses_set_updated_at on warehouses;
create trigger warehouses_set_updated_at
before update on warehouses
for each row execute function set_updated_at();

create table if not exists inventory_categories (
  id uuid primary key default uuid_generate_v4(),

  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,

  created_at timestamptz not null default now()
);

create table if not exists inventory_items (
  id uuid primary key default uuid_generate_v4(),

  category_id uuid references inventory_categories(id) on delete set null,

  name text not null,
  sku text unique,

  tracking_type inventory_tracking_type not null default 'quantity',

  total_quantity numeric(12,2) not null default 0,
  unit_label text default 'pcs',

  active boolean not null default true,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists inventory_items_set_updated_at on inventory_items;
create trigger inventory_items_set_updated_at
before update on inventory_items
for each row execute function set_updated_at();

create index if not exists idx_inventory_items_category_id on inventory_items(category_id);
create index if not exists idx_inventory_items_tracking_type on inventory_items(tracking_type);
create index if not exists idx_inventory_items_active on inventory_items(active);

create table if not exists inventory_units (
  id uuid primary key default uuid_generate_v4(),

  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  warehouse_id uuid references warehouses(id) on delete set null,

  unit_code text not null unique,

  status inventory_unit_status not null default 'available',
  condition text default 'good',

  last_cleaned_at timestamptz,
  last_maintenance_at timestamptz,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists inventory_units_set_updated_at on inventory_units;
create trigger inventory_units_set_updated_at
before update on inventory_units
for each row execute function set_updated_at();

create index if not exists idx_inventory_units_inventory_item_id on inventory_units(inventory_item_id);
create index if not exists idx_inventory_units_status on inventory_units(status);
create index if not exists idx_inventory_units_warehouse_id on inventory_units(warehouse_id);

-- =========================================================
-- PRODUCT INVENTORY RECIPES
-- =========================================================

create table if not exists inventory_recipes (
  id uuid primary key default uuid_generate_v4(),

  product_id uuid not null references products(id) on delete cascade,
  modifier_id uuid references modifiers(id) on delete cascade,

  inventory_item_id uuid not null references inventory_items(id) on delete restrict,

  quantity_required numeric(12,2) not null default 1,

  requirement_type text not null default 'required',
  alternative_group text,

  is_optional boolean not null default false,

  notes text,

  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_recipes_product_id on inventory_recipes(product_id);
create index if not exists idx_inventory_recipes_modifier_id on inventory_recipes(modifier_id);
create index if not exists idx_inventory_recipes_inventory_item_id on inventory_recipes(inventory_item_id);
create index if not exists idx_inventory_recipes_alternative_group on inventory_recipes(alternative_group);

-- =========================================================
-- BOOKINGS
-- =========================================================

create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),

  booking_number text unique,

  customer_id uuid references customers(id) on delete set null,

  status booking_status not null default 'draft',

  event_date date not null,
  event_start_time time,
  event_end_time time,

  delivery_date date,
  pickup_date date,

  delivery_window_start timestamptz,
  delivery_window_end timestamptz,

  pickup_window_start timestamptz,
  pickup_window_end timestamptz,

  setup_address text,
  setup_city text,
  setup_state text default 'CA',
  setup_zip text,

  venue_type venue_type default 'backyard',
  surface_type surface_type default 'unknown',

  power_available boolean,
  generator_required boolean not null default false,

  exact_setup_location text,
  gate_code text,
  parking_notes text,

  subtotal numeric(10,2) not null default 0,
  modifiers_total numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,

  taxable_amount numeric(10,2) not null default 0,
  tax_rate numeric(8,6) not null default 0,
  tax_amount numeric(10,2) not null default 0,

  total_amount numeric(10,2) not null default 0,
  deposit_amount numeric(10,2) not null default 50,
  amount_paid numeric(10,2) not null default 0,
  balance_due numeric(10,2) not null default 0,

  payment_status payment_status not null default 'unpaid',
  contract_status contract_status not null default 'not_sent',

  customer_notes text,
  internal_notes text,

  created_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists bookings_set_updated_at on bookings;
create trigger bookings_set_updated_at
before update on bookings
for each row execute function set_updated_at();

create index if not exists idx_bookings_customer_id on bookings(customer_id);
create index if not exists idx_bookings_event_date on bookings(event_date);
create index if not exists idx_bookings_status on bookings(status);
create index if not exists idx_bookings_setup_zip on bookings(setup_zip);

create table if not exists booking_items (
  id uuid primary key default uuid_generate_v4(),

  booking_id uuid not null references bookings(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  product_variant_id uuid references product_variants(id) on delete set null,

  quantity integer not null default 1,

  unit_price numeric(10,2) not null default 0,
  subtotal numeric(10,2) not null default 0,

  taxable boolean not null default true,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists booking_items_set_updated_at on booking_items;
create trigger booking_items_set_updated_at
before update on booking_items
for each row execute function set_updated_at();

create index if not exists idx_booking_items_booking_id on booking_items(booking_id);
create index if not exists idx_booking_items_product_id on booking_items(product_id);

create table if not exists booking_modifiers (
  id uuid primary key default uuid_generate_v4(),

  booking_id uuid not null references bookings(id) on delete cascade,
  booking_item_id uuid references booking_items(id) on delete cascade,
  modifier_id uuid not null references modifiers(id) on delete restrict,

  quantity integer not null default 1,

  unit_price numeric(10,2) not null default 0,
  subtotal numeric(10,2) not null default 0,

  taxable boolean not null default true,

  notes text,

  created_at timestamptz not null default now()
);

create index if not exists idx_booking_modifiers_booking_id on booking_modifiers(booking_id);
create index if not exists idx_booking_modifiers_booking_item_id on booking_modifiers(booking_item_id);
create index if not exists idx_booking_modifiers_modifier_id on booking_modifiers(modifier_id);

-- =========================================================
-- INVENTORY RESERVATIONS
-- =========================================================

create table if not exists inventory_reservations (
  id uuid primary key default uuid_generate_v4(),

  booking_id uuid not null references bookings(id) on delete cascade,
  booking_item_id uuid references booking_items(id) on delete cascade,

  inventory_item_id uuid not null references inventory_items(id) on delete restrict,
  inventory_unit_id uuid references inventory_units(id) on delete restrict,

  quantity numeric(12,2) not null default 1,

  reserved_from timestamptz not null,
  reserved_until timestamptz not null,

  status inventory_reservation_status not null default 'reserved',

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reservation_time_valid check (reserved_until > reserved_from)
);

drop trigger if exists inventory_reservations_set_updated_at on inventory_reservations;
create trigger inventory_reservations_set_updated_at
before update on inventory_reservations
for each row execute function set_updated_at();

create index if not exists idx_inventory_reservations_booking_id on inventory_reservations(booking_id);
create index if not exists idx_inventory_reservations_item_id on inventory_reservations(inventory_item_id);
create index if not exists idx_inventory_reservations_unit_id on inventory_reservations(inventory_unit_id);
create index if not exists idx_inventory_reservations_time on inventory_reservations(reserved_from, reserved_until);
create index if not exists idx_inventory_reservations_status on inventory_reservations(status);

-- =========================================================
-- TAX / PRICING
-- =========================================================

create table if not exists tax_rates_cache (
  id uuid primary key default uuid_generate_v4(),

  street_address text,
  city text,
  state text default 'CA',
  zip text,

  normalized_address text,

  tax_rate numeric(8,6) not null,
  tax_area_code text,

  source text not null default 'manual',
  effective_date date,
  expires_at date,

  created_at timestamptz not null default now()
);

create index if not exists idx_tax_rates_cache_zip on tax_rates_cache(zip);
create index if not exists idx_tax_rates_cache_address on tax_rates_cache(normalized_address);

create table if not exists delivery_zones (
  id uuid primary key default uuid_generate_v4(),

  zone_name text not null,
  city text,
  zip text,

  base_fee numeric(10,2) not null default 0,
  free_delivery_min_order numeric(10,2),

  min_miles numeric(8,2),
  max_miles numeric(8,2),

  average_drive_minutes integer,

  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists delivery_zones_set_updated_at on delivery_zones;
create trigger delivery_zones_set_updated_at
before update on delivery_zones
for each row execute function set_updated_at();

create index if not exists idx_delivery_zones_zip on delivery_zones(zip);
create index if not exists idx_delivery_zones_city on delivery_zones(city);

create table if not exists delivery_calculations (
  id uuid primary key default uuid_generate_v4(),

  booking_id uuid references bookings(id) on delete cascade,

  warehouse_id uuid references warehouses(id) on delete set null,
  destination_address text,
  destination_city text,
  destination_state text default 'CA',
  destination_zip text,

  distance_miles numeric(8,2),
  drive_minutes integer,

  zone_id uuid references delivery_zones(id) on delete set null,

  base_delivery_fee numeric(10,2) not null default 0,
  extra_distance_fee numeric(10,2) not null default 0,
  complexity_fee numeric(10,2) not null default 0,
  manual_adjustment numeric(10,2) not null default 0,

  final_delivery_fee numeric(10,2) not null default 0,

  source text not null default 'manual',

  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_calculations_booking_id on delivery_calculations(booking_id);

create table if not exists booking_price_calculations (
  id uuid primary key default uuid_generate_v4(),

  booking_id uuid not null references bookings(id) on delete cascade,

  rental_subtotal numeric(10,2) not null default 0,
  modifiers_subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  service_fee numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,

  taxable_amount numeric(10,2) not null default 0,
  tax_rate numeric(8,6) not null default 0,
  tax_amount numeric(10,2) not null default 0,

  non_taxable_amount numeric(10,2) not null default 0,

  total_amount numeric(10,2) not null default 0,
  deposit_amount numeric(10,2) not null default 0,
  balance_due numeric(10,2) not null default 0,

  calculation_snapshot jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_booking_price_calculations_booking_id
on booking_price_calculations(booking_id);

create table if not exists price_overrides (
  id uuid primary key default uuid_generate_v4(),

  booking_id uuid not null references bookings(id) on delete cascade,

  field_name text not null,
  old_value text,
  new_value text,

  reason text,
  changed_by uuid,

  created_at timestamptz not null default now()
);

create index if not exists idx_price_overrides_booking_id on price_overrides(booking_id);

-- =========================================================
-- PAYMENTS
-- =========================================================

create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),

  booking_id uuid not null references bookings(id) on delete cascade,

  amount numeric(10,2) not null,
  method payment_method not null,
  status text not null default 'paid',

  external_reference text,
  note text,

  paid_at timestamptz default now(),

  created_at timestamptz not null default now()
);

create index if not exists idx_payments_booking_id on payments(booking_id);
create index if not exists idx_payments_method on payments(method);

-- =========================================================
-- CONTRACTS
-- =========================================================

create table if not exists contracts (
  id uuid primary key default uuid_generate_v4(),

  booking_id uuid not null references bookings(id) on delete cascade,

  status contract_status not null default 'not_sent',

  signer_name text,
  signer_email text,

  provider text,
  external_contract_id text,

  pdf_url text,

  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists contracts_set_updated_at on contracts;
create trigger contracts_set_updated_at
before update on contracts
for each row execute function set_updated_at();

create index if not exists idx_contracts_booking_id on contracts(booking_id);
create index if not exists idx_contracts_status on contracts(status);

-- =========================================================
-- DELIVERY / ROUTES
-- =========================================================

create table if not exists drivers (
  id uuid primary key default uuid_generate_v4(),

  name text not null,
  phone text,
  email text,

  active boolean not null default true,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists drivers_set_updated_at on drivers;
create trigger drivers_set_updated_at
before update on drivers
for each row execute function set_updated_at();

create table if not exists vehicles (
  id uuid primary key default uuid_generate_v4(),

  name text not null,
  license_plate text,

  capacity_space_units numeric(8,2) not null default 10,

  active boolean not null default true,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists vehicles_set_updated_at on vehicles;
create trigger vehicles_set_updated_at
before update on vehicles
for each row execute function set_updated_at();

create table if not exists delivery_routes (
  id uuid primary key default uuid_generate_v4(),

  route_date date not null,

  driver_id uuid references drivers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,

  name text,

  status text not null default 'draft',

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists delivery_routes_set_updated_at on delivery_routes;
create trigger delivery_routes_set_updated_at
before update on delivery_routes
for each row execute function set_updated_at();

create index if not exists idx_delivery_routes_route_date on delivery_routes(route_date);
create index if not exists idx_delivery_routes_driver_id on delivery_routes(driver_id);

create table if not exists route_stops (
  id uuid primary key default uuid_generate_v4(),

  route_id uuid references delivery_routes(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,

  stop_type route_stop_type not null,
  status route_stop_status not null default 'scheduled',

  sequence integer not null default 0,

  scheduled_start timestamptz,
  scheduled_end timestamptz,

  actual_arrival timestamptz,
  actual_completed timestamptz,

  address text,
  city text,
  state text default 'CA',
  zip text,

  customer_name text,
  customer_phone text,

  estimated_duration_minutes integer not null default 45,

  balance_due numeric(10,2) not null default 0,

  driver_notes text,
  internal_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists route_stops_set_updated_at on route_stops;
create trigger route_stops_set_updated_at
before update on route_stops
for each row execute function set_updated_at();

create index if not exists idx_route_stops_route_id on route_stops(route_id);
create index if not exists idx_route_stops_booking_id on route_stops(booking_id);
create index if not exists idx_route_stops_scheduled_start on route_stops(scheduled_start);
create index if not exists idx_route_stops_status on route_stops(status);

-- =========================================================
-- TASKS / CRM REMINDERS
-- =========================================================

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),

  booking_id uuid references bookings(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,

  title text not null,
  description text,

  task_type text,

  due_at timestamptz,

  status text not null default 'open',

  assigned_to uuid,

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at
before update on tasks
for each row execute function set_updated_at();

create index if not exists idx_tasks_booking_id on tasks(booking_id);
create index if not exists idx_tasks_customer_id on tasks(customer_id);
create index if not exists idx_tasks_due_at on tasks(due_at);
create index if not exists idx_tasks_status on tasks(status);

-- =========================================================
-- CRM COMMUNICATION LOG
-- =========================================================

create table if not exists customer_communications (
  id uuid primary key default uuid_generate_v4(),

  customer_id uuid references customers(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,

  channel text not null,
  direction text not null default 'outbound',

  subject text,
  body text,

  created_by uuid,

  created_at timestamptz not null default now()
);

create index if not exists idx_customer_communications_customer_id
on customer_communications(customer_id);

create index if not exists idx_customer_communications_booking_id
on customer_communications(booking_id);

-- =========================================================
-- BOOKING NUMBER GENERATOR
-- =========================================================

create sequence if not exists booking_number_seq start 1000;

create or replace function generate_booking_number()
returns trigger as $$
begin
  if new.booking_number is null then
    new.booking_number := 'BPLA-' || nextval('booking_number_seq');
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists bookings_generate_booking_number on bookings;
create trigger bookings_generate_booking_number
before insert on bookings
for each row execute function generate_booking_number();

-- =========================================================
-- PAYMENT TOTAL REFRESH
-- =========================================================

create or replace function refresh_booking_payment_totals(target_booking_id uuid)
returns void as $$
declare
  paid_total numeric(10,2);
  booking_total numeric(10,2);
begin
  select coalesce(sum(amount), 0)
  into paid_total
  from payments
  where booking_id = target_booking_id
    and status = 'paid';

  select total_amount
  into booking_total
  from bookings
  where id = target_booking_id;

  update bookings
  set
    amount_paid = paid_total,
    balance_due = greatest(booking_total - paid_total, 0),
    payment_status =
      case
        when paid_total <= 0 then 'unpaid'::payment_status
        when paid_total < booking_total then 'partial'::payment_status
        else 'paid'::payment_status
      end
  where id = target_booking_id;
end;
$$ language plpgsql;

create or replace function payments_after_change()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    perform refresh_booking_payment_totals(old.booking_id);
    return old;
  else
    perform refresh_booking_payment_totals(new.booking_id);
    return new;
  end if;
end;
$$ language plpgsql;

drop trigger if exists payments_refresh_booking_totals on payments;
create trigger payments_refresh_booking_totals
after insert or update or delete on payments
for each row execute function payments_after_change();

-- =========================================================
-- BASIC SEED DATA
-- =========================================================

insert into product_categories (name, slug, sort_order)
values
  ('Inflatables', 'inflatables', 10),
  ('Soft Play', 'soft-play', 20),
  ('Bubble Houses', 'bubble-houses', 30),
  ('Add-ons', 'add-ons', 40)
on conflict (slug) do nothing;

insert into inventory_categories (name, slug, sort_order)
values
  ('Inflatables', 'inflatables', 10),
  ('Blowers', 'blowers', 20),
  ('Tarps', 'tarps', 30),
  ('Anchoring', 'anchoring', 40),
  ('Extension Cords', 'extension-cords', 50),
  ('Ball Pit Balls', 'ball-pit-balls', 60),
  ('Soft Play Parts', 'soft-play-parts', 70),
  ('Generators', 'generators', 80),
  ('Decor', 'decor', 90)
on conflict (slug) do nothing;

insert into modifiers (name, slug, base_price, taxable)
values
  ('Generator', 'generator', 100, true),
  ('Attendant', 'attendant', 150, true),
  ('Balloon Columns', 'balloon-columns', 0, true),
  ('Extra Day Rental', 'extra-day-rental', 0, true),
  ('Park Insurance COI', 'park-insurance-coi', 0, false),
  ('Half Soft Play Add-on', 'half-soft-play-addon', 240, true)
on conflict (slug) do nothing;

-- END: 001_bounce_party_core.sql
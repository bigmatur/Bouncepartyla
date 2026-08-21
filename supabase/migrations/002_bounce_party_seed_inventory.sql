-- START: 002_bounce_party_seed_inventory.sql
-- =========================================================
-- Bounce Party LA Seed Inventory
-- Migration: 002_bounce_party_seed_inventory.sql
-- =========================================================

-- =========================================================
-- WAREHOUSE
-- =========================================================

insert into warehouses (name, city, state, zip)
values ('Main Warehouse', 'La Canada Flintridge', 'CA', '91011')
on conflict do nothing;

-- =========================================================
-- INVENTORY ITEMS
-- =========================================================

insert into inventory_items (name, sku, tracking_type, total_quantity, unit_label, active)
values
  ('White Castle with Slide Unit', 'INV-WHITE-CASTLE-SLIDE', 'serialized', 0, 'unit', true),
  ('Royal Castle Unit', 'INV-ROYAL-CASTLE', 'serialized', 0, 'unit', true),
  ('Bubble House Unit', 'INV-BUBBLE-HOUSE', 'serialized', 0, 'unit', true),

  ('Blower 1.5 HP', 'INV-BLOWER-15HP', 'serialized', 0, 'unit', true),
  ('Blower 2 HP', 'INV-BLOWER-2HP', 'serialized', 0, 'unit', true),

  ('Tarp 18x18', 'INV-TARP-18X18', 'serialized', 0, 'unit', true),
  ('Tarp 20x20', 'INV-TARP-20X20', 'serialized', 0, 'unit', true),
  ('Bubble House Round Tarp', 'INV-BUBBLE-TARP', 'serialized', 0, 'unit', true),

  ('Extension Cord', 'INV-EXT-CORD', 'serialized', 0, 'unit', true),
  ('Generator', 'INV-GENERATOR', 'serialized', 0, 'unit', true),

  ('Stakes', 'INV-STAKES', 'quantity', 120, 'pcs', true),
  ('Sandbags', 'INV-SANDBAGS', 'quantity', 40, 'pcs', true),

  ('White Balls', 'INV-BALLS-WHITE', 'quantity', 5000, 'balls', true),
  ('Pink Balls', 'INV-BALLS-PINK', 'quantity', 2500, 'balls', true),
  ('Transparent Balls', 'INV-BALLS-TRANSPARENT', 'quantity', 4000, 'balls', true),
  ('Blue Balls', 'INV-BALLS-BLUE', 'quantity', 2000, 'balls', true),
  ('Yellow Balls', 'INV-BALLS-YELLOW', 'quantity', 2000, 'balls', true),
  ('Purple Balls', 'INV-BALLS-PURPLE', 'quantity', 1000, 'balls', true),

  ('Soft Play Beige Set', 'INV-SOFT-BEIGE', 'serialized', 0, 'set', true),
  ('Soft Play White Set', 'INV-SOFT-WHITE', 'serialized', 0, 'set', true),
  ('Soft Play Fence Set', 'INV-SOFT-FENCE', 'serialized', 0, 'set', true),
  ('Soft Play Mat Set', 'INV-SOFT-MATS', 'serialized', 0, 'set', true),

  ('Ball Pit', 'INV-BALL-PIT', 'serialized', 0, 'unit', true),
  ('Soft Play Toys Set', 'INV-SOFT-TOYS', 'serialized', 0, 'set', true)
on conflict (sku) do nothing;

-- =========================================================
-- PRODUCTS
-- =========================================================

insert into products (
  category_id,
  name,
  slug,
  description,
  base_price,
  deposit_amount,
  setup_width_ft,
  setup_length_ft,
  setup_height_ft,
  setup_minutes,
  pickup_minutes,
  loading_minutes,
  vehicle_space_units,
  max_capacity,
  active,
  sort_order
)
select
  pc.id,
  'White Castle with Slide',
  'white-castle-with-slide',
  'White castle inflatable with slide and dry pool / ball pit.',
  450,
  50,
  18,
  18,
  15,
  45,
  30,
  15,
  2,
  15,
  true,
  10
from product_categories pc
where pc.slug = 'inflatables'
on conflict (slug) do nothing;

insert into products (
  category_id,
  name,
  slug,
  description,
  base_price,
  deposit_amount,
  setup_width_ft,
  setup_length_ft,
  setup_height_ft,
  setup_minutes,
  pickup_minutes,
  loading_minutes,
  vehicle_space_units,
  max_capacity,
  active,
  sort_order
)
select
  pc.id,
  'Royal Castle',
  'royal-castle',
  'Large premium castle inflatable.',
  430,
  50,
  18,
  18,
  15,
  45,
  30,
  15,
  2,
  15,
  true,
  20
from product_categories pc
where pc.slug = 'inflatables'
on conflict (slug) do nothing;

insert into products (
  category_id,
  name,
  slug,
  description,
  base_price,
  deposit_amount,
  setup_width_ft,
  setup_length_ft,
  setup_height_ft,
  setup_minutes,
  pickup_minutes,
  loading_minutes,
  vehicle_space_units,
  max_capacity,
  active,
  sort_order
)
select
  pc.id,
  'Bubble House',
  'bubble-house',
  'Bubble house inflatable. Balloons can be added as modifier.',
  450,
  50,
  15,
  15,
  10,
  90,
  45,
  20,
  3,
  5,
  true,
  30
from product_categories pc
where pc.slug = 'bubble-houses'
on conflict (slug) do nothing;

insert into products (
  category_id,
  name,
  slug,
  description,
  base_price,
  deposit_amount,
  setup_width_ft,
  setup_length_ft,
  setup_height_ft,
  setup_minutes,
  pickup_minutes,
  loading_minutes,
  vehicle_space_units,
  max_capacity,
  active,
  sort_order
)
select
  pc.id,
  'Soft Play Beige',
  'soft-play-beige',
  'Beige soft play set with mats, fence, toys and ball pit.',
  490,
  50,
  10,
  10,
  null,
  60,
  45,
  20,
  2,
  8,
  true,
  40
from product_categories pc
where pc.slug = 'soft-play'
on conflict (slug) do nothing;

insert into products (
  category_id,
  name,
  slug,
  description,
  base_price,
  deposit_amount,
  setup_width_ft,
  setup_length_ft,
  setup_height_ft,
  setup_minutes,
  pickup_minutes,
  loading_minutes,
  vehicle_space_units,
  max_capacity,
  active,
  sort_order
)
select
  pc.id,
  'Soft Play White',
  'soft-play-white',
  'White soft play set with mats, fence, toys and ball pit.',
  490,
  50,
  10,
  10,
  null,
  60,
  45,
  20,
  2,
  8,
  true,
  50
from product_categories pc
where pc.slug = 'soft-play'
on conflict (slug) do nothing;

-- =========================================================
-- PRODUCT MODIFIERS
-- =========================================================

insert into product_modifiers (
  product_id,
  modifier_id,
  is_required,
  is_default,
  min_quantity,
  max_quantity
)
select p.id, m.id, false, false, 0, 1
from products p
cross join modifiers m
where p.slug in (
  'white-castle-with-slide',
  'royal-castle',
  'bubble-house',
  'soft-play-beige',
  'soft-play-white'
)
and m.slug = 'generator'
on conflict (product_id, modifier_id) do nothing;

insert into product_modifiers (
  product_id,
  modifier_id,
  is_required,
  is_default,
  min_quantity,
  max_quantity
)
select p.id, m.id, false, false, 0, 1
from products p
cross join modifiers m
where p.slug = 'bubble-house'
and m.slug = 'balloon-columns'
on conflict (product_id, modifier_id) do nothing;

insert into product_modifiers (
  product_id,
  modifier_id,
  is_required,
  is_default,
  min_quantity,
  max_quantity
)
select p.id, m.id, false, false, 0, 1
from products p
cross join modifiers m
where p.slug in ('white-castle-with-slide', 'royal-castle')
and m.slug = 'half-soft-play-addon'
on conflict (product_id, modifier_id) do nothing;

-- =========================================================
-- INVENTORY UNITS
-- =========================================================

-- White Castle units
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('WC-SLIDE-001'),
    ('WC-SLIDE-002'),
    ('WC-SLIDE-003'),
    ('WC-SLIDE-004')
) as codes(unit_code)
where ii.sku = 'INV-WHITE-CASTLE-SLIDE'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Royal Castle units
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('ROYAL-001'),
    ('ROYAL-002')
) as codes(unit_code)
where ii.sku = 'INV-ROYAL-CASTLE'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Bubble House units
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('BUBBLE-001'),
    ('BUBBLE-002')
) as codes(unit_code)
where ii.sku = 'INV-BUBBLE-HOUSE'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Blowers
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('BLOWER-15-001'),
    ('BLOWER-15-002'),
    ('BLOWER-15-003'),
    ('BLOWER-15-004'),
    ('BLOWER-15-005'),
    ('BLOWER-15-006'),
    ('BLOWER-15-007'),
    ('BLOWER-15-008')
) as codes(unit_code)
where ii.sku = 'INV-BLOWER-15HP'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Tarps 18x18
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('TARP-18-001'),
    ('TARP-18-002'),
    ('TARP-18-003'),
    ('TARP-18-004'),
    ('TARP-18-005'),
    ('TARP-18-006')
) as codes(unit_code)
where ii.sku = 'INV-TARP-18X18'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Tarps 20x20
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('TARP-20-001'),
    ('TARP-20-002')
) as codes(unit_code)
where ii.sku = 'INV-TARP-20X20'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Bubble tarps
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('BUBBLE-TARP-001'),
    ('BUBBLE-TARP-002')
) as codes(unit_code)
where ii.sku = 'INV-BUBBLE-TARP'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Extension cords
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('CORD-001'),
    ('CORD-002'),
    ('CORD-003'),
    ('CORD-004'),
    ('CORD-005'),
    ('CORD-006'),
    ('CORD-007'),
    ('CORD-008'),
    ('CORD-009'),
    ('CORD-010'),
    ('CORD-011'),
    ('CORD-012')
) as codes(unit_code)
where ii.sku = 'INV-EXT-CORD'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Generators
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('GEN-001'),
    ('GEN-002')
) as codes(unit_code)
where ii.sku = 'INV-GENERATOR'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Soft Play Beige sets
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('SOFT-BEIGE-001'),
    ('SOFT-BEIGE-002')
) as codes(unit_code)
where ii.sku = 'INV-SOFT-BEIGE'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Soft Play White sets
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('SOFT-WHITE-001')
) as codes(unit_code)
where ii.sku = 'INV-SOFT-WHITE'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Ball pits
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('BALL-PIT-001'),
    ('BALL-PIT-002'),
    ('BALL-PIT-003')
) as codes(unit_code)
where ii.sku = 'INV-BALL-PIT'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- Soft toys sets
insert into inventory_units (inventory_item_id, warehouse_id, unit_code, status, condition)
select ii.id, w.id, codes.unit_code, 'available', 'good'
from inventory_items ii
cross join warehouses w
cross join (
  values
    ('SOFT-TOYS-001'),
    ('SOFT-TOYS-002'),
    ('SOFT-TOYS-003')
) as codes(unit_code)
where ii.sku = 'INV-SOFT-TOYS'
  and w.name = 'Main Warehouse'
on conflict (unit_code) do nothing;

-- =========================================================
-- INVENTORY RECIPES
-- =========================================================

-- White Castle with Slide recipe
insert into inventory_recipes (
  product_id,
  inventory_item_id,
  quantity_required,
  requirement_type,
  alternative_group,
  is_optional
)
select p.id, ii.id, req.quantity_required, req.requirement_type, req.alternative_group, req.is_optional
from products p
join (
  values
    ('INV-WHITE-CASTLE-SLIDE', 1, 'required', null, false),
    ('INV-BLOWER-15HP', 1, 'required', null, false),
    ('INV-TARP-18X18', 1, 'required', null, false),
    ('INV-EXT-CORD', 2, 'required', null, false),
    ('INV-STAKES', 6, 'alternative', 'anchoring', false),
    ('INV-SANDBAGS', 6, 'alternative', 'anchoring', false),
    ('INV-BALLS-WHITE', 1000, 'required', null, false)
) as req(sku, quantity_required, requirement_type, alternative_group, is_optional)
on true
join inventory_items ii on ii.sku = req.sku
where p.slug = 'white-castle-with-slide';

-- Royal Castle recipe
insert into inventory_recipes (
  product_id,
  inventory_item_id,
  quantity_required,
  requirement_type,
  alternative_group,
  is_optional
)
select p.id, ii.id, req.quantity_required, req.requirement_type, req.alternative_group, req.is_optional
from products p
join (
  values
    ('INV-ROYAL-CASTLE', 1, 'required', null, false),
    ('INV-BLOWER-15HP', 1, 'required', null, false),
    ('INV-TARP-18X18', 1, 'required', null, false),
    ('INV-EXT-CORD', 2, 'required', null, false),
    ('INV-STAKES', 6, 'alternative', 'anchoring', false),
    ('INV-SANDBAGS', 6, 'alternative', 'anchoring', false)
) as req(sku, quantity_required, requirement_type, alternative_group, is_optional)
on true
join inventory_items ii on ii.sku = req.sku
where p.slug = 'royal-castle';

-- Bubble House recipe
insert into inventory_recipes (
  product_id,
  inventory_item_id,
  quantity_required,
  requirement_type,
  alternative_group,
  is_optional
)
select p.id, ii.id, req.quantity_required, req.requirement_type, req.alternative_group, req.is_optional
from products p
join (
  values
    ('INV-BUBBLE-HOUSE', 1, 'required', null, false),
    ('INV-BLOWER-15HP', 1, 'required', null, false),
    ('INV-BUBBLE-TARP', 1, 'required', null, false),
    ('INV-EXT-CORD', 2, 'required', null, false),
    ('INV-SANDBAGS', 8, 'required', null, false)
) as req(sku, quantity_required, requirement_type, alternative_group, is_optional)
on true
join inventory_items ii on ii.sku = req.sku
where p.slug = 'bubble-house';

-- Soft Play Beige recipe
insert into inventory_recipes (
  product_id,
  inventory_item_id,
  quantity_required,
  requirement_type,
  alternative_group,
  is_optional
)
select p.id, ii.id, req.quantity_required, req.requirement_type, req.alternative_group, req.is_optional
from products p
join (
  values
    ('INV-SOFT-BEIGE', 1, 'required', null, false),
    ('INV-BALL-PIT', 1, 'required', null, false),
    ('INV-SOFT-TOYS', 1, 'required', null, false),
    ('INV-BALLS-WHITE', 1000, 'required', null, false),
    ('INV-BALLS-TRANSPARENT', 500, 'required', null, false)
) as req(sku, quantity_required, requirement_type, alternative_group, is_optional)
on true
join inventory_items ii on ii.sku = req.sku
where p.slug = 'soft-play-beige';

-- Soft Play White recipe
insert into inventory_recipes (
  product_id,
  inventory_item_id,
  quantity_required,
  requirement_type,
  alternative_group,
  is_optional
)
select p.id, ii.id, req.quantity_required, req.requirement_type, req.alternative_group, req.is_optional
from products p
join (
  values
    ('INV-SOFT-WHITE', 1, 'required', null, false),
    ('INV-BALL-PIT', 1, 'required', null, false),
    ('INV-SOFT-TOYS', 1, 'required', null, false),
    ('INV-BALLS-WHITE', 1000, 'required', null, false),
    ('INV-BALLS-TRANSPARENT', 500, 'required', null, false)
) as req(sku, quantity_required, requirement_type, alternative_group, is_optional)
on true
join inventory_items ii on ii.sku = req.sku
where p.slug = 'soft-play-white';

-- =========================================================
-- MODIFIER INVENTORY RECIPES
-- =========================================================

-- Generator modifier requires 1 generator
insert into inventory_recipes (
  product_id,
  modifier_id,
  inventory_item_id,
  quantity_required,
  requirement_type,
  alternative_group,
  is_optional
)
select p.id, m.id, ii.id, 1, 'required', null, false
from products p
cross join modifiers m
join inventory_items ii on ii.sku = 'INV-GENERATOR'
where p.slug in (
  'white-castle-with-slide',
  'royal-castle',
  'bubble-house',
  'soft-play-beige',
  'soft-play-white'
)
and m.slug = 'generator';

-- Half soft play modifier requires one beige soft play set
insert into inventory_recipes (
  product_id,
  modifier_id,
  inventory_item_id,
  quantity_required,
  requirement_type,
  alternative_group,
  is_optional
)
select p.id, m.id, ii.id, 1, 'required', null, false
from products p
cross join modifiers m
join inventory_items ii on ii.sku = 'INV-SOFT-BEIGE'
where p.slug in ('white-castle-with-slide', 'royal-castle')
and m.slug = 'half-soft-play-addon';

-- =========================================================
-- DELIVERY ZONES
-- =========================================================

insert into delivery_zones (
  zone_name,
  city,
  zip,
  base_fee,
  average_drive_minutes,
  active
)
values
  ('La Canada', 'La Canada Flintridge', '91011', 0, 10, true),
  ('Glendale', 'Glendale', '91204', 25, 25, true),
  ('Glendale', 'Glendale', '91203', 25, 25, true),
  ('Glendale', 'Glendale', '91205', 25, 25, true),
  ('Pasadena', 'Pasadena', '91107', 25, 30, true),
  ('Pasadena', 'Pasadena', '91101', 25, 30, true),
  ('Burbank', 'Burbank', '91501', 20, 25, true),
  ('Burbank', 'Burbank', '91502', 20, 25, true),
  ('Altadena', 'Altadena', '91001', 25, 30, true),
  ('Beverly Hills', 'Beverly Hills', '90210', 50, 55, true),
  ('Yorba Linda', 'Yorba Linda', '92886', 50, 70, true),
  ('Downey', 'Downey', '90241', 45, 50, true),
  ('Granada Hills', 'Granada Hills', '91344', 40, 45, true),
  ('Porter Ranch', 'Porter Ranch', '91326', 45, 50, true)
on conflict do nothing;

-- =========================================================
-- TAX CACHE EXAMPLES
-- These are temporary ZIP-based fallback rates.
-- Later we will connect exact address lookup.
-- =========================================================

insert into tax_rates_cache (
  city,
  state,
  zip,
  normalized_address,
  tax_rate,
  source,
  expires_at
)
values
  ('La Canada Flintridge', 'CA', '91011', null, 0.1025, 'manual_zip_seed', '2026-12-31'),
  ('Glendale', 'CA', '91204', null, 0.1025, 'manual_zip_seed', '2026-12-31'),
  ('Glendale', 'CA', '91203', null, 0.1025, 'manual_zip_seed', '2026-12-31'),
  ('Glendale', 'CA', '91205', null, 0.1025, 'manual_zip_seed', '2026-12-31'),
  ('Pasadena', 'CA', '91107', null, 0.1025, 'manual_zip_seed', '2026-12-31'),
  ('Pasadena', 'CA', '91101', null, 0.1025, 'manual_zip_seed', '2026-12-31'),
  ('Burbank', 'CA', '91501', null, 0.1025, 'manual_zip_seed', '2026-12-31'),
  ('Burbank', 'CA', '91502', null, 0.1025, 'manual_zip_seed', '2026-12-31'),
  ('Altadena', 'CA', '91001', null, 0.1025, 'manual_zip_seed', '2026-12-31'),
  ('Beverly Hills', 'CA', '90210', null, 0.0950, 'manual_zip_seed', '2026-12-31'),
  ('Yorba Linda', 'CA', '92886', null, 0.0775, 'manual_zip_seed', '2026-12-31'),
  ('Downey', 'CA', '90241', null, 0.1025, 'manual_zip_seed', '2026-12-31'),
  ('Granada Hills', 'CA', '91344', null, 0.0950, 'manual_zip_seed', '2026-12-31'),
  ('Porter Ranch', 'CA', '91326', null, 0.0950, 'manual_zip_seed', '2026-12-31')
on conflict do nothing;

-- =========================================================
-- SAMPLE DRIVERS / VEHICLES
-- =========================================================

insert into drivers (name, phone, active)
values
  ('Driver 1', null, true),
  ('Driver 2', null, true)
on conflict do nothing;

insert into vehicles (name, license_plate, capacity_space_units, active)
values
  ('Van 1', null, 10, true),
  ('Van 2', null, 10, true)
on conflict do nothing;

-- END: 002_bounce_party_seed_inventory.sql
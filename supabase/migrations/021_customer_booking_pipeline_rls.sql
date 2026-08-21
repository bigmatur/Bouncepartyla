-- =========================================================
-- 021 Customer booking pipeline RLS
-- Allows customer accounts to create/read/update only their own
-- booking records and dependent rows used by booking flow.
-- =========================================================

alter table if exists public.bookings enable row level security;
alter table if exists public.booking_items enable row level security;
alter table if exists public.booking_modifiers enable row level security;
alter table if exists public.delivery_calculations enable row level security;
alter table if exists public.booking_price_calculations enable row level security;
alter table if exists public.inventory_reservations enable row level security;
alter table if exists public.inventory_recipes enable row level security;
alter table if exists public.inventory_units enable row level security;
alter table if exists public.inventory_items enable row level security;

-- ---------------------------------------------------------
-- Helper predicates repeated inline for PostgreSQL policy scope.
-- staff: active profile and non-customer role
-- customer own row: linked through customers.auth_user_id = auth.uid()
-- ---------------------------------------------------------

-- bookings

drop policy if exists bookings_select_staff_all on public.bookings;
create policy bookings_select_staff_all
on public.bookings
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists bookings_insert_staff_all on public.bookings;
create policy bookings_insert_staff_all
on public.bookings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists bookings_update_staff_all on public.bookings;
create policy bookings_update_staff_all
on public.bookings
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists bookings_select_own_customer on public.bookings;
create policy bookings_select_own_customer
on public.bookings
for select
to authenticated
using (
  exists (
    select 1
    from public.customers c
    where c.id = bookings.customer_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists bookings_insert_own_customer on public.bookings;
create policy bookings_insert_own_customer
on public.bookings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.customers c
    where c.id = bookings.customer_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists bookings_update_own_customer on public.bookings;
create policy bookings_update_own_customer
on public.bookings
for update
to authenticated
using (
  exists (
    select 1
    from public.customers c
    where c.id = bookings.customer_id
      and c.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.customers c
    where c.id = bookings.customer_id
      and c.auth_user_id = auth.uid()
  )
);

-- booking_items

drop policy if exists booking_items_select_staff_all on public.booking_items;
create policy booking_items_select_staff_all
on public.booking_items
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists booking_items_insert_staff_all on public.booking_items;
create policy booking_items_insert_staff_all
on public.booking_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists booking_items_select_own_booking on public.booking_items;
create policy booking_items_select_own_booking
on public.booking_items
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.id = booking_items.booking_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists booking_items_insert_own_booking on public.booking_items;
create policy booking_items_insert_own_booking
on public.booking_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.id = booking_items.booking_id
      and c.auth_user_id = auth.uid()
  )
);

-- booking_modifiers

drop policy if exists booking_modifiers_select_staff_all on public.booking_modifiers;
create policy booking_modifiers_select_staff_all
on public.booking_modifiers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists booking_modifiers_insert_staff_all on public.booking_modifiers;
create policy booking_modifiers_insert_staff_all
on public.booking_modifiers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists booking_modifiers_select_own_booking on public.booking_modifiers;
create policy booking_modifiers_select_own_booking
on public.booking_modifiers
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.id = booking_modifiers.booking_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists booking_modifiers_insert_own_booking on public.booking_modifiers;
create policy booking_modifiers_insert_own_booking
on public.booking_modifiers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.id = booking_modifiers.booking_id
      and c.auth_user_id = auth.uid()
  )
);

-- delivery_calculations

drop policy if exists delivery_calculations_select_staff_all on public.delivery_calculations;
create policy delivery_calculations_select_staff_all
on public.delivery_calculations
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists delivery_calculations_insert_staff_all on public.delivery_calculations;
create policy delivery_calculations_insert_staff_all
on public.delivery_calculations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists delivery_calculations_select_own_booking on public.delivery_calculations;
create policy delivery_calculations_select_own_booking
on public.delivery_calculations
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.id = delivery_calculations.booking_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists delivery_calculations_insert_own_booking on public.delivery_calculations;
create policy delivery_calculations_insert_own_booking
on public.delivery_calculations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.id = delivery_calculations.booking_id
      and c.auth_user_id = auth.uid()
  )
);

-- booking_price_calculations

drop policy if exists booking_price_calculations_select_staff_all on public.booking_price_calculations;
create policy booking_price_calculations_select_staff_all
on public.booking_price_calculations
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists booking_price_calculations_insert_staff_all on public.booking_price_calculations;
create policy booking_price_calculations_insert_staff_all
on public.booking_price_calculations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists booking_price_calculations_select_own_booking on public.booking_price_calculations;
create policy booking_price_calculations_select_own_booking
on public.booking_price_calculations
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.id = booking_price_calculations.booking_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists booking_price_calculations_insert_own_booking on public.booking_price_calculations;
create policy booking_price_calculations_insert_own_booking
on public.booking_price_calculations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.id = booking_price_calculations.booking_id
      and c.auth_user_id = auth.uid()
  )
);

-- inventory_reservations

drop policy if exists inventory_reservations_select_staff_all on public.inventory_reservations;
create policy inventory_reservations_select_staff_all
on public.inventory_reservations
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists inventory_reservations_insert_staff_all on public.inventory_reservations;
create policy inventory_reservations_insert_staff_all
on public.inventory_reservations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists inventory_reservations_select_own_booking on public.inventory_reservations;
create policy inventory_reservations_select_own_booking
on public.inventory_reservations
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.id = inventory_reservations.booking_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists inventory_reservations_insert_own_booking on public.inventory_reservations;
create policy inventory_reservations_insert_own_booking
on public.inventory_reservations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.id = inventory_reservations.booking_id
      and c.auth_user_id = auth.uid()
  )
);

-- Read-only access needed for customer-side availability and reservation planner.

-- inventory_recipes

drop policy if exists inventory_recipes_select_staff_all on public.inventory_recipes;
create policy inventory_recipes_select_staff_all
on public.inventory_recipes
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists inventory_recipes_select_customer_active_products on public.inventory_recipes;
create policy inventory_recipes_select_customer_active_products
on public.inventory_recipes
for select
to authenticated
using (
  exists (
    select 1
    from public.products pr
    where pr.id = inventory_recipes.product_id
      and pr.active = true
  )
);

-- inventory_units

drop policy if exists inventory_units_select_staff_all on public.inventory_units;
create policy inventory_units_select_staff_all
on public.inventory_units
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists inventory_units_select_customer_active_products on public.inventory_units;
create policy inventory_units_select_customer_active_products
on public.inventory_units
for select
to authenticated
using (
  exists (
    select 1
    from public.inventory_recipes r
    join public.products pr on pr.id = r.product_id
    where r.inventory_item_id = inventory_units.inventory_item_id
      and pr.active = true
  )
);

-- inventory_items

drop policy if exists inventory_items_select_staff_all on public.inventory_items;
create policy inventory_items_select_staff_all
on public.inventory_items
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role is not null
      and p.role <> 'customer'
  )
);

drop policy if exists inventory_items_select_customer_active_recipes on public.inventory_items;
create policy inventory_items_select_customer_active_recipes
on public.inventory_items
for select
to authenticated
using (
  exists (
    select 1
    from public.inventory_recipes r
    join public.products pr on pr.id = r.product_id
    where r.inventory_item_id = inventory_items.id
      and pr.active = true
  )
);

notify pgrst, 'reload schema';

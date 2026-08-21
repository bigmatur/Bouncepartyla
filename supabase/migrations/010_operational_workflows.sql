-- =========================================================
-- 010 Operational workflows
-- Bounce Party LA Booking System
-- Purpose: add missing workflow tables/columns for tasks, checklist,
-- cleaning queue, damage reports and operational dashboard pages.
-- Safe/idempotent migration.
-- =========================================================

create extension if not exists "uuid-ossp";

-- Enum compatibility for code paths that now use consumable/lost/archived.
do $$ begin
  alter type inventory_tracking_type add value if not exists 'consumable';
exception when undefined_object then null;
end $$;

do $$ begin
  alter type inventory_unit_status add value if not exists 'lost';
exception when undefined_object then null;
end $$;

do $$ begin
  alter type inventory_unit_status add value if not exists 'archived';
exception when undefined_object then null;
end $$;

-- Some older databases did not create movements yet. New code relies on it.
create table if not exists public.inventory_movements (
  id uuid primary key default uuid_generate_v4(),
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  inventory_unit_id uuid references public.inventory_units(id) on delete set null,
  quantity numeric not null default 1,
  movement_type text not null,
  status text not null default 'completed',
  from_location_id uuid references public.warehouse_locations(id) on delete set null,
  to_location_id uuid references public.warehouse_locations(id) on delete set null,
  unit_cost numeric not null default 0,
  total_cost numeric not null default 0,
  reference_type text,
  reference_id uuid,
  booking_id uuid references public.bookings(id) on delete set null,
  supply_id uuid,
  supply_line_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.inventory_movements
  add column if not exists booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_inventory_movements_item_id
on public.inventory_movements(inventory_item_id);

create index if not exists idx_inventory_movements_unit_id
on public.inventory_movements(inventory_unit_id);

create index if not exists idx_inventory_movements_created_at
on public.inventory_movements(created_at);

-- Tasks already exist in core migration; keep compatibility for copied projects.
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references public.bookings(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
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

create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_due_at on public.tasks(due_at);
create index if not exists idx_tasks_booking_id on public.tasks(booking_id);

-- Booking checklist already introduced in 009, but keep it safe here too.
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

-- Inspections and damage reports for pickup/cleaning workflow.
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

create index if not exists idx_inventory_inspections_status
on public.inventory_inspections(status);

create index if not exists idx_inventory_inspections_unit_id
on public.inventory_inspections(inventory_unit_id);

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

create index if not exists idx_damage_reports_status
on public.damage_reports(status);

create index if not exists idx_damage_reports_unit_id
on public.damage_reports(inventory_unit_id);

-- RLS for new/compatibility tables.
alter table public.inventory_movements enable row level security;
alter table public.tasks enable row level security;
alter table public.booking_checklist_items enable row level security;
alter table public.inventory_inspections enable row level security;
alter table public.damage_reports enable row level security;

drop policy if exists "Allow admin all inventory_movements" on public.inventory_movements;
create policy "Allow admin all inventory_movements"
on public.inventory_movements for all using (true) with check (true);

drop policy if exists "Allow admin all tasks" on public.tasks;
create policy "Allow admin all tasks"
on public.tasks for all using (true) with check (true);

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

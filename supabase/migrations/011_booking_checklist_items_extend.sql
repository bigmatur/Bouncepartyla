-- Migration: extend booking_checklist_items with full operational workflow columns
-- and FK relationships to inventory_items / inventory_units.

alter table public.booking_checklist_items
  add column if not exists booking_item_id uuid references public.booking_items(id) on delete set null,
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete set null,
  add column if not exists inventory_unit_id uuid references public.inventory_units(id) on delete set null,
  add column if not exists item_type text,
  add column if not exists source text,
  add column if not exists quantity integer not null default 1,
  add column if not exists loaded boolean not null default false,
  add column if not exists installed boolean not null default false,
  add column if not exists picked_up boolean not null default false,
  add column if not exists returned boolean not null default false,
  add column if not exists needs_cleaning boolean not null default false,
  add column if not exists damaged boolean not null default false,
  add column if not exists missing boolean not null default false,
  add column if not exists loaded_at timestamptz,
  add column if not exists installed_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists returned_at timestamptz,
  add column if not exists checked_by text,
  add column if not exists notes text;

create index if not exists idx_booking_checklist_items_inventory_item_id
  on public.booking_checklist_items(inventory_item_id);

create index if not exists idx_booking_checklist_items_inventory_unit_id
  on public.booking_checklist_items(inventory_unit_id);

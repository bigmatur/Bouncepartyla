-- Preserve product/modifier lineage for inventory reservations.
--
-- Booking creation writes this lineage for product- and modifier-driven
-- inventory recipes. Older databases did not have these matching columns on
-- inventory_reservations, which made checkout fail before Stripe could open.

begin;

alter table if exists public.inventory_reservations
  add column if not exists product_id uuid
  references public.products(id)
  on delete set null,
  add column if not exists modifier_id uuid
  references public.modifiers(id)
  on delete set null,
  add column if not exists requirement_type text not null default 'product';

-- Existing reservations predate the lineage fields. Their booking item is the
-- reliable source for the product; all historical rows are product-level.
update public.inventory_reservations ir
set product_id = bi.product_id
from public.booking_items bi
where ir.product_id is null
  and bi.id = ir.booking_item_id;

do $$
begin
  alter table public.inventory_reservations
    add constraint inventory_reservations_requirement_type_check
    check (requirement_type in ('product', 'modifier'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_inventory_reservations_product_id
  on public.inventory_reservations(product_id)
  where product_id is not null;

create index if not exists idx_inventory_reservations_modifier_id
  on public.inventory_reservations(modifier_id)
  where modifier_id is not null;

commit;

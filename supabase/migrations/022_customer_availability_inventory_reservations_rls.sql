alter table if exists public.inventory_reservations enable row level security;

drop policy if exists inventory_reservations_select_authenticated_active on public.inventory_reservations;
create policy inventory_reservations_select_authenticated_active
on public.inventory_reservations
for select
to authenticated
using (
  status in ('reserved', 'picked', 'loaded', 'delivered', 'installed')
);
-- =========================================================
-- 012 Route driver accounts
-- Adds account linkage fields and soft-delete support for route drivers.
-- =========================================================

alter table if exists public.route_drivers
  add column if not exists account_email text,
  add column if not exists auth_user_id uuid,
  add column if not exists notes text,
  add column if not exists deleted_at timestamptz;

create index if not exists idx_route_drivers_auth_user_id
on public.route_drivers(auth_user_id);

create index if not exists idx_route_drivers_account_email
on public.route_drivers(account_email);

alter table if exists public.route_drivers enable row level security;

drop policy if exists "Allow admin all route_drivers" on public.route_drivers;
create policy "Allow admin all route_drivers"
on public.route_drivers for all using (true) with check (true);

notify pgrst, 'reload schema';
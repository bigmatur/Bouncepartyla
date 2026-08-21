-- =========================================================
-- 020 Customer booking access to customers table
-- Enables safe self-create/read/update for customer accounts
-- while preserving broad staff access.
-- =========================================================

alter table if exists public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_customers_auth_user_id
  on public.customers(auth_user_id);

alter table if exists public.customers enable row level security;

-- Staff can manage all customers.
drop policy if exists customers_select_staff_all on public.customers;
create policy customers_select_staff_all
on public.customers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles as profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.is_active = true
      and profiles.role is not null
      and profiles.role <> 'customer'
  )
);

drop policy if exists customers_insert_staff_all on public.customers;
create policy customers_insert_staff_all
on public.customers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles as profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.is_active = true
      and profiles.role is not null
      and profiles.role <> 'customer'
  )
);

drop policy if exists customers_update_staff_all on public.customers;
create policy customers_update_staff_all
on public.customers
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles as profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.is_active = true
      and profiles.role is not null
      and profiles.role <> 'customer'
  )
)
with check (
  exists (
    select 1
    from public.profiles as profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.is_active = true
      and profiles.role is not null
      and profiles.role <> 'customer'
  )
);

-- Customers can access only their own customer record.
drop policy if exists customers_select_own on public.customers;
create policy customers_select_own
on public.customers
for select
to authenticated
using (
  auth_user_id = auth.uid()
);

drop policy if exists customers_insert_own on public.customers;
create policy customers_insert_own
on public.customers
for insert
to authenticated
with check (
  auth_user_id = auth.uid()
);

drop policy if exists customers_update_own on public.customers;
create policy customers_update_own
on public.customers
for update
to authenticated
using (
  auth_user_id = auth.uid()
)
with check (
  auth_user_id = auth.uid()
);

notify pgrst, 'reload schema';

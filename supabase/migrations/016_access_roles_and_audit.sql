-- =========================================================
-- 016 Access roles and audit log
-- Adds custom role storage, additional role assignments,
-- and a staff directory helper for access management.
-- =========================================================

alter table if exists public.profiles
  add column if not exists additional_roles text[] not null default '{}';

create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  permissions text[] not null default '{}',
  interfaces text[] not null default '{admin}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_app_roles_is_system
on public.app_roles(is_system);

insert into public.app_roles (key, name, description, is_system, permissions, interfaces)
values
  (
    'super_admin',
    'Super Admin',
    'Full platform control, security settings, role assignments and interface switching.',
    true,
    '{dashboard.view,bookings.view,bookings.create,bookings.edit,bookings.cancel,bookings.delete,bookings.archive,bookings.restore,bookings.view_financials,bookings.view_internal_notes,routes.view,routes.create,routes.edit,routes.assign_driver,routes.reorder,routes.delete,customers.view,customers.edit,customers.view_contact_data,payments.view,payments.create,payments.edit,payments.refund,contracts.view,contracts.edit,contracts.send,catalog.view,catalog.create,catalog.edit,catalog.publish,catalog.delete,inventory.view,inventory.edit,inventory.mark_dirty,inventory.mark_damaged,inventory.mark_missing,staff.view,staff.create,staff.edit,staff.disable,roles.view,roles.edit,roles.assign,reports.view,reports.financial,preview.customer,preview.driver,settings.view,settings.edit}',
    '{admin,driver,customer}'
  ),
  (
    'admin',
    'Admin',
    'Operational admin access across bookings, routes, inventory, reports and settings.',
    true,
    '{dashboard.view,bookings.view,bookings.create,bookings.edit,bookings.cancel,bookings.delete,bookings.archive,bookings.restore,bookings.view_financials,bookings.view_internal_notes,routes.view,routes.create,routes.edit,routes.assign_driver,routes.reorder,routes.delete,customers.view,customers.edit,customers.view_contact_data,payments.view,payments.create,payments.edit,payments.refund,contracts.view,contracts.edit,contracts.send,catalog.view,catalog.create,catalog.edit,catalog.publish,catalog.delete,inventory.view,inventory.edit,inventory.mark_dirty,inventory.mark_damaged,inventory.mark_missing,staff.view,staff.create,staff.edit,staff.disable,roles.view,reports.view,reports.financial,preview.customer,preview.driver,settings.view,settings.edit}',
    '{admin,driver,customer}'
  ),
  (
    'manager',
    'Manager',
    'Supervises bookings, routes, inventory and customer operations without role assignment.',
    true,
    '{dashboard.view,bookings.view,bookings.create,bookings.edit,bookings.cancel,bookings.archive,bookings.restore,bookings.view_financials,bookings.view_internal_notes,routes.view,routes.create,routes.edit,routes.assign_driver,routes.reorder,customers.view,customers.edit,customers.view_contact_data,catalog.view,catalog.edit,inventory.view,inventory.edit,reports.view,preview.customer,preview.driver}',
    '{admin,driver,customer}'
  ),
  (
    'dispatcher',
    'Dispatcher',
    'Runs day-to-day scheduling, routing and customer coordination.',
    true,
    '{dashboard.view,bookings.view,bookings.edit,bookings.archive,routes.view,routes.create,routes.edit,routes.assign_driver,routes.reorder,customers.view,customers.view_contact_data,preview.driver,preview.customer}',
    '{admin,driver,customer}'
  ),
  (
    'cashier',
    'Cashier',
    'Handles payments, contracts and finance-facing booking details.',
    true,
    '{dashboard.view,bookings.view,bookings.view_financials,customers.view,payments.view,payments.create,payments.edit,contracts.view,contracts.send,reports.view,preview.customer}',
    '{admin,customer}'
  ),
  (
    'warehouse',
    'Warehouse',
    'Controls stock movement, condition tracking and warehouse operations.',
    true,
    '{inventory.view,inventory.edit,inventory.mark_dirty,inventory.mark_damaged,inventory.mark_missing,bookings.view,routes.view}',
    '{admin}'
  ),
  (
    'content_manager',
    'Content Manager',
    'Maintains catalog content, publishing and linked inventory data.',
    true,
    '{catalog.view,catalog.create,catalog.edit,catalog.publish,catalog.delete,inventory.view}',
    '{admin}'
  ),
  (
    'driver',
    'Driver',
    'Uses the driver interface and route previews for assigned stops.',
    true,
    '{routes.view,preview.driver}',
    '{admin,driver}'
  )
on conflict (key) do nothing;

create table if not exists public.access_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_name text not null,
  actor_email text,
  target_name text not null,
  target_email text,
  target_role text,
  action text not null,
  permission_key text,
  old_value text,
  new_value text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_access_audit_log_created_at
on public.access_audit_log(created_at desc);

create or replace function public.admin_access_user_directory()
returns table (
  auth_user_id uuid,
  email text,
  full_name text,
  last_sign_in_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    users.id as auth_user_id,
    users.email,
    coalesce(
      nullif(trim(coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name', '')), ''),
      split_part(coalesce(users.email, ''), '@', 1)
    ) as full_name,
    users.last_sign_in_at
  from auth.users as users
  where exists (
    select 1
    from public.profiles as profiles
    where profiles.auth_user_id = users.id
      and profiles.role is not null
  )
  or exists (
    select 1
    from public.route_drivers as drivers
    where drivers.auth_user_id = users.id
  );
$$;

revoke all on function public.admin_access_user_directory() from public;
grant execute on function public.admin_access_user_directory() to authenticated;

notify pgrst, 'reload schema';
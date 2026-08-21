-- Minimal workforce time clock integrated with existing auth users and route drivers.
-- One row represents one workday/shift. Staff actions are intentionally limited to:
-- Start work, Start/Resume break, Finish work.

create table if not exists public.staff_time_entries (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  route_driver_id uuid null references public.route_drivers(id) on delete set null,
  work_date date not null default current_date,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz null,
  break_started_at timestamptz null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  source text not null default 'manual' check (source in ('manual', 'driver_route', 'admin_adjustment')),
  status text not null default 'active' check (status in ('active', 'completed')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_time_entries_one_active_per_user
  on public.staff_time_entries(auth_user_id)
  where status = 'active' and clock_out_at is null;

create index if not exists staff_time_entries_work_date_idx
  on public.staff_time_entries(work_date desc);

create index if not exists staff_time_entries_auth_user_idx
  on public.staff_time_entries(auth_user_id, work_date desc);

create index if not exists staff_time_entries_route_driver_idx
  on public.staff_time_entries(route_driver_id, work_date desc);

alter table public.staff_time_entries enable row level security;

drop policy if exists staff_time_entries_select_own on public.staff_time_entries;
create policy staff_time_entries_select_own
on public.staff_time_entries
for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists staff_time_entries_insert_own on public.staff_time_entries;
create policy staff_time_entries_insert_own
on public.staff_time_entries
for insert
to authenticated
with check (auth_user_id = auth.uid());

drop policy if exists staff_time_entries_update_own on public.staff_time_entries;
create policy staff_time_entries_update_own
on public.staff_time_entries
for update
to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

-- Only management roles may review all employee time entries.
drop policy if exists staff_time_entries_select_management on public.staff_time_entries;
create policy staff_time_entries_select_management
on public.staff_time_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role in ('super_admin', 'admin', 'manager')
  )
);

drop policy if exists staff_time_entries_update_management on public.staff_time_entries;
create policy staff_time_entries_update_management
on public.staff_time_entries
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role in ('super_admin', 'admin', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role in ('super_admin', 'admin', 'manager')
  )
);

drop trigger if exists staff_time_entries_set_updated_at on public.staff_time_entries;
create trigger staff_time_entries_set_updated_at
before update on public.staff_time_entries
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';

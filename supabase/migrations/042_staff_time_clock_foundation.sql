create table if not exists public.staff_time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  route_driver_id uuid null references public.route_drivers(id) on delete set null,
  work_date date not null default ((now() at time zone 'America/Los_Angeles')::date),
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz null,
  source text not null default 'manual',
  status text not null default 'open',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_time_entries_source_check
    check (source in ('manual', 'driver_route', 'cleaning', 'admin_adjustment')),
  constraint staff_time_entries_status_check
    check (status in ('open', 'closed', 'adjusted')),
  constraint staff_time_entries_clock_order_check
    check (clock_out_at is null or clock_out_at >= clock_in_at)
);

create unique index if not exists staff_time_entries_one_open_per_profile
  on public.staff_time_entries(profile_id)
  where clock_out_at is null;

create index if not exists staff_time_entries_profile_date_idx
  on public.staff_time_entries(profile_id, work_date desc);

create index if not exists staff_time_entries_work_date_idx
  on public.staff_time_entries(work_date desc);

create table if not exists public.staff_time_breaks (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.staff_time_entries(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  break_type text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_time_breaks_type_check check (break_type in ('unpaid', 'paid')),
  constraint staff_time_breaks_order_check check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists staff_time_breaks_one_open_per_entry
  on public.staff_time_breaks(time_entry_id)
  where ended_at is null;

create index if not exists staff_time_breaks_entry_idx
  on public.staff_time_breaks(time_entry_id, started_at);

alter table public.staff_time_entries enable row level security;
alter table public.staff_time_breaks enable row level security;

drop policy if exists staff_time_entries_select_own on public.staff_time_entries;
create policy staff_time_entries_select_own
on public.staff_time_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = staff_time_entries.profile_id
      and p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
  )
);

drop policy if exists staff_time_entries_insert_own on public.staff_time_entries;
create policy staff_time_entries_insert_own
on public.staff_time_entries
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = staff_time_entries.profile_id
      and p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role <> 'customer'
  )
);

drop policy if exists staff_time_entries_update_own on public.staff_time_entries;
create policy staff_time_entries_update_own
on public.staff_time_entries
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = staff_time_entries.profile_id
      and p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = staff_time_entries.profile_id
      and p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
  )
);

drop policy if exists staff_time_breaks_select_own on public.staff_time_breaks;
create policy staff_time_breaks_select_own
on public.staff_time_breaks
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_time_entries e
    join public.profiles p on p.id = e.profile_id
    where e.id = staff_time_breaks.time_entry_id
      and p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
  )
);

drop policy if exists staff_time_breaks_insert_own on public.staff_time_breaks;
create policy staff_time_breaks_insert_own
on public.staff_time_breaks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.staff_time_entries e
    join public.profiles p on p.id = e.profile_id
    where e.id = staff_time_breaks.time_entry_id
      and p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and e.clock_out_at is null
  )
);

drop policy if exists staff_time_breaks_update_own on public.staff_time_breaks;
create policy staff_time_breaks_update_own
on public.staff_time_breaks
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_time_entries e
    join public.profiles p on p.id = e.profile_id
    where e.id = staff_time_breaks.time_entry_id
      and p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
  )
)
with check (
  exists (
    select 1
    from public.staff_time_entries e
    join public.profiles p on p.id = e.profile_id
    where e.id = staff_time_breaks.time_entry_id
      and p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
  )
);

create or replace function public.get_staff_time_report(
  p_from date,
  p_to date
)
returns table (
  id uuid,
  profile_id uuid,
  route_driver_id uuid,
  work_date date,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  source text,
  status text,
  notes text,
  role text,
  auth_user_id uuid,
  display_name text,
  break_minutes numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select p.role::text
    into v_role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true) = true
  limit 1;

  if v_role not in ('super_admin', 'admin', 'manager') then
    raise exception 'Not authorized to view staff time reports.';
  end if;

  return query
  select
    e.id,
    e.profile_id,
    e.route_driver_id,
    e.work_date,
    e.clock_in_at,
    e.clock_out_at,
    e.source,
    e.status,
    e.notes,
    p.role::text,
    p.auth_user_id,
    coalesce(rd.name, nullif(split_part(coalesce(au.email, ''), '@', 1), ''), 'Staff')::text,
    coalesce(
      sum(
        extract(epoch from (coalesce(b.ended_at, now()) - b.started_at)) / 60.0
      ) filter (where b.break_type = 'unpaid'),
      0
    )::numeric
  from public.staff_time_entries e
  join public.profiles p on p.id = e.profile_id
  left join public.route_drivers rd
    on rd.id = e.route_driver_id
    or (rd.auth_user_id is not null and rd.auth_user_id = p.auth_user_id)
  left join auth.users au on au.id = p.auth_user_id
  left join public.staff_time_breaks b on b.time_entry_id = e.id
  where e.work_date between p_from and p_to
  group by e.id, p.role, p.auth_user_id, rd.name, au.email
  order by e.work_date desc, e.clock_in_at desc;
end;
$$;

revoke all on function public.get_staff_time_report(date, date) from public;
grant execute on function public.get_staff_time_report(date, date) to authenticated;

notify pgrst, 'reload schema';

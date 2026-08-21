-- 045_staff_time_driver_email_rls_compat.sql
--
-- Extends staff time RLS compatibility for driver accounts that are linked
-- by route_drivers.account_email but do not yet have route_drivers.auth_user_id.
--
-- This keeps existing auth_user_id/profile checks and adds a safe email fallback
-- from JWT claims.

create or replace function public.is_authenticated_route_driver()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.route_drivers rd
    where coalesce(rd.active, true) = true
      and rd.deleted_at is null
      and (
        rd.auth_user_id = auth.uid()
        or (
          nullif(lower(trim(coalesce(rd.account_email, ''))), '') is not null
          and nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '') is not null
          and lower(trim(rd.account_email)) = lower(trim(auth.jwt() ->> 'email'))
        )
      )
  );
$$;

alter table if exists public.staff_time_entries enable row level security;
alter table if exists public.staff_time_breaks enable row level security;

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
  or (
    staff_time_entries.auth_user_id = auth.uid()
    and (
      exists (
        select 1
        from public.profiles p
        where p.auth_user_id = auth.uid()
          and coalesce(p.is_active, true) = true
          and p.role::text <> 'customer'
      )
      or public.is_authenticated_route_driver()
    )
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
      and p.role::text <> 'customer'
  )
  or (
    staff_time_entries.auth_user_id = auth.uid()
    and (
      staff_time_entries.profile_id is null
      or exists (
        select 1
        from public.profiles p
        where p.id = staff_time_entries.profile_id
          and p.auth_user_id = auth.uid()
          and coalesce(p.is_active, true) = true
      )
    )
    and (
      exists (
        select 1
        from public.profiles p
        where p.auth_user_id = auth.uid()
          and coalesce(p.is_active, true) = true
          and p.role::text <> 'customer'
      )
      or public.is_authenticated_route_driver()
    )
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
  or (
    staff_time_entries.auth_user_id = auth.uid()
    and (
      exists (
        select 1
        from public.profiles p
        where p.auth_user_id = auth.uid()
          and coalesce(p.is_active, true) = true
          and p.role::text <> 'customer'
      )
      or public.is_authenticated_route_driver()
    )
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
  or (
    staff_time_entries.auth_user_id = auth.uid()
    and (
      staff_time_entries.profile_id is null
      or exists (
        select 1
        from public.profiles p
        where p.id = staff_time_entries.profile_id
          and p.auth_user_id = auth.uid()
          and coalesce(p.is_active, true) = true
      )
    )
    and (
      exists (
        select 1
        from public.profiles p
        where p.auth_user_id = auth.uid()
          and coalesce(p.is_active, true) = true
          and p.role::text <> 'customer'
      )
      or public.is_authenticated_route_driver()
    )
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
    left join public.profiles p on p.id = e.profile_id
    where e.id = staff_time_breaks.time_entry_id
      and (
        (
          p.auth_user_id = auth.uid()
          and coalesce(p.is_active, true) = true
        )
        or (
          e.auth_user_id = auth.uid()
          and (
            exists (
              select 1
              from public.profiles sp
              where sp.auth_user_id = auth.uid()
                and coalesce(sp.is_active, true) = true
                and sp.role::text <> 'customer'
            )
            or public.is_authenticated_route_driver()
          )
        )
      )
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
    left join public.profiles p on p.id = e.profile_id
    where e.id = staff_time_breaks.time_entry_id
      and e.clock_out_at is null
      and (
        (
          p.auth_user_id = auth.uid()
          and coalesce(p.is_active, true) = true
        )
        or (
          e.auth_user_id = auth.uid()
          and (
            exists (
              select 1
              from public.profiles sp
              where sp.auth_user_id = auth.uid()
                and coalesce(sp.is_active, true) = true
                and sp.role::text <> 'customer'
            )
            or public.is_authenticated_route_driver()
          )
        )
      )
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
    left join public.profiles p on p.id = e.profile_id
    where e.id = staff_time_breaks.time_entry_id
      and (
        (
          p.auth_user_id = auth.uid()
          and coalesce(p.is_active, true) = true
        )
        or (
          e.auth_user_id = auth.uid()
          and (
            exists (
              select 1
              from public.profiles sp
              where sp.auth_user_id = auth.uid()
                and coalesce(sp.is_active, true) = true
                and sp.role::text <> 'customer'
            )
            or public.is_authenticated_route_driver()
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.staff_time_entries e
    left join public.profiles p on p.id = e.profile_id
    where e.id = staff_time_breaks.time_entry_id
      and (
        (
          p.auth_user_id = auth.uid()
          and coalesce(p.is_active, true) = true
        )
        or (
          e.auth_user_id = auth.uid()
          and (
            exists (
              select 1
              from public.profiles sp
              where sp.auth_user_id = auth.uid()
                and coalesce(sp.is_active, true) = true
                and sp.role::text <> 'customer'
            )
            or public.is_authenticated_route_driver()
          )
        )
      )
  )
);

notify pgrst, 'reload schema';

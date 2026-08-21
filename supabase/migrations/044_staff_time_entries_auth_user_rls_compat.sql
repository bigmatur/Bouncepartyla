-- 044_staff_time_entries_auth_user_rls_compat.sql
--
-- Keep time clock usable for driver accounts that are linked via route_drivers
-- but do not yet have a profiles row mapped to auth.uid().
--
-- This migration preserves profile-based policies and adds legacy-compatible
-- auth_user_id ownership checks for staff_time_entries/staff_time_breaks.

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
      or exists (
        select 1
        from public.route_drivers rd
        where rd.auth_user_id = auth.uid()
          and coalesce(rd.active, true) = true
          and rd.deleted_at is null
      )
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
      or exists (
        select 1
        from public.route_drivers rd
        where rd.auth_user_id = auth.uid()
          and coalesce(rd.active, true) = true
          and rd.deleted_at is null
      )
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
      or exists (
        select 1
        from public.route_drivers rd
        where rd.auth_user_id = auth.uid()
          and coalesce(rd.active, true) = true
          and rd.deleted_at is null
      )
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
      or exists (
        select 1
        from public.route_drivers rd
        where rd.auth_user_id = auth.uid()
          and coalesce(rd.active, true) = true
          and rd.deleted_at is null
      )
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
            or exists (
              select 1
              from public.route_drivers rd
              where rd.auth_user_id = auth.uid()
                and coalesce(rd.active, true) = true
                and rd.deleted_at is null
            )
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
            or exists (
              select 1
              from public.route_drivers rd
              where rd.auth_user_id = auth.uid()
                and coalesce(rd.active, true) = true
                and rd.deleted_at is null
            )
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
            or exists (
              select 1
              from public.route_drivers rd
              where rd.auth_user_id = auth.uid()
                and coalesce(rd.active, true) = true
                and rd.deleted_at is null
            )
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
            or exists (
              select 1
              from public.route_drivers rd
              where rd.auth_user_id = auth.uid()
                and coalesce(rd.active, true) = true
                and rd.deleted_at is null
            )
          )
        )
      )
  )
);

notify pgrst, 'reload schema';

-- 027_booking_completion_sessions_rls_fix.sql
--
-- Fixes:
--   new row violates row-level security policy
--   for table "booking_completion_sessions"
--
-- The booking completion session is created only from authenticated
-- staff/admin server actions. Public reading is still not allowed;
-- customer access continues through the SECURITY DEFINER RPC functions.

alter table public.booking_completion_sessions enable row level security;

drop policy if exists "Authenticated staff can insert completion sessions"
  on public.booking_completion_sessions;

drop policy if exists "Authenticated staff can update completion sessions"
  on public.booking_completion_sessions;

drop policy if exists "Authenticated staff can delete completion sessions"
  on public.booking_completion_sessions;

create policy "Authenticated staff can insert completion sessions"
on public.booking_completion_sessions
for insert
to authenticated
with check (
  auth.uid() is not null
  and (
    created_by_auth_user_id is null
    or created_by_auth_user_id = auth.uid()
  )
);

create policy "Authenticated staff can update completion sessions"
on public.booking_completion_sessions
for update
to authenticated
using (
  auth.uid() is not null
  and (
    created_by_auth_user_id is null
    or created_by_auth_user_id = auth.uid()
  )
)
with check (
  auth.uid() is not null
  and (
    created_by_auth_user_id is null
    or created_by_auth_user_id = auth.uid()
  )
);

create policy "Authenticated staff can delete completion sessions"
on public.booking_completion_sessions
for delete
to authenticated
using (
  auth.uid() is not null
  and (
    created_by_auth_user_id is null
    or created_by_auth_user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';

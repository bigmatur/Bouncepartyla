-- 043_staff_time_entries_legacy_compat.sql
--
-- Existing installations may still have auth_user_id as NOT NULL from the
-- first Time Clock migration. profile_id is now the canonical relation, but
-- auth_user_id is retained and backfilled for compatibility.

alter table public.staff_time_entries
  add column if not exists auth_user_id uuid null references auth.users(id) on delete cascade;

update public.staff_time_entries e
set auth_user_id = p.auth_user_id
from public.profiles p
where e.profile_id = p.id
  and e.auth_user_id is null;

alter table public.staff_time_entries
  alter column auth_user_id drop not null;

notify pgrst, 'reload schema';

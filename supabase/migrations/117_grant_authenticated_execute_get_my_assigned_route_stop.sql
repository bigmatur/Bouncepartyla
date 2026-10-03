-- 117_grant_authenticated_execute_get_my_assigned_route_stop.sql
-- Purpose: allow authenticated JWT sessions (used by mobile driver endpoints)
-- to execute the existing authoritative ownership RPC.
--
-- This migration intentionally does NOT alter function logic, RLS, or table grants.
-- It only normalizes EXECUTE permissions for the existing uuid signature.

begin;

revoke all on function public.get_my_assigned_route_stop(uuid) from public;
revoke all on function public.get_my_assigned_route_stop(uuid) from anon;
grant execute on function public.get_my_assigned_route_stop(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

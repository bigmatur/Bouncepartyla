-- Migration 087 restricted booking_discount_security_settings SELECT to
-- current_user_is_security_admin() only. That silently hid the row (no error,
-- RLS just returns 0 rows) from every non-super_admin staff session, so the
-- discount-password check always fell back to "disabled" and the password
-- requirement was bypassed for anyone except a super_admin. Add a narrowly
-- scoped SECURITY DEFINER reader so any staff session can evaluate whether a
-- discount password is required, without loosening the underlying table RLS
-- (which still fully protects direct client reads of the password hash).

create or replace function public.get_discount_security_settings()
returns table (
  discount_password_enabled boolean,
  discount_password_hash text,
  discount_password_hint text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_staff() then
    return;
  end if;

  return query
    select s.discount_password_enabled, s.discount_password_hash, s.discount_password_hint
    from public.booking_discount_security_settings s
    limit 1;
end;
$$;

revoke all on function public.get_discount_security_settings() from public, anon;
grant execute on function public.get_discount_security_settings() to authenticated;

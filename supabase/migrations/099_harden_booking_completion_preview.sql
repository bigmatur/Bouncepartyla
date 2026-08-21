-- 099_harden_booking_completion_preview.sql
--
-- Keep the anonymous completion-link preview functional, but do not expose
-- customer name or event date before authentication.
--
-- The return signature intentionally remains unchanged so existing frontend
-- code and PostgREST schema do not break.

create or replace function public.get_booking_completion_session(raw_token text)
returns table(
  status text,
  expires_at timestamptz,
  customer_email text,
  event_date date,
  customer_name text
)
language sql
security definer
set search_path = public, extensions
as $function$
  select
    case
      when s.revoked_at is not null then 'revoked'
      when s.completed_at is not null then 'completed'
      when s.expires_at <= now() then 'expired'
      else 'active'
    end,
    s.expires_at,

    -- Required only to pre-fill the login screen.
    s.customer_email,

    -- Do not disclose booking/customer details before authentication.
    null::date as event_date,
    null::text as customer_name

  from public.booking_completion_sessions s
  where s.token  where s.token  where s.token  where s.token  where s.token  where s.toke,   where s.token  where s.token  where s.token  whe  limit 1;
$function$;

revoke all
on function public.get_booking_completion_session(text)
from public;

grant execute
on function public.get_booking_completion_session(text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';

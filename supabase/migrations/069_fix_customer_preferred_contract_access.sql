-- =========================================================
-- 069 Fix customer preferred contract ownership check
--
-- profiles.id is the internal profile UUID.
-- auth.uid() must be matched against profiles.auth_user_id.
-- =========================================================

create or replace function public.get_my_booking_preferred_contract(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_email text;
  v_has_access boolean := false;
  v_contract jsonb := null;
begin
  v_user_id := auth.uid();

  if v_user_id is null or p_booking_id is null then
    return null;
  end if;

  v_email := lower(
    coalesce(
      auth.jwt() ->> 'email',
      ''
    )
  );

  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and (
        exists (
          select 1
          from public.profiles p
          where p.auth_user_id = v_user_id
            and p.customer_id = b.customer_id
            and p.is_active = true
        )

        or (
          v_email <> ''
          and exists (
            select 1
            from public.contracts c
            where c.booking_id = b.id
              and lower(
                coalesce(
                  c.signer_email,
                  ''
                )
              ) = v_email
          )
        )

        or (
          v_email <> ''
          and exists (
            select 1
            from public.booking_completion_sessions s
            where s.booking_id = b.id
              and lower(
                coalesce(
                  s.customer_email,
                  ''
                )
              ) = v_email
              and s.revoked_at is null
          )
        )
      )
  )
  into v_has_access;

  if not v_has_access then
    return null;
  end if;

  select to_jsonb(c)
  into v_contract
  from public.contracts c
  where c.booking_id = p_booking_id
  order by
    case
      when lower(coalesce(c.status::text, '')) = 'signed'
        and c.signed_at is not null
        and coalesce(
          c.signature_metadata ->> 'signatureImageDataUrl',
          ''
        ) <> ''
        then 0

      when lower(coalesce(c.status::text, '')) = 'signed'
        and c.signed_at is not null
        then 1

      when lower(coalesce(c.status::text, '')) = 'signed'
        then 2

      when c.signed_at is not null
        then 3

      when lower(coalesce(c.status::text, '')) = 'viewed'
        then 4

      when lower(coalesce(c.status::text, '')) = 'sent'
        then 5

      else 9
    end,
    coalesce(
      c.signed_at,
      c.created_at
    ) desc
  limit 1;

  return v_contract;
end;
$$;

revoke all
on function public.get_my_booking_preferred_contract(uuid)
from public, anon;

grant execute
on function public.get_my_booking_preferred_contract(uuid)
to authenticated;
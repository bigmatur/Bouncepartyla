create or replace function public.get_my_booking_authoritative_state(
  p_booking_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $function$
declare
  v_user_id uuid;
  v_email text;
  v_customer_id uuid;
  v_has_access boolean := false;
  v_result jsonb;
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

  select p.customer_id
  into v_customer_id
  from public.profiles p
  where p.auth_user_id = v_user_id
    and p.is_active = true
    and p.customer_id is not null
  limit 1;

  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and (
        (
          v_customer_id is not null
          and b.customer_id = v_customer_id
        )

        or exists (
          select 1
          from public.customers c
          where c.id = b.customer_id
            and c.auth_user_id = v_user_id
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

  select jsonb_build_object(
    'booking',
    to_jsonb(b),

    'payments',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(p)
          order by
            p.paid_at desc nulls last,
            p.created_at desc
        )
        from public.payments p
        where p.booking_id = b.id
      ),
      '[]'::jsonb
    ),

    'contract',
    (
      select to_jsonb(c)
      from public.contracts c
      where c.booking_id = b.id
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
      limit 1
    )
  )
  into v_result
  from public.bookings b
  where b.id = p_booking_id
  limit 1;

  return v_result;
end;
$function$;

revoke all
on function public.get_my_booking_authoritative_state(uuid)
from public;

revoke all
on function public.get_my_booking_authoritative_state(uuid)
from anon;

grant execute
on function public.get_my_booking_authoritative_state(uuid)
to authenticated;
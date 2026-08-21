-- ============================================================
-- 085 — Inventory Reservation Integrity v1
-- SAFE cleanup for abandoned CUSTOMER self-service Stripe holds.
--
-- IMPORTANT:
-- Admin bookings are NEVER eligible because cleanup requires:
-- booking_source = 'customer_self_service'
--
-- Stripe checkout expires after 30 minutes in application code.
-- We add a 10-minute safety grace and clean after 40 minutes.
-- ============================================================

create or replace function public.preview_expired_customer_checkout_holds()
returns table (
  booking_id uuid,
  booking_number text,
  booking_source text,
  booking_status text,
  payment_status_text text,
  amount_paid numeric,
  created_at timestamptz,
  age_minutes numeric,
  reservation_count bigint
)
language sql
security definer
set search_path = public
as $function$
  select
    b.id as booking_id,
    b.booking_number,
    b.booking_source,
    b.status::text as booking_status,
    b.payment_status::text as payment_status_text,
    coalesce(b.amount_paid, 0) as amount_paid,
    b.created_at,
    round(
      extract(epoch from (now() - b.created_at)) / 60.0,
      1
    ) as age_minutes,
    count(r.id) as reservation_count
  from public.bookings b
  left join public.inventory_reservations r
    on r.booking_id = b.id
  where lower(coalesce(b.booking_source, '')) = 'customer_self_service'
    and lower(coalesce(b.status::text, '')) = 'pending_deposit'
    and coalesce(b.amount_paid, 0) <= 0
    and lower(coalesce(b.payment_status::text, '')) in ('', 'unpaid')
    and b.created_at <= now() - interval '40 minutes'
  group by
    b.id,
    b.booking_number,
    b.booking_source,
    b.status,
    b.payment_status,
    b.amount_paid,
    b.created_at
  order by b.created_at asc;
$function$;


create or replace function public.cleanup_expired_customer_checkout_holds(
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  candidate record;
  cleanup_result jsonb;
  examined_count integer := 0;
  removed_count integer := 0;
  skipped_count integer := 0;
  error_count integer := 0;
  results jsonb := '[]'::jsonb;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  for candidate in
    select
      b.id,
      b.booking_number,
      b.created_at
    from public.bookings b
    where lower(coalesce(b.booking_source, '')) = 'customer_self_service'
      and lower(coalesce(b.status::text, '')) = 'pending_deposit'
      and coalesce(b.amount_paid, 0) <= 0
      and lower(coalesce(b.payment_status::text, '')) in ('', 'unpaid')
      and b.created_at <= now() - interval '40 minutes'
    order by b.created_at asc
    limit safe_limit
  loop
    examined_count := examined_count + 1;

    begin
      -- Reuse the existing protected lifecycle function.
      -- It performs its own payment/status checks and deletes the booking
      -- only when it is safe to do so. inventory_reservations cascade away.
      cleanup_result :=
        public.expire_unpaid_customer_stripe_booking(candidate.id);

      if coalesce((cleanup_result ->> 'success')::boolean, false)
         and cleanup_result ->> 'status' = 'expired_removed' then
        removed_count := removed_count + 1;
      else
        skipped_count := skipped_count + 1;
      end if;

      results :=
        results ||
        jsonb_build_array(
          jsonb_build_object(
            'booking_id', candidate.id,
            'booking_number', candidate.booking_number,
            'result', cleanup_result
          )
        );
    exception
      when others then
        error_count := error_count + 1;

        results :=
          results ||
          jsonb_build_array(
            jsonb_build_object(
              'booking_id', candidate.id,
              'booking_number', candidate.booking_number,
              'result', jsonb_build_object(
                'success', false,
                'status', 'cleanup_error',
                'message', sqlerrm
              )
            )
          );
    end;
  end loop;

  return jsonb_build_object(
    'success', error_count = 0,
    'examined', examined_count,
    'removed', removed_count,
    'skipped', skipped_count,
    'errors', error_count,
    'results', results
  );
end;
$function$;


-- ------------------------------------------------------------
-- OPTIONAL verification queries after installing:
-- ------------------------------------------------------------

-- Preview only. Changes nothing:
-- select * from public.preview_expired_customer_checkout_holds();

-- Manual safe cleanup:
-- select public.cleanup_expired_customer_checkout_holds(25);

-- Confirm that admin bookings can NEVER enter preview:
-- select *
-- from public.preview_expired_customer_checkout_holds()
-- where lower(coalesce(booking_source, '')) = 'admin';
-- Expected: 0 rows.

-- 097_harden_customer_checkout_finalize.sql
--
-- Customer-facing finalize RPC must NEVER create a paid payment.
--
-- Real payments are recorded only by trusted server/service-role flows
-- (Stripe webhook, admin POS, etc.).
--
-- This function remains executable by authenticated customers because
-- the customer self-booking flow uses it when no payment is currently due.

create or replace function public.complete_customer_booking_checkout(
  p_booking_id uuid,
  p_amount numeric,
  p_method text,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_paid numeric := 0;
  v_required numeric := 0;
  v_contract_signed boolean := false;
  v_items_summary text := '';
  v_customer_name text := '';
  v_customer_phone text := '';
  v_now timestamptz := now();
begin
  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'status', 'authentication_required'
    );
  end if;

  if p_booking_id is null then
    return jsonb_build_object(
      'success', false,
      'status', 'booking_not_found'
    );
  end if;

  /*
   * SECURITY:
   * This customer RPC is finalize-only.
   *
   * It must never accept or record money.
   * Any real payment must already exist in public.payments
   * through a trusted server-side flow.
   */
  if round(greatest(coalesce(p_amount, 0), 0), 2) <> 0 then
    return jsonb_build_object(
      'success', false,
      'status', 'payment_must_be_recorded_server_side'
    );
  end if;

  /*
   * Customer may finalize only their own booking.
   */
  select b.*
  into v_booking
  from public.bookings b
  join public.customers c
    on c.id = b.customer_id
  where b.id = p_booking_id
    and c.auth_user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'status', 'booking_not_found'
    );
  end if;

  /*
   * Contract must already be signed.
   */
  select exists (
    select 1
    from public.contracts c
    where c.booking_id = p_booking_id
      and lower(coalesce(c.status::text, '')) = 'signed'
  )
  into v_contract_signed;

  if not v_contract_signed
     and coalesce(v_booking.contract_status, 'not_sent') <> 'signed' then
    return jsonb_build_object(
      'success', false,
      'status', 'contract_required'
    );
  end if;

  /*
   * Only real persisted paid payments count.
   *
   * Customer cannot create one from this RPC.
   */
  select coalesce(
    sum(
      greatest(
        coalesce(p.amount, 0) -
        coalesce(p.tip_amount, 0),
        0
      )
    ),
    0
  )
  into v_paid
  from public.payments p
  where p.booking_id = p_booking_id
    and lower(coalesce(p.status, '')) in (
      'paid',
      'completed',
      'succeeded'
    );

  v_required :=
    greatest(
      coalesce(v_booking.deposit_amount, 0) -
      v_paid,
      0
    );

  if v_required > 0 then
    /*
     * Keep booking totals synchronized, but DO NOT
     * fabricate a payment.
     */
    update public.bookings
    set
      amount_paid = v_paid,
      balance_due =
        greatest(
          coalesce(total_amount, 0) -
          v_paid,
          0
        ),
      payment_status = (
        case
          when v_paid >= coalesce(total_amount, 0)
            then 'paid'
          when v_paid > 0
            then 'partial'
          else 'unpaid'
        end
      )::payment_status,
      updated_at = v_now
    where id = p_booking_id;

    return jsonb_build_object(
      'success', false,
      'status', 'deposit_required',
      'contract_signed', true,
      'deposit_paid', false,
      'amount_paid', v_paid,
      'deposit_amount',
        coalesce(v_booking.deposit_amount, 0),
      'required_now', v_required
    );
  end if;

  /*
   * Deposit is either zero or was already recorded
   * by a trusted payment flow.
   */
  update public.bookings
  set
    status = 'booked',
    contract_status = 'signed',
    amount_paid = v_paid,
    balance_due =
      greatest(
        coalesce(total_amount, 0) -
        v_paid,
        0
      ),
    payment_status = (
      case
        when v_paid >= coalesce(total_amount, 0)
          then 'paid'
        when v_paid > 0
          then 'partial'
        else 'unpaid'
      end
    )::payment_status,
    updated_at = v_now
  where id = p_booking_id;

  select
    coalesce(c.full_name, ''),
    coalesce(c.phone, '')
  into
    v_customer_name,
    v_customer_phone
  from public.customers c
  where c.id = v_booking.customer_id;

  select coalesce(
    string_agg(
      coalesce(p.name, 'Product') ||
      ' x ' ||
      greatest(
        coalesce(bi.quantity, 1),
        1
      )::text,
      E'\n'
      order by bi.created_at
    ),
    ''
  )
  into v_items_summary
  from public.booking_items bi
  left join public.products p
    on p.id = bi.product_id
  where bi.booking_id = p_booking_id;

  /*
   * Delivery route stop.
   */
  if not exists (
    select 1
    from public.route_stops rs
    where rs.booking_id = p_booking_id
      and rs.stop_type = 'delivery'
      and coalesce(
        rs.status::text,
        ''
      ) not in (
        'cancelled',
        'failed'
      )
  ) then
    insert into public.route_stops (
      booking_id,
      stop_date,
      stop_type,
      status,
      customer_name,
      customer_phone,
      address,
      city,
      state,
      zip,
      scheduled_start_time,
      scheduled_end_time,
      driver_name,
      truck_name,
      items_summary,
      setup_notes,
      balance_due,
      sort_order,
      updated_at
    )
    values (
      p_booking_id,
      coalesce(
        v_booking.delivery_date,
        v_booking.event_date
      ),
      'delivery',
      'scheduled',
      nullif(v_customer_name, ''),
      nullif(v_customer_phone, ''),
      v_booking.setup_address,
      v_booking.setup_city,
      coalesce(
        v_booking.setup_state,
        'CA'
      ),
      v_booking.setup_zip,
      coalesce(
        v_booking.delivery_window_start::time,
        v_booking.event_start_time
      ),
      coalesce(
        v_booking.delivery_window_end::time,
        v_booking.event_start_time
      ),
      null,
      null,
      nullif(
        v_items_summary,
        ''
      ),
      case
        when v_booking.event_start_time is not null
          then
            'Event starts at ' ||
            v_booking.event_start_time::text ||
            '. Setup should be completed before start time.'
        else null
      end,
      greatest(
        coalesce(v_booking.total_amount, 0) -
        v_paid,
        0
      ),
      100,
      v_now
    );
  end if;

  /*
   * Pickup route stop.
   */
  if not exists (
    select 1
    from public.route_stops rs
    where rs.booking_id = p_booking_id
      and rs.stop_type = 'pickup'
      and coalesce(
        rs.status::text,
        ''
      ) not in (
        'cancelled',
        'failed'
      )
  ) then
    insert into public.route_stops (
      booking_id,
      stop_date,
      stop_type,
      status,
      customer_name,
      customer_phone,
      address,
      city,
      state,
      zip,
      scheduled_start_time,
      scheduled_end_time,
      driver_name,
      truck_name,
      items_summary,
      pickup_notes,
      balance_due,
      sort_order,
      updated_at
    )
    values (
      p_booking_id,
      coalesce(
        v_booking.pickup_date,
        v_booking.event_date
      ),
      'pickup',
      'scheduled',
      nullif(v_customer_name, ''),
      nullif(v_customer_phone, ''),
      v_booking.setup_address,
      v_booking.setup_city,
      coalesce(
        v_booking.setup_state,
        'CA'
      ),
      v_booking.setup_zip,
      coalesce(
        v_booking.pickup_window_start::time,
        v_booking.event_end_time
      ),
      coalesce(
        v_booking.pickup_window_end::time,
        v_booking.event_end_time
      ),
      null,
      null,
      nullif(
        v_items_summary,
        ''
      ),
      case
        when v_booking.event_end_time is not null
          then
            'Event ends at ' ||
            v_booking.event_end_time::text ||
            '. Pickup can be scheduled after event end.'
        else null
      end,
      0,
      200,
      v_now
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'status', 'confirmed',
    'booking_id', p_booking_id,
    'amount_paid', v_paid,
    'balance_due',
      greatest(
        coalesce(v_booking.total_amount, 0) -
        v_paid,
        0
      )
  );
end;
$function$;


/*
 * Remove implicit PUBLIC access first.
 */
revoke all
on function public.complete_customer_booking_checkout(
  uuid,
  numeric,
  text,
  text
)
from public;

revoke all
on function public.complete_customer_booking_checkout(
  uuid,
  numeric,
  text,
  text
)
from anon;

/*
 * Authenticated customer needs this RPC only for safe
 * finalize behavior.
 */
grant execute
on function public.complete_customer_booking_checkout(
  uuid,
  numeric,
  text,
  text
)
to authenticated;

grant execute
on function public.complete_customer_booking_checkout(
  uuid,
  numeric,
  text,
  text
)
to service_role;

notify pgrst, 'reload schema';
-- =========================================================
-- 067 Repair customer Stripe booking finalization
--
-- Core invariant:
-- A Stripe-paid customer self-service booking must not remain pending_deposit.
-- Booking/payment finalization is committed independently from Route Board sync.
-- =========================================================

create or replace function public.finalize_booking_after_external_payment(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
  v_paid numeric := 0;
  v_contract_signed boolean := false;
  v_now timestamptz := now();
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select coalesce(sum(greatest(coalesce(p.amount, 0) - coalesce(p.tip_amount, 0), 0)), 0)
  into v_paid
  from public.payments p
  where p.booking_id = p_booking_id
    and lower(coalesce(p.status::text, '')) in ('paid', 'completed', 'succeeded');

  select (
    exists(
      select 1
      from public.contracts c
      where c.booking_id = p_booking_id
        and lower(coalesce(c.status::text, '')) = 'signed'
    )
    or lower(coalesce(v_booking.contract_status::text, '')) = 'signed'
  ) into v_contract_signed;

  -- Always refresh authoritative payment totals. Tips do not reduce booking balance.
  update public.bookings
  set
    amount_paid = v_paid,
    balance_due = greatest(coalesce(total_amount, 0) - v_paid, 0),
    payment_status = (
      case
        when v_paid >= coalesce(total_amount, 0) and coalesce(total_amount, 0) > 0 then 'paid'
        when v_paid > 0 then 'partial'
        else 'unpaid'
      end
    )::payment_status,
    updated_at = v_now
  where id = p_booking_id;

  if not v_contract_signed then
    return jsonb_build_object(
      'success', true,
      'status', 'contract_required',
      'booking_id', p_booking_id,
      'amount_paid', v_paid,
      'balance_due', greatest(coalesce(v_booking.total_amount, 0) - v_paid, 0)
    );
  end if;

  if v_paid < coalesce(v_booking.deposit_amount, 0) then
    return jsonb_build_object(
      'success', true,
      'status', 'deposit_required',
      'booking_id', p_booking_id,
      'amount_paid', v_paid,
      'deposit_amount', coalesce(v_booking.deposit_amount, 0),
      'balance_due', greatest(coalesce(v_booking.total_amount, 0) - v_paid, 0)
    );
  end if;

  -- Critical: this is the ONLY mandatory finalization step. No Route Board writes here.
  update public.bookings
  set
    status = case
      when status::text in ('draft', 'temporary', 'pending_deposit') then 'booked'::booking_status
      else status
    end,
    contract_status = 'signed',
    amount_paid = v_paid,
    balance_due = greatest(coalesce(total_amount, 0) - v_paid, 0),
    payment_status = (
      case
        when v_paid >= coalesce(total_amount, 0) and coalesce(total_amount, 0) > 0 then 'paid'
        else 'partial'
      end
    )::payment_status,
    updated_at = v_now
  where id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'status', 'confirmed',
    'booking_id', p_booking_id,
    'amount_paid', v_paid,
    'balance_due', greatest(coalesce(v_booking.total_amount, 0) - v_paid, 0)
  );
end;
$$;

revoke all on function public.finalize_booking_after_external_payment(uuid) from public, anon, authenticated;
grant execute on function public.finalize_booking_after_external_payment(uuid) to service_role;

-- Derived operational sync. It is deliberately separate from booking finalization.
-- Any route-stop schema/data problem is returned as JSON and cannot roll back a paid booking.
create or replace function public.sync_booking_route_stops_after_external_payment(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
  v_customer_name text := '';
  v_customer_phone text := '';
  v_items_summary text := '';
  v_now timestamptz := now();
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if v_booking.status::text not in ('booked', 'confirmed') then
    return jsonb_build_object('success', false, 'status', 'booking_not_finalized');
  end if;

  select coalesce(c.full_name, ''), coalesce(c.phone, '')
  into v_customer_name, v_customer_phone
  from public.customers c
  where c.id = v_booking.customer_id;

  select coalesce(string_agg(
    coalesce(p.name, 'Product') || ' x ' || greatest(coalesce(bi.quantity, 1), 1)::text,
    E'\n'
    order by bi.created_at
  ), '')
  into v_items_summary
  from public.booking_items bi
  left join public.products p on p.id = bi.product_id
  where bi.booking_id = p_booking_id;

  begin
    if not exists (
      select 1 from public.route_stops rs
      where rs.booking_id = p_booking_id
        and rs.stop_type::text = 'delivery'
        and coalesce(rs.status::text, '') not in ('cancelled', 'failed')
    ) then
      insert into public.route_stops (
        booking_id, stop_date, stop_type, status,
        customer_name, customer_phone,
        address, city, state, zip,
        scheduled_start_time, scheduled_end_time,
        driver_name, truck_name,
        items_summary, setup_notes,
        balance_due, sort_order, updated_at
      ) values (
        p_booking_id,
        coalesce(v_booking.delivery_date, v_booking.event_date),
        'delivery', 'scheduled',
        nullif(v_customer_name, ''), nullif(v_customer_phone, ''),
        v_booking.setup_address, v_booking.setup_city,
        coalesce(v_booking.setup_state, 'CA'), v_booking.setup_zip,
        coalesce(v_booking.delivery_window_start::time, v_booking.event_start_time),
        coalesce(v_booking.delivery_window_end::time, v_booking.event_start_time),
        null, null,
        nullif(v_items_summary, ''),
        case when v_booking.event_start_time is not null
          then 'Event starts at ' || v_booking.event_start_time::text || '. Setup should be completed before start time.'
          else null end,
        greatest(coalesce(v_booking.balance_due, 0), 0),
        100, v_now
      );
    end if;

    if not exists (
      select 1 from public.route_stops rs
      where rs.booking_id = p_booking_id
        and rs.stop_type::text = 'pickup'
        and coalesce(rs.status::text, '') not in ('cancelled', 'failed')
    ) then
      insert into public.route_stops (
        booking_id, stop_date, stop_type, status,
        customer_name, customer_phone,
        address, city, state, zip,
        scheduled_start_time, scheduled_end_time,
        driver_name, truck_name,
        items_summary, pickup_notes,
        balance_due, sort_order, updated_at
      ) values (
        p_booking_id,
        coalesce(v_booking.pickup_date, v_booking.event_date),
        'pickup', 'scheduled',
        nullif(v_customer_name, ''), nullif(v_customer_phone, ''),
        v_booking.setup_address, v_booking.setup_city,
        coalesce(v_booking.setup_state, 'CA'), v_booking.setup_zip,
        coalesce(v_booking.pickup_window_start::time, v_booking.event_end_time),
        coalesce(v_booking.pickup_window_end::time, v_booking.event_end_time),
        null, null,
        nullif(v_items_summary, ''),
        case when v_booking.event_end_time is not null
          then 'Event ends at ' || v_booking.event_end_time::text || '. Pickup can be scheduled after event end.'
          else null end,
        0, 200, v_now
      );
    end if;

    return jsonb_build_object('success', true, 'status', 'synced', 'booking_id', p_booking_id);
  exception when others then
    return jsonb_build_object(
      'success', false,
      'status', 'route_sync_failed',
      'booking_id', p_booking_id,
      'error', sqlerrm
    );
  end;
end;
$$;

revoke all on function public.sync_booking_route_stops_after_external_payment(uuid) from public, anon, authenticated;
grant execute on function public.sync_booking_route_stops_after_external_payment(uuid) to service_role;

-- Recover only self-service bookings that have a real successful payment and a signed contract.
do $$
declare
  r record;
  v_finalize jsonb;
  v_route jsonb;
begin
  for r in
    select b.id
    from public.bookings b
    where b.status::text = 'pending_deposit'
      and coalesce(b.booking_source, '') = 'customer_self_service'
      and exists (
        select 1
        from public.payments p
        where p.booking_id = b.id
          and lower(coalesce(p.status::text, '')) in ('paid', 'completed', 'succeeded')
          and greatest(coalesce(p.amount, 0) - coalesce(p.tip_amount, 0), 0) > 0
      )
      and (
        lower(coalesce(b.contract_status::text, '')) = 'signed'
        or exists (
          select 1
          from public.contracts c
          where c.booking_id = b.id
            and lower(coalesce(c.status::text, '')) = 'signed'
        )
      )
  loop
    v_finalize := public.finalize_booking_after_external_payment(r.id);
    if coalesce(v_finalize ->> 'status', '') = 'confirmed' then
      v_route := public.sync_booking_route_stops_after_external_payment(r.id);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

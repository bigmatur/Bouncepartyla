-- =========================================================
-- 063 Customer Stripe atomic booking completion
--
-- Goals:
-- 1) customer card checkout is provisional until Stripe confirms payment;
-- 2) paid totals never include tips toward booking balance;
-- 3) pending Stripe bookings are deleted when checkout is cancelled/expired;
-- 4) ensure the real customer contract RPC exists so a signed contract has
--    an actual contracts row/document instead of only bookings.contract_status.
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
  v_customer_name text := '';
  v_customer_phone text := '';
  v_items_summary text := '';
  v_now timestamptz := now();
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  -- Tips are money collected but are not invoice payment toward the booking.
  select coalesce(sum(greatest(coalesce(p.amount, 0) - coalesce(p.tip_amount, 0), 0)), 0)
  into v_paid
  from public.payments p
  where p.booking_id = p_booking_id
    and lower(coalesce(p.status, '')) in ('paid', 'completed', 'succeeded');

  update public.bookings
  set
    amount_paid = v_paid,
    balance_due = greatest(coalesce(total_amount, 0) - v_paid, 0),
    payment_status = (
      case
        when v_paid >= coalesce(total_amount, 0) then 'paid'
        when v_paid > 0 then 'partial'
        else 'unpaid'
      end
    )::payment_status,
    updated_at = v_now
  where id = p_booking_id;

  select exists(
    select 1
    from public.contracts c
    where c.booking_id = p_booking_id
      and c.status = 'signed'
  ) or coalesce(v_booking.contract_status, 'not_sent') = 'signed'
  into v_contract_signed;

  if not v_contract_signed or v_paid < coalesce(v_booking.deposit_amount, 0) then
    return jsonb_build_object(
      'success', true,
      'status', case when not v_contract_signed then 'contract_required' else 'deposit_required' end,
      'booking_id', p_booking_id,
      'amount_paid', v_paid,
      'balance_due', greatest(coalesce(v_booking.total_amount, 0) - v_paid, 0)
    );
  end if;

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
        when v_paid >= coalesce(total_amount, 0) then 'paid'
        else 'partial'
      end
    )::payment_status,
    updated_at = v_now
  where id = p_booking_id;

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

  if not exists (
    select 1 from public.route_stops rs
    where rs.booking_id = p_booking_id
      and rs.stop_type = 'delivery'
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
      greatest(coalesce(v_booking.total_amount, 0) - v_paid, 0),
      100, v_now
    );
  end if;

  if not exists (
    select 1 from public.route_stops rs
    where rs.booking_id = p_booking_id
      and rs.stop_type = 'pickup'
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

-- Customer can cancel only their own unpaid provisional booking.
create or replace function public.cancel_my_unpaid_customer_stripe_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_has_paid boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'status', 'authentication_required');
  end if;

  select b.status::text
  into v_status
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.id = p_booking_id
    and c.auth_user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select exists(
    select 1 from public.payments p
    where p.booking_id = p_booking_id
      and lower(coalesce(p.status, '')) in ('paid', 'completed', 'succeeded')
      and greatest(coalesce(p.amount, 0) - coalesce(p.tip_amount, 0), 0) > 0
  ) into v_has_paid;

  if v_has_paid then
    return jsonb_build_object('success', false, 'status', 'payment_already_recorded');
  end if;

  if v_status <> 'pending_deposit' then
    return jsonb_build_object('success', false, 'status', 'not_provisional');
  end if;

  delete from public.bookings where id = p_booking_id;
  return jsonb_build_object('success', true, 'status', 'cancelled');
end;
$$;

grant execute on function public.cancel_my_unpaid_customer_stripe_booking(uuid) to authenticated;

-- Stripe webhook/service-role cleanup after Checkout Session expiry.
create or replace function public.expire_unpaid_customer_stripe_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_status text;
  v_has_paid boolean := false;
begin
  select b.status::text
  into v_status
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', true, 'status', 'already_removed');
  end if;

  select exists(
    select 1 from public.payments p
    where p.booking_id = p_booking_id
      and lower(coalesce(p.status, '')) in ('paid', 'completed', 'succeeded')
      and greatest(coalesce(p.amount, 0) - coalesce(p.tip_amount, 0), 0) > 0
  ) into v_has_paid;

  if v_has_paid or v_status <> 'pending_deposit' then
    return jsonb_build_object('success', true, 'status', 'kept');
  end if;

  delete from public.bookings where id = p_booking_id;
  return jsonb_build_object('success', true, 'status', 'expired_removed');
end;
$$;

revoke all on function public.expire_unpaid_customer_stripe_booking(uuid) from public, anon, authenticated;
grant execute on function public.expire_unpaid_customer_stripe_booking(uuid) to service_role;

-- Re-apply the real customer signing RPC so signed status always corresponds
-- to a contracts row with rendered document and signature evidence.
create or replace function public.sign_customer_booking_contract(
  p_booking_id uuid,
  p_signer_name text,
  p_rendered_html text,
  p_document_hash text,
  p_signature_image_data_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_booking public.bookings%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'status', 'authentication_required');
  end if;

  if nullif(trim(coalesce(p_signer_name, '')), '') is null then
    return jsonb_build_object('success', false, 'status', 'signer_name_required');
  end if;

  if coalesce(p_signature_image_data_url, '') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
    return jsonb_build_object('success', false, 'status', 'drawn_signature_required');
  end if;

  select b.* into v_booking
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.id = p_booking_id
    and c.auth_user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  if exists (
    select 1 from public.contracts
    where booking_id = p_booking_id and status = 'signed'
  ) then
    update public.bookings
    set contract_status = 'signed', updated_at = v_now
    where id = p_booking_id;

    return jsonb_build_object('success', true, 'status', 'already_signed', 'booking_id', p_booking_id);
  end if;

  insert into public.contracts (
    booking_id, status, signer_name, signer_email, provider,
    sent_at, viewed_at, signed_at, signature_date,
    template_version, rendered_html, signature_text, signature_metadata
  ) values (
    p_booking_id, 'signed', trim(p_signer_name), nullif(v_email, ''), 'internal_esign',
    v_now, v_now, v_now, v_now::date,
    'customer-self-service-v1', p_rendered_html, trim(p_signer_name),
    jsonb_build_object(
      'accepted', true,
      'manualSignature', null,
      'signatureImageDataUrl', p_signature_image_data_url,
      'signatureMethod', 'drawn_manual',
      'consentText', 'I read and agree with the contract terms',
      'consentAcceptedAt', v_now,
      'documentHashSha256', p_document_hash,
      'signedDocumentFormat', 'rendered_html',
      'signingProvider', 'internal_esign',
      'evidenceVersion', 2
    )
  );

  update public.bookings
  set contract_status = 'signed', updated_at = v_now
  where id = p_booking_id;

  return jsonb_build_object('success', true, 'status', 'signed', 'booking_id', p_booking_id);
end;
$$;

grant execute on function public.sign_customer_booking_contract(uuid, text, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';

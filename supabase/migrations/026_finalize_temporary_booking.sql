create or replace function public.finalize_temporary_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_session public.booking_completion_sessions%rowtype;
  v_booking public.bookings%rowtype;
  v_paid numeric := 0;
  v_contract_signed boolean := false;
  v_items_summary text := '';
  v_customer_name text := '';
  v_customer_phone text := '';
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'status', 'authentication_required');
  end if;

  select * into v_session
  from public.booking_completion_sessions
  where booking_id = p_booking_id
    and revoked_at is null
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'status', 'session_not_found');
  end if;

  if lower(v_session.customer_email) <> v_email then
    return jsonb_build_object('success', false, 'status', 'email_mismatch');
  end if;

  if v_session.completed_at is not null then
    return jsonb_build_object('success', true, 'status', 'already_completed', 'booking_id', p_booking_id);
  end if;

  if v_session.expires_at <= v_now then
    return jsonb_build_object('success', false, 'status', 'expired');
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select exists(
    select 1
    from public.contracts c
    where c.booking_id = p_booking_id
      and c.status = 'signed'
  ) into v_contract_signed;

  select coalesce(sum(p.amount), 0)
  into v_paid
  from public.payments p
  where p.booking_id = p_booking_id
    and p.status = 'paid';

  if not v_contract_signed then
    return jsonb_build_object(
      'success', false,
      'status', 'contract_required',
      'contract_signed', false,
      'deposit_paid', v_paid >= coalesce(v_booking.deposit_amount, 0),
      'amount_paid', v_paid,
      'deposit_amount', coalesce(v_booking.deposit_amount, 0)
    );
  end if;

  if v_paid < coalesce(v_booking.deposit_amount, 0) then
    return jsonb_build_object(
      'success', false,
      'status', 'deposit_required',
      'contract_signed', true,
      'deposit_paid', false,
      'amount_paid', v_paid,
      'deposit_amount', coalesce(v_booking.deposit_amount, 0)
    );
  end if;

  update public.bookings
  set
    status = 'confirmed',
    contract_status = 'signed',
    amount_paid = v_paid,
    balance_due = greatest(coalesce(total_amount, 0) - v_paid, 0),
    payment_status = case
      when v_paid >= coalesce(total_amount, 0) then 'paid'
      else 'deposit_paid'
    end,
    updated_at = v_now
  where id = p_booking_id;

  update public.booking_completion_sessions
  set completed_at = v_now, updated_at = v_now
  where id = v_session.id;

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
      and coalesce(rs.status, '') not in ('cancelled', 'failed')
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
      v_booking.delivery_window_start,
      coalesce(v_booking.delivery_window_end, v_booking.event_start_time),
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
      and coalesce(rs.status, '') not in ('cancelled', 'failed')
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
      coalesce(v_booking.pickup_window_start, v_booking.event_end_time),
      v_booking.pickup_window_end,
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

grant execute on function public.finalize_temporary_booking(uuid) to authenticated;

notify pgrst, 'reload schema';

create or replace function public.sign_temporary_booking_contract(
  p_booking_id uuid,
  p_signer_name text,
  p_rendered_html text,
  p_document_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_session public.booking_completion_sessions%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'status', 'authentication_required');
  end if;

  if nullif(trim(coalesce(p_signer_name, '')), '') is null then
    return jsonb_build_object('success', false, 'status', 'signer_name_required');
  end if;

  select * into v_session
  from public.booking_completion_sessions
  where booking_id = p_booking_id
    and revoked_at is null
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'status', 'session_not_found');
  end if;

  if lower(v_session.customer_email) <> v_email then
    return jsonb_build_object('success', false, 'status', 'email_mismatch');
  end if;

  if v_session.completed_at is not null then
    return jsonb_build_object('success', false, 'status', 'already_completed');
  end if;

  if v_session.expires_at <= v_now then
    return jsonb_build_object('success', false, 'status', 'expired');
  end if;

  if exists (
    select 1 from public.contracts
    where booking_id = p_booking_id and status = 'signed'
  ) then
    return jsonb_build_object('success', true, 'status', 'already_signed');
  end if;

  insert into public.contracts (
    booking_id, status, signer_name, signer_email, provider,
    sent_at, viewed_at, signed_at, signature_date,
    template_version, rendered_html, signature_text, signature_metadata
  ) values (
    p_booking_id, 'signed', trim(p_signer_name), v_email, 'internal_esign',
    v_now, v_now, v_now, v_now::date,
    'temporary-booking-v1', p_rendered_html, trim(p_signer_name),
    jsonb_build_object(
      'accepted', true,
      'consentText', 'I read and agree with the contract terms',
      'consentAcceptedAt', v_now,
      'documentHashSha256', p_document_hash,
      'signingProvider', 'internal_esign',
      'evidenceVersion', 1
    )
  );

  update public.bookings
  set contract_status = 'signed', updated_at = v_now
  where id = p_booking_id;

  return jsonb_build_object('success', true, 'status', 'signed', 'booking_id', p_booking_id);
end;
$$;

grant execute on function public.sign_temporary_booking_contract(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';

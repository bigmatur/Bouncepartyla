create or replace function public.sign_temporary_booking_contract(
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

  if coalesce(p_signature_image_data_url, '') !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
    return jsonb_build_object('success', false, 'status', 'drawn_signature_required');
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
    'temporary-booking-v2', p_rendered_html, trim(p_signer_name),
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

grant execute on function public.sign_temporary_booking_contract(uuid, text, text, text, text)
  to authenticated;

create or replace function public.record_temporary_booking_deposit(
  p_booking_id uuid,
  p_amount numeric,
  p_method text
)
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
  v_required numeric := 0;
  v_amount numeric := round(greatest(coalesce(p_amount, 0), 0), 2);
  v_method text := lower(trim(coalesce(p_method, '')));
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'status', 'authentication_required');
  end if;

  select * into v_session
  from public.booking_completion_sessions
  where booking_id = p_booking_id and revoked_at is null
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

  if not exists (
    select 1 from public.contracts
    where booking_id = p_booking_id and status = 'signed'
  ) then
    return jsonb_build_object('success', false, 'status', 'contract_required');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('success', false, 'status', 'booking_not_found');
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where booking_id = p_booking_id and status = 'paid';

  v_required := greatest(coalesce(v_booking.deposit_amount, 0) - v_paid, 0);

  if v_required <= 0 then
    return jsonb_build_object('success', true, 'status', 'deposit_already_paid', 'amount_paid', v_paid);
  end if;

  if v_amount <= 0 or v_amount > v_required then
    return jsonb_build_object('success', false, 'status', 'invalid_amount', 'required_now', v_required);
  end if;

  if v_method not in ('card', 'stripe', 'zelle', 'venmo', 'cash', 'other') then
    return jsonb_build_object('success', false, 'status', 'unsupported_method');
  end if;

  insert into public.payments (booking_id, amount, method, status, note, paid_at)
  values (p_booking_id, v_amount, v_method, 'paid', 'Recorded from customer completion POS', v_now);

  v_paid := v_paid + v_amount;

  update public.bookings
  set
    amount_paid = v_paid,
    balance_due = greatest(coalesce(total_amount, 0) - v_paid, 0),
    payment_status = case
      when v_paid >= coalesce(total_amount, 0) then 'paid'
      when v_paid >= coalesce(deposit_amount, 0) then 'deposit_paid'
      else 'partial'
    end,
    updated_at = v_now
  where id = p_booking_id;

  return jsonb_build_object('success', true, 'status', 'paid', 'amount_paid', v_paid);
end;
$$;

grant execute on function public.record_temporary_booking_deposit(uuid, numeric, text)
  to authenticated;

notify pgrst, 'reload schema';

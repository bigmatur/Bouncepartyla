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
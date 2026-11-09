-- Apply the same safety acknowledgements used by direct customer checkout to
-- operator-created bookings completed through a customer link. This retains
-- the temporary completion-session checks from the older signing RPC.

create or replace function public.sign_temporary_booking_contract_with_safety_ack(
  p_booking_id uuid,
  p_signer_name text,
  p_rendered_html text,
  p_document_hash text,
  p_signature_image_data_url text default null,
  p_no_face_paint_ack boolean default null,
  p_adult_supervision_ack boolean default null
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

  if p_no_face_paint_ack is distinct from true
     or p_adult_supervision_ack is distinct from true then
    return jsonb_build_object('success', false, 'status', 'safety_acknowledgments_required');
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
    update public.bookings
    set contract_status = 'signed', updated_at = v_now
    where id = p_booking_id;

    return jsonb_build_object('success', true, 'status', 'already_signed');
  end if;

  insert into public.contracts (
    booking_id, status, signer_name, signer_email, provider,
    sent_at, viewed_at, signed_at, signature_date,
    template_version, rendered_html, signature_text, signature_metadata
  ) values (
    p_booking_id, 'signed', trim(p_signer_name), v_email, 'internal_esign',
    v_now, v_now, v_now, v_now::date,
    'temporary-booking-safety-v1', p_rendered_html, trim(p_signer_name),
    jsonb_build_object(
      'accepted', true,
      'signatureImageDataUrl', p_signature_image_data_url,
      'signatureMethod', 'drawn_manual',
      'consentText', 'I read and agree with the contract terms',
      'consentAcceptedAt', v_now,
      'documentHashSha256', p_document_hash,
      'signedDocumentFormat', 'rendered_html',
      'signingProvider', 'internal_esign',
      'evidenceVersion', 3,
      'safetyAcknowledgments', jsonb_build_object(
        'noFacePaintGlitterOrSillyString', true,
        'adultSupervisionRequired', true
      )
    )
  );

  update public.bookings
  set contract_status = 'signed', updated_at = v_now
  where id = p_booking_id;

  return jsonb_build_object('success', true, 'status', 'signed', 'booking_id', p_booking_id);
end;
$$;

revoke all on function public.sign_temporary_booking_contract_with_safety_ack(uuid, text, text, text, text, boolean, boolean)
  from public, anon;
grant execute on function public.sign_temporary_booking_contract_with_safety_ack(uuid, text, text, text, text, boolean, boolean)
  to authenticated;

notify pgrst, 'reload schema';

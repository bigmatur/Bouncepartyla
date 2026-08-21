-- 103_handover_sign_document.sql
--
-- Signs an independent Equipment Handover / Delivery Receipt document.
--
-- IMPORTANT:
-- Does NOT modify:
--   contracts
--   bookings.contract_status
--   Stripe / checkout
--   Route Board / route stop statuses
--
-- Signed handover documents become immutable.

begin;

create or replace function public.sign_handover_document(
  p_document_id uuid,
  p_signer_name text,
  p_signature_image_data_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');

  v_is_staff boolean := false;
  v_is_driver boolean := false;

  v_document public.handover_documents%rowtype;

  v_signer_name text := nullif(trim(coalesce(p_signer_name, '')), '');
  v_signature_data text := nullif(trim(coalesce(p_signature_image_data_url, '')), '');

  v_signed_at timestamptz := now();

  v_signature_metadata jsonb := '{}'::jsonb;
  v_rendered_html text := '';
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_document_id is null then
    raise exception 'Handover document id is required.';
  end if;

  if v_signer_name is null then
    raise exception 'Signer name is required.';
  end if;

  if v_signature_data is null then
    raise exception 'Signature is required.';
  end if;

  if v_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
    raise exception 'Invalid signature image.';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = v_user_id
      and coalesce(p.is_active, true) = true
      and p.role::text <> 'customer'
  )
  into v_is_staff;

  select exists (
    select 1
    from public.route_drivers rd
    where coalesce(rd.active, true) = true
      and rd.deleted_at is null
      and (
        rd.auth_user_id = v_user_id
        or (
          nullif(lower(trim(coalesce(rd.account_email, ''))), '') is not null
          and nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '') is not null
          and lower(trim(rd.account_email)) =
              lower(trim(auth.jwt() ->> 'email'))
        )
      )
  )
  into v_is_driver;

  if not v_is_staff and not v_is_driver then
    raise exception 'Staff or an active driver account is required.';
  end if;

  select *
    into v_document
  from public.handover_documents hd
  where hd.id = p_document_id
    and hd.status <> 'void'
  for update;

  if not found then
    raise exception 'Handover document was not found.';
  end if;

  if v_document.status = 'signed' then
    return jsonb_build_object(
      'success', true,
      'status', 'already_signed',
      'document_id', v_document.id,
      'signed_at', v_document.signed_at
    );
  end if;

  if v_document.status not in ('draft', 'ready', 'viewed') then
    raise exception 'Handover document cannot be signed in its current status.';
  end if;

  v_signature_metadata := jsonb_build_object(
    'type', 'manual_canvas',
    'signatureImageDataUrl', v_signature_data,
    'signedByAuthUserId', v_user_id,
    'signedByEmail', v_user_email,
    'signedAt', v_signed_at
  );

  v_rendered_html :=
    coalesce(v_document.template_snapshot, '') ||
    '<hr />' ||
    '<p><strong>' ||
    coalesce(v_document.signature_label_snapshot, 'Customer signature') ||
    ':</strong></p>' ||
    '<p><img src="' ||
    v_signature_data ||
    '" alt="Customer signature" style="display:block;max-width:280px;height:auto;border-bottom:1px solid #d8cec0;padding-bottom:2px;" /></p>' ||
    '<p><strong>Signed by:</strong> ' ||
    replace(
      replace(
        replace(
          replace(
            replace(v_signer_name, '&', '&amp;'),
            '<', '&lt;'
          ),
          '>', '&gt;'
        ),
        '"', '&quot;'
      ),
      '''', '&#39;'
    ) ||
    '</p>' ||
    '<p><strong>Signed at:</strong> ' ||
    v_signed_at::text ||
    '</p>';

  update public.handover_documents
  set
    status = 'signed',
    acknowledged = true,
    signer_name = v_signer_name,
    signer_email = v_user_email,
    signature_metadata = v_signature_metadata,
    rendered_html = v_rendered_html,
    signed_at = v_signed_at,
    signed_by_user_id = v_user_id,
    updated_at = v_signed_at
  where id = v_document.id;

  return jsonb_build_object(
    'success', true,
    'status', 'signed',
    'document_id', v_document.id,
    'signed_at', v_signed_at
  );
end;
$$;

revoke all on function public.sign_handover_document(uuid, text, text)
from public, anon;

grant execute on function public.sign_handover_document(uuid, text, text)
to authenticated;

commit;

notify pgrst, 'reload schema';
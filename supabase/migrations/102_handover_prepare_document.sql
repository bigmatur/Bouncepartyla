-- 102_handover_prepare_document.sql
--
-- Builds / refreshes an independent Equipment Handover document
-- from the current booking.
--
-- IMPORTANT:
-- Does NOT modify:
--   contracts
--   bookings.contract_status
--   contract RPCs
--   Stripe / checkout
--   Route Board / route stop statuses
--
-- Signed handover documents are immutable.

begin;

create or replace function public.prepare_handover_document(
  p_booking_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_staff boolean := false;
  v_is_driver boolean := false;

  v_booking public.bookings%rowtype;

  v_template text := '';
  v_acknowledgement_label text := '';
  v_signature_label text := '';

  v_products jsonb := '[]'::jsonb;
  v_components jsonb := '[]'::jsonb;
  v_options jsonb := '[]'::jsonb;

  v_items_snapshot jsonb := '{}'::jsonb;
  v_booking_snapshot jsonb := '{}'::jsonb;

  v_document_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_booking_id is null then
    raise exception 'Booking id is required.';
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
    into v_booking
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    raise exception 'Booking was not found.';
  end if;

  select
    hs.template_html,
    hs.acknowledgement_label,
    hs.signature_label
  into
    v_template,
    v_acknowledgement_label,
    v_signature_label
  from public.handover_settings hs
  order by hs.created_at asc, hs.id
  limit 1;

  v_template := coalesce(v_template, '');
  v_acknowledgement_label := coalesce(
    v_acknowledgement_label,
    'I confirm that I reviewed and accept the equipment and quantities listed above.'
  );
  v_signature_label := coalesce(
    v_signature_label,
    'Customer signature'
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'booking_item_id', bi.id,
        'product_id', bi.product_id,
        'product_variant_id', bi.product_variant_id,
        'name', p.name,
        'variant_name', pv.name,
        'quantity', bi.quantity,
        'notes', bi.notes
      )
      order by
        p.name,
        pv.name nulls first,
        bi.created_at,
        bi.id
    ),
    '[]'::jsonb
  )
  into v_products
  from public.booking_items bi
  join public.products p
    on p.id = bi.product_id
  left join public.product_variants pv
    on pv.id = bi.product_variant_id
  where bi.booking_id = p_booking_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'booking_modifier_id', bm.id,
        'booking_item_id', bm.booking_item_id,
        'modifier_id', bm.modifier_id,
        'name', m.name,
        'quantity', bm.quantity,
        'notes', bm.notes
      )
      order by
        m.name,
        bm.created_at,
        bm.id
    ),
    '[]'::jsonb
  )
  into v_options
  from public.booking_modifiers bm
  join public.modifiers m
    on m.id = bm.modifier_id
  where bm.booking_id = p_booking_id;

  with component_rows as (
    select
      ir.inventory_item_id,
      ii.name,
      ii.sku,
      ii.unit_label,
      sum(ir.quantity)::numeric as quantity,
      jsonb_agg(
        jsonb_build_object(
          'reservation_id', ir.id,
          'booking_item_id', ir.booking_item_id,
          'inventory_unit_id', ir.inventory_unit_id,
          'quantity', ir.quantity,
          'status', ir.status::text,
          'notes', ir.notes
        )
        order by ir.created_at, ir.id
      ) as reservations
    from public.inventory_reservations ir
    join public.inventory_items ii
      on ii.id = ir.inventory_item_id
    where ir.booking_id = p_booking_id
      and lower(ir.status::text) not in (
        'cancelled',
        'canceled',
        'released',
        'void'
      )
    group by
      ir.inventory_item_id,
      ii.name,
      ii.sku,
      ii.unit_label
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'inventory_item_id', cr.inventory_item_id,
        'name', cr.name,
        'sku', cr.sku,
        'unit_label', cr.unit_label,
        'quantity', cr.quantity,
        'reservations', cr.reservations
      )
      order by cr.name, cr.inventory_item_id
    ),
    '[]'::jsonb
  )
  into v_components
  from component_rows cr;

  v_items_snapshot := jsonb_build_object(
    'products', coalesce(v_products, '[]'::jsonb),
    'components', coalesce(v_components, '[]'::jsonb),
    'options', coalesce(v_options, '[]'::jsonb)
  );

  select jsonb_build_object(
    'booking_id', b.id,
    'booking_number', b.booking_number,
    'event_date', b.event_date,
    'delivery_date', b.delivery_date,
    'pickup_date', b.pickup_date,
    'setup_address', b.setup_address,
    'setup_city', b.setup_city,
    'setup_state', b.setup_state,
    'setup_zip', b.setup_zip,
    'customer_id', b.customer_id,
    'customer_name', c.full_name,
    'customer_email', c.email,
    'customer_phone', c.phone
  )
  into v_booking_snapshot
  from public.bookings b
  left join public.customers c
    on c.id = b.customer_id
  where b.id = p_booking_id;

  v_booking_snapshot := coalesce(
    v_booking_snapshot,
    jsonb_build_object('booking_id', p_booking_id)
  );

  insert into public.handover_documents (
    booking_id,
    status,
    template_snapshot,
    acknowledgement_label_snapshot,
    signature_label_snapshot,
    items_snapshot,
    booking_snapshot,
    created_by,
    created_at,
    updated_at
  )
  values (
    p_booking_id,
    'ready',
    v_template,
    v_acknowledgement_label,
    v_signature_label,
    v_items_snapshot,
    v_booking_snapshot,
    v_user_id,
    now(),
    now()
  )
  on conflict (booking_id)
    where status <> 'void'
  do update set
    template_snapshot =
      case
        when public.handover_documents.status = 'signed'
          then public.handover_documents.template_snapshot
        else excluded.template_snapshot
      end,
    acknowledgement_label_snapshot =
      case
        when public.handover_documents.status = 'signed'
          then public.handover_documents.acknowledgement_label_snapshot
        else excluded.acknowledgement_label_snapshot
      end,
    signature_label_snapshot =
      case
        when public.handover_documents.status = 'signed'
          then public.handover_documents.signature_label_snapshot
        else excluded.signature_label_snapshot
      end,
    items_snapshot =
      case
        when public.handover_documents.status = 'signed'
          then public.handover_documents.items_snapshot
        else excluded.items_snapshot
      end,
    booking_snapshot =
      case
        when public.handover_documents.status = 'signed'
          then public.handover_documents.booking_snapshot
        else excluded.booking_snapshot
      end,
    status =
      case
        when public.handover_documents.status = 'draft'
          then 'ready'
        else public.handover_documents.status
      end,
    updated_at =
      case
        when public.handover_documents.status = 'signed'
          then public.handover_documents.updated_at
        else now()
      end
  returning id
  into v_document_id;

  if v_document_id is null then
    select hd.id
      into v_document_id
    from public.handover_documents hd
    where hd.booking_id = p_booking_id
      and hd.status <> 'void'
    order by hd.created_at desc, hd.id
    limit 1;
  end if;

  if v_document_id is null then
    raise exception 'Handover document could not be prepared.';
  end if;

  return v_document_id;
end;
$$;

create or replace function public.get_handover_document_for_staff(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_staff boolean := false;
  v_is_driver boolean := false;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
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

  select jsonb_build_object(
    'id', hd.id,
    'booking_id', hd.booking_id,
    'status', hd.status,
    'template_snapshot', hd.template_snapshot,
    'acknowledgement_label', hd.acknowledgement_label_snapshot,
    'signature_label', hd.signature_label_snapshot,
    'items', hd.items_snapshot,
    'booking', hd.booking_snapshot,
    'delivery_notes', hd.delivery_notes,
    'acknowledged', hd.acknowledged,
    'signer_name', hd.signer_name,
    'signer_email', hd.signer_email,
    'signature_metadata', hd.signature_metadata,
    'signature_storage_path', hd.signature_storage_path,
    'pdf_storage_path', hd.pdf_storage_path,
    'viewed_at', hd.viewed_at,
    'signed_at', hd.signed_at,
    'created_at', hd.created_at,
    'updated_at', hd.updated_at
  )
  into v_result
  from public.handover_documents hd
  where hd.booking_id = p_booking_id
    and hd.status <> 'void'
  order by
    case when hd.status = 'signed' then 0 else 1 end,
    hd.created_at desc,
    hd.id
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.prepare_handover_document(uuid)
from public, anon;

revoke all on function public.get_handover_document_for_staff(uuid)
from public, anon;

grant execute on function public.prepare_handover_document(uuid)
to authenticated;

grant execute on function public.get_handover_document_for_staff(uuid)
to authenticated;

commit;

notify pgrst, 'reload schema';

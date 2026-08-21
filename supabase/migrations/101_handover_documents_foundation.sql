-- 101_handover_documents_foundation.sql
--
-- Independent Equipment Handover / Delivery Receipt module.
--
-- IMPORTANT:
-- This migration does NOT modify:
--   - contracts
--   - bookings.contract_status
--   - contract signing RPCs
--   - Stripe / checkout
--   - Route Board status logic
--
-- Handover documents are a separate feature.

begin;

-- =========================================================
-- HANDOVER SETTINGS
-- =========================================================

create table if not exists public.handover_settings (
  id uuid primary key default gen_random_uuid(),

  template_html text not null default
    '<h2>Equipment Delivery & Acceptance</h2>
     <p>
       I acknowledge receipt of the rental equipment and items listed below.
       At the time of delivery, I have inspected the equipment and confirm
       that it has been received in acceptable condition, except for any
       damage, missing items, or discrepancies specifically noted on this form.
     </p>
     <p>
       I understand that I am responsible for the reasonable care and
       supervision of the rented equipment while it is in my possession and
       agree to notify Bounce Party LA promptly of any damage, loss, missing
       items, or other issues.
     </p>
     <p>
       By checking the acknowledgment box and signing below, I confirm that
       the quantities and condition of the delivered items have been reviewed
       and accepted.
     </p>',

  acknowledgement_label text not null default
    'I confirm that I reviewed and accept the equipment and quantities listed above.',

  signature_label text not null default 'Customer signature',

  require_acknowledgement boolean not null default true,
  require_signature boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists handover_settings_set_updated_at
on public.handover_settings;

create trigger handover_settings_set_updated_at
before update on public.handover_settings
for each row execute function public.set_updated_at();


-- Keep one default settings row available.
insert into public.handover_settings (
  template_html,
  acknowledgement_label,
  signature_label,
  require_acknowledgement,
  require_signature
)
select
  '<h2>Equipment Delivery & Acceptance</h2>
   <p>
     I acknowledge receipt of the rental equipment and items listed below.
     At the time of delivery, I have inspected the equipment and confirm
     that it has been received in acceptable condition, except for any
     damage, missing items, or discrepancies specifically noted on this form.
   </p>
   <p>
     I understand that I am responsible for the reasonable care and
     supervision of the rented equipment while it is in my possession and
     agree to notify Bounce Party LA promptly of any damage, loss, missing
     items, or other issues.
   </p>
   <p>
     By checking the acknowledgment box and signing below, I confirm that
     the quantities and condition of the delivered items have been reviewed
     and accepted.
   </p>',
  'I confirm that I reviewed and accept the equipment and quantities listed above.',
  'Customer signature',
  true,
  true
where not exists (
  select 1
  from public.handover_settings
);


-- =========================================================
-- HANDOVER DOCUMENTS
-- =========================================================

create table if not exists public.handover_documents (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null
    references public.bookings(id)
    on delete cascade,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'ready',
        'viewed',
        'signed',
        'void'
      )
    ),

  -- Snapshot of editable Settings text at document creation/signing time.
  template_snapshot text not null default '',

  acknowledgement_label_snapshot text,
  signature_label_snapshot text,

  -- Final rendered document body.
  rendered_html text,

  -- Frozen list of what was handed over.
  --
  -- Example:
  -- {
  --   "products": [...],
  --   "components": [...],
  --   "options": [...]
  -- }
  items_snapshot jsonb not null default
    jsonb_build_object(
      'products', '[]'::jsonb,
      'components', '[]'::jsonb,
      'options', '[]'::jsonb
    ),

  -- Optional snapshot of booking/customer metadata.
  booking_snapshot jsonb not null default '{}'::jsonb,

  delivery_notes text,

  acknowledged boolean not null default false,

  signer_name text,
  signer_email text,

  -- Signature should ultimately contain metadata / storage reference,
  -- not be coupled to Contract signature implementation.
  signature_metadata jsonb not null default '{}'::jsonb,

  signature_storage_path text,

  pdf_storage_path text,

  viewed_at timestamptz,
  signed_at timestamptz,
  voided_at timestamptz,

  created_by uuid
    references auth.users(id)
    on delete set null,

  signed_by_user_id uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


drop trigger if exists handover_documents_set_updated_at
on public.handover_documents;

create trigger handover_documents_set_updated_at
before update on public.handover_documents
for each row execute function public.set_updated_at();


create index if not exists idx_handover_documents_booking_id
  on public.handover_documents(booking_id);

create index if not exists idx_handover_documents_status
  on public.handover_documents(status);

create index if not exists idx_handover_documents_signed_at
  on public.handover_documents(signed_at desc);


-- Normally only one active handover should exist per booking.
-- Historical void documents may remain.
create unique index if not exists idx_handover_documents_one_active_per_booking
  on public.handover_documents(booking_id)
  where status <> 'void';


-- =========================================================
-- RLS
-- =========================================================

alter table public.handover_settings enable row level security;
alter table public.handover_documents enable row level security;


-- Management can view Settings.
drop policy if exists handover_settings_management_select
on public.handover_settings;

create policy handover_settings_management_select
on public.handover_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role::text in ('super_admin', 'admin', 'manager')
  )
);


-- Management can update Settings.
drop policy if exists handover_settings_management_update
on public.handover_settings;

create policy handover_settings_management_update
on public.handover_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role::text in ('super_admin', 'admin', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role::text in ('super_admin', 'admin', 'manager')
  )
);


-- Staff can read handover documents.
--
-- Fine-grained customer access will be added separately once we hook
-- this into the existing customer booking authorization path.
drop policy if exists handover_documents_staff_select
on public.handover_documents;

create policy handover_documents_staff_select
on public.handover_documents
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.is_active, true) = true
      and p.role::text <> 'customer'
  )
);


-- Management / staff document writes will initially go through
-- SECURITY DEFINER RPC/actions added in the next migration.
-- We intentionally do not grant broad table INSERT/UPDATE here.


revoke all on public.handover_settings from anon;
revoke all on public.handover_documents from anon;

grant select on public.handover_settings to authenticated;
grant select on public.handover_documents to authenticated;


commit;

notify pgrst, 'reload schema';
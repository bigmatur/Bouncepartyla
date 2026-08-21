-- 072 CRM Core foundation
-- Reuses existing booking_leads as the sales/event opportunity entity
-- and existing tasks as the task/reminder entity.
-- Adds only channel-agnostic conversation infrastructure.

create table if not exists public.crm_conversations (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid,
  customer_id uuid references public.customers(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  subject text,
  status text not null default 'open',
  priority text not null default 'normal',
  needs_reply boolean not null default false,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  assigned_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_conversations_status_check check (status in ('open','closed','archived')),
  constraint crm_conversations_priority_check check (priority in ('low','normal','high'))
);

create index if not exists idx_crm_conversations_lead_id on public.crm_conversations(lead_id);
create index if not exists idx_crm_conversations_customer_id on public.crm_conversations(customer_id);
create index if not exists idx_crm_conversations_booking_id on public.crm_conversations(booking_id);
create index if not exists idx_crm_conversations_needs_reply on public.crm_conversations(needs_reply, last_message_at desc);

create table if not exists public.crm_contact_identities (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade,
  lead_id uuid,
  identity_type text not null,
  identity_value text not null,
  normalized_value text not null,
  display_value text,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_contact_identities_type_check check (identity_type in ('email','phone','instagram','telegram','whatsapp','facebook','other')),
  constraint crm_contact_identity_owner_check check (customer_id is not null or lead_id is not null)
);

create unique index if not exists uq_crm_contact_identity_normalized
  on public.crm_contact_identities(identity_type, normalized_value);
create index if not exists idx_crm_contact_identities_customer_id on public.crm_contact_identities(customer_id);
create index if not exists idx_crm_contact_identities_lead_id on public.crm_contact_identities(lead_id);

create table if not exists public.crm_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  direction text not null,
  channel text not null,
  sender_identity text,
  recipient_identity text,
  body_text text,
  body_html text,
  provider_message_id text,
  provider_thread_id text,
  status text not null default 'received',
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint crm_messages_direction_check check (direction in ('inbound','outbound','internal')),
  constraint crm_messages_channel_check check (channel in ('email','sms','instagram','telegram','whatsapp','facebook','internal'))
);

create unique index if not exists uq_crm_messages_provider_message
  on public.crm_messages(channel, provider_message_id)
  where provider_message_id is not null;
create index if not exists idx_crm_messages_conversation_created on public.crm_messages(conversation_id, created_at desc);

create table if not exists public.crm_notes (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid,
  customer_id uuid references public.customers(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  conversation_id uuid references public.crm_conversations(id) on delete cascade,
  body text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_notes_owner_check check (
    lead_id is not null or customer_id is not null or booking_id is not null or conversation_id is not null
  )
);

create index if not exists idx_crm_notes_lead_id on public.crm_notes(lead_id);
create index if not exists idx_crm_notes_customer_id on public.crm_notes(customer_id);
create index if not exists idx_crm_notes_booking_id on public.crm_notes(booking_id);

create table if not exists public.crm_pipeline_history (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null,
  from_status text,
  to_status text not null,
  changed_by uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists idx_crm_pipeline_history_lead on public.crm_pipeline_history(lead_id, changed_at desc);

alter table public.crm_conversations enable row level security;
alter table public.crm_contact_identities enable row level security;
alter table public.crm_messages enable row level security;
alter table public.crm_notes enable row level security;
alter table public.crm_pipeline_history enable row level security;

-- Keep the same admin-only posture currently used by Leads/Tasks.
drop policy if exists "Allow admin all CRM conversations" on public.crm_conversations;
create policy "Allow admin all CRM conversations" on public.crm_conversations for all using (true) with check (true);

drop policy if exists "Allow admin all CRM identities" on public.crm_contact_identities;
create policy "Allow admin all CRM identities" on public.crm_contact_identities for all using (true) with check (true);

drop policy if exists "Allow admin all CRM messages" on public.crm_messages;
create policy "Allow admin all CRM messages" on public.crm_messages for all using (true) with check (true);

drop policy if exists "Allow admin all CRM notes" on public.crm_notes;
create policy "Allow admin all CRM notes" on public.crm_notes for all using (true) with check (true);

drop policy if exists "Allow admin all CRM pipeline history" on public.crm_pipeline_history;
create policy "Allow admin all CRM pipeline history" on public.crm_pipeline_history for all using (true) with check (true);

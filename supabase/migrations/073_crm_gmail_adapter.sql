-- 073 CRM Gmail adapter
-- Adds sync state only. OAuth credentials remain server-side environment variables.

create table if not exists public.crm_email_sync_state (
  account_key text primary key,
  provider text not null default 'gmail',
  mailbox_identity text,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  last_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_email_sync_state enable row level security;

drop policy if exists "Allow admin all CRM email sync state" on public.crm_email_sync_state;
create policy "Allow admin all CRM email sync state"
  on public.crm_email_sync_state for all using (true) with check (true);

create index if not exists idx_crm_messages_provider_thread
  on public.crm_messages(channel, provider_thread_id)
  where provider_thread_id is not null;

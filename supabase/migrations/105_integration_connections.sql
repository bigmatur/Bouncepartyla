-- =========================================================
-- 105 Integration connections
-- Central admin-managed configuration for third-party integrations.
-- Secrets are encrypted by the application before storage.
-- =========================================================

begin;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  display_name text not null,
  enabled boolean not null default false,
  status text not null default 'not_connected',
  public_config jsonb not null default '{}'::jsonb,
  encrypted_credentials jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_error text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint integration_connections_provider_check check (
    provider in ('ga4', 'meta', 'instagram', 'sms', 'telegram', 'whatsapp', 'google_maps', 'stripe', 'gmail')
  ),
  constraint integration_connections_status_check check (
    status in ('connected', 'not_connected', 'error', 'disabled')
  )
);

create index if not exists idx_integration_connections_provider
on public.integration_connections(provider);

create index if not exists idx_integration_connections_status
on public.integration_connections(status);

drop trigger if exists integration_connections_set_updated_at
on public.integration_connections;

create trigger integration_connections_set_updated_at
before update on public.integration_connections
for each row execute function public.set_updated_at();

alter table public.integration_connections enable row level security;

drop policy if exists integration_connections_select_admin
on public.integration_connections;

drop policy if exists integration_connections_insert_admin
on public.integration_connections;

drop policy if exists integration_connections_update_admin
on public.integration_connections;

drop policy if exists integration_connections_delete_admin
on public.integration_connections;

create policy integration_connections_select_admin
on public.integration_connections
for select
to authenticated
using (public.is_admin());

create policy integration_connections_insert_admin
on public.integration_connections
for insert
to authenticated
with check (public.is_admin());

create policy integration_connections_update_admin
on public.integration_connections
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy integration_connections_delete_admin
on public.integration_connections
for delete
to authenticated
using (public.is_admin());

revoke all on table public.integration_connections from anon;
revoke all on table public.integration_connections from authenticated;

grant select (
  id,
  provider,
  display_name,
  enabled,
  status,
  public_config,
  last_tested_at,
  last_error,
  created_by,
  updated_by,
  created_at,
  updated_at
) on public.integration_connections to authenticated;

grant insert, update, delete on public.integration_connections to authenticated;

insert into public.integration_connections (provider, display_name, enabled, status, public_config)
values
  ('ga4', 'Google Analytics 4', false, 'not_connected', '{}'::jsonb),
  ('meta', 'Meta Ads', false, 'not_connected', '{}'::jsonb),
  ('instagram', 'Instagram', false, 'not_connected', '{}'::jsonb),
  ('sms', 'SMS', false, 'not_connected', '{}'::jsonb),
  ('telegram', 'Telegram', false, 'not_connected', '{}'::jsonb),
  ('whatsapp', 'WhatsApp', false, 'not_connected', '{}'::jsonb),
  ('google_maps', 'Google Maps', false, 'not_connected', '{}'::jsonb),
  ('stripe', 'Stripe', false, 'not_connected', '{}'::jsonb),
  ('gmail', 'Gmail', false, 'not_connected', '{}'::jsonb)
on conflict (provider) do nothing;

notify pgrst, 'reload schema';

commit;
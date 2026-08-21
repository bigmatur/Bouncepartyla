-- Booking security and contract settings

create table if not exists booking_discount_security_settings (
  id uuid primary key default uuid_generate_v4(),
  discount_password_enabled boolean not null default false,
  discount_password_hash text,
  discount_password_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on table booking_discount_security_settings to anon, authenticated, service_role;

alter table booking_discount_security_settings enable row level security;

do $$ begin
  create policy booking_discount_security_settings_select_all
    on booking_discount_security_settings
    for select
    to public
    using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy booking_discount_security_settings_insert_all
    on booking_discount_security_settings
    for insert
    to public
    with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy booking_discount_security_settings_update_all
    on booking_discount_security_settings
    for update
    to public
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

insert into booking_discount_security_settings (
  discount_password_enabled,
  discount_password_hint
)
select false, null
where not exists (
  select 1 from booking_discount_security_settings
);

create table if not exists booking_contract_settings (
  id uuid primary key default uuid_generate_v4(),
  template_html text not null default '',
  require_contract_before_payment boolean not null default true,
  require_typed_signature boolean not null default true,
  signature_label text not null default 'Client signature',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on table booking_contract_settings to anon, authenticated, service_role;

alter table booking_contract_settings enable row level security;

do $$ begin
  create policy booking_contract_settings_select_all
    on booking_contract_settings
    for select
    to public
    using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy booking_contract_settings_insert_all
    on booking_contract_settings
    for insert
    to public
    with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy booking_contract_settings_update_all
    on booking_contract_settings
    for update
    to public
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

insert into booking_contract_settings (
  template_html,
  require_contract_before_payment,
  require_typed_signature,
  signature_label
)
select
  '<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>Address: {{setup_address}}, {{setup_city}} {{setup_zip}}</p><p>{{signature_label}}: {{signature_name}}</p><p>Date: {{signature_date}}</p>',
  true,
  true,
  'Client signature'
where not exists (
  select 1 from booking_contract_settings
);

alter table if exists contracts
  add column if not exists template_version text,
  add column if not exists rendered_html text,
  add column if not exists signature_text text,
  add column if not exists signature_date date,
  add column if not exists signer_ip text,
  add column if not exists signer_user_agent text,
  add column if not exists signature_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_contracts_signature_date on contracts(signature_date);

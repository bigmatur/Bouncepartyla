-- =========================================================
-- PAYMENT METHOD SETTINGS + STRIPE SUPPORT
-- =========================================================

do $$ begin
  alter type payment_method add value 'stripe';
exception
  when duplicate_object then null;
end $$;

create table if not exists payment_method_settings (
  id uuid primary key default uuid_generate_v4(),

  method payment_method not null unique,
  display_name text not null,

  is_enabled boolean not null default true,
  integration_enabled boolean not null default false,
  integration_type text,

  account_label text,
  account_value text,

  sort_order integer not null default 100,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists payment_method_settings_set_updated_at on payment_method_settings;
create trigger payment_method_settings_set_updated_at
before update on payment_method_settings
for each row execute function set_updated_at();

create index if not exists idx_payment_method_settings_sort_order
on payment_method_settings(sort_order);

insert into payment_method_settings (
  method,
  display_name,
  is_enabled,
  integration_enabled,
  integration_type,
  account_label,
  account_value,
  sort_order
)
values
  ('zelle', 'Zelle', true, false, 'manual', 'Zelle contact', null, 10),
  ('venmo', 'Venmo', true, false, 'manual', 'Venmo username', null, 20),
  ('cash', 'Cash', true, false, 'manual', null, null, 40),
  ('card', 'Card terminal', true, false, 'manual', null, null, 50),
  ('check', 'Check', true, false, 'manual', null, null, 60),
  ('bank_transfer', 'Bank transfer', false, false, 'manual', 'Bank details', null, 70),
  ('other', 'Other', false, false, 'manual', null, null, 80)
on conflict (method) do nothing;

-- =========================================================
-- PAYMENT POS SETTINGS + METHOD ICONS
-- =========================================================

alter table if exists payment_method_settings
add column if not exists icon_url text;

create table if not exists payment_pos_settings (
  id uuid primary key default uuid_generate_v4(),

  tips_enabled boolean not null default true,
  allow_custom_tip boolean not null default true,
  default_tip_percent numeric(6,2) not null default 15,
  tip_percent_options text not null default '10,15,20',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists payment_pos_settings_set_updated_at on payment_pos_settings;
create trigger payment_pos_settings_set_updated_at
before update on payment_pos_settings
for each row execute function set_updated_at();

insert into payment_pos_settings (
  tips_enabled,
  allow_custom_tip,
  default_tip_percent,
  tip_percent_options
)
select true, true, 15, '10,15,20'
where not exists (select 1 from payment_pos_settings);

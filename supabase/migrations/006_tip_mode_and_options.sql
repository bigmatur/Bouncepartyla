-- =========================================================
-- TIP MODE + AMOUNT OPTIONS FOR POS
-- =========================================================

alter table if exists payment_pos_settings
add column if not exists tip_mode text not null default 'percent';

alter table if exists payment_pos_settings
add column if not exists default_tip_amount numeric(10,2) not null default 10;

alter table if exists payment_pos_settings
add column if not exists tip_amount_options text not null default '5,10,20';

update payment_pos_settings
set
  tip_mode = coalesce(tip_mode, 'percent'),
  default_tip_amount = coalesce(default_tip_amount, 10),
  tip_amount_options = coalesce(tip_amount_options, '5,10,20');

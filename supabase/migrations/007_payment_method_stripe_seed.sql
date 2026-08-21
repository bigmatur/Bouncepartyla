-- =========================================================
-- STRIPE METHOD SEED (SEPARATE TX FROM ENUM ADD)
-- =========================================================

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
values (
  'stripe',
  'Stripe',
  false,
  false,
  'stripe',
  'Publishable key',
  null,
  30
)
on conflict (method) do update
set
  display_name = excluded.display_name,
  integration_type = excluded.integration_type,
  account_label = excluded.account_label,
  sort_order = excluded.sort_order,
  updated_at = now();

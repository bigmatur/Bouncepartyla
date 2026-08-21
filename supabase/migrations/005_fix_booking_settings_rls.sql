-- Fix RLS and seed rows for booking security/contract settings

DO $$
BEGIN
  IF to_regclass('public.booking_discount_security_settings') IS NOT NULL THEN
    EXECUTE 'grant select, insert, update on table booking_discount_security_settings to anon, authenticated, service_role';
    EXECUTE 'alter table booking_discount_security_settings enable row level security';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.booking_discount_security_settings') IS NOT NULL THEN
    create policy booking_discount_security_settings_select_all
      on booking_discount_security_settings
      for select
      to public
      using (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF to_regclass('public.booking_discount_security_settings') IS NOT NULL THEN
    create policy booking_discount_security_settings_insert_all
      on booking_discount_security_settings
      for insert
      to public
      with check (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF to_regclass('public.booking_discount_security_settings') IS NOT NULL THEN
    create policy booking_discount_security_settings_update_all
      on booking_discount_security_settings
      for update
      to public
      using (true)
      with check (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO booking_discount_security_settings (
  discount_password_enabled,
  discount_password_hint
)
SELECT false, null
WHERE to_regclass('public.booking_discount_security_settings') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM booking_discount_security_settings);

DO $$
BEGIN
  IF to_regclass('public.booking_contract_settings') IS NOT NULL THEN
    EXECUTE 'grant select, insert, update on table booking_contract_settings to anon, authenticated, service_role';
    EXECUTE 'alter table booking_contract_settings enable row level security';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.booking_contract_settings') IS NOT NULL THEN
    create policy booking_contract_settings_select_all
      on booking_contract_settings
      for select
      to public
      using (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF to_regclass('public.booking_contract_settings') IS NOT NULL THEN
    create policy booking_contract_settings_insert_all
      on booking_contract_settings
      for insert
      to public
      with check (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF to_regclass('public.booking_contract_settings') IS NOT NULL THEN
    create policy booking_contract_settings_update_all
      on booking_contract_settings
      for update
      to public
      using (true)
      with check (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO booking_contract_settings (
  template_html,
  require_contract_before_payment,
  require_typed_signature,
  signature_label
)
SELECT
  '<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>Address: {{setup_address}}, {{setup_city}} {{setup_zip}}</p><p>{{signature_label}}: {{signature_name}}</p><p>Date: {{signature_date}}</p>',
  true,
  true,
  'Client signature'
WHERE to_regclass('public.booking_contract_settings') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM booking_contract_settings);

-- Fix RLS and seed rows for payment settings tables

DO $$
BEGIN
  IF to_regclass('public.payment_method_settings') IS NOT NULL THEN
    EXECUTE 'grant select, insert, update on table payment_method_settings to anon, authenticated, service_role';
    EXECUTE 'alter table payment_method_settings enable row level security';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.payment_method_settings') IS NOT NULL THEN
    create policy payment_method_settings_select_all
      on payment_method_settings
      for select
      to public
      using (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF to_regclass('public.payment_method_settings') IS NOT NULL THEN
    create policy payment_method_settings_insert_all
      on payment_method_settings
      for insert
      to public
      with check (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF to_regclass('public.payment_method_settings') IS NOT NULL THEN
    create policy payment_method_settings_update_all
      on payment_method_settings
      for update
      to public
      using (true)
      with check (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF to_regclass('public.payment_pos_settings') IS NOT NULL THEN
    EXECUTE 'grant select, insert, update on table payment_pos_settings to anon, authenticated, service_role';
    EXECUTE 'alter table payment_pos_settings enable row level security';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.payment_pos_settings') IS NOT NULL THEN
    create policy payment_pos_settings_select_all
      on payment_pos_settings
      for select
      to public
      using (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF to_regclass('public.payment_pos_settings') IS NOT NULL THEN
    create policy payment_pos_settings_insert_all
      on payment_pos_settings
      for insert
      to public
      with check (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF to_regclass('public.payment_pos_settings') IS NOT NULL THEN
    create policy payment_pos_settings_update_all
      on payment_pos_settings
      for update
      to public
      using (true)
      with check (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO payment_pos_settings (
  tips_enabled,
  allow_custom_tip,
  tip_mode,
  default_tip_percent,
  default_tip_amount,
  tip_percent_options,
  tip_amount_options
)
SELECT true, true, 'percent', 15, 10, '10,15,20', '5,10,20'
WHERE to_regclass('public.payment_pos_settings') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM payment_pos_settings);

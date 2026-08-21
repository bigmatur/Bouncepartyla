-- 088_align_settings_rls_with_admin_permissions.sql
--
-- Align Settings RLS with application permission:
--   requireAdminPermission("settings.edit")
--
-- Current production schema does not contain:
--   profiles.permissions
--   profiles.denied_permissions
--   profiles.additional_roles
--   app_roles
--
-- Therefore DB-level Settings write authorization is role based.
--
-- public.is_admin() allows:
--   super_admin
--   admin
--
-- This matches the current built-in application roles that have settings.edit.
--
-- Customer/authenticated read policies are intentionally preserved.


-- ============================================================================
-- BOOKING DISCOUNT SECURITY SETTINGS
-- ============================================================================

drop policy if exists booking_discount_security_settings_staff_manage
on public.booking_discount_security_settings;

create policy booking_discount_security_settings_staff_manage
on public.booking_discount_security_settings
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);


-- ============================================================================
-- BOOKING CONTRACT SETTINGS
-- ============================================================================

drop policy if exists booking_contract_settings_staff_manage
on public.booking_contract_settings;

create policy booking_contract_settings_staff_manage
on public.booking_contract_settings
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);


-- ============================================================================
-- BOOKING RECEIPT DESIGN SETTINGS
-- ============================================================================

drop policy if exists booking_receipt_design_settings_staff_manage
on public.booking_receipt_design_settings;

create policy booking_receipt_design_settings_staff_manage
on public.booking_receipt_design_settings
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);
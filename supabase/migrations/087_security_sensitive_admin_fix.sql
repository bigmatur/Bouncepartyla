-- 087_security_sensitive_admin_fix.sql
--
-- Fixes security hardening v1:
-- current_user_is_staff() intentionally includes drivers and must NOT
-- be used for sensitive Settings / CRM / completion-session management.
--
-- Current DB roles:
--   customer
--   driver
--   super_admin
--
-- Sensitive administrative operations are therefore restricted
-- to active super_admin accounts.
--
-- IMPORTANT:
-- Do NOT modify current_user_is_staff().
-- Other subsystems depend on drivers being considered staff.

begin;

-- ============================================================================
-- STRICT SECURITY HELPER
-- ============================================================================

create or replace function public.current_user_is_security_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.is_active = true
      and p.role = 'super_admin'
  );
$$;

revoke all
on function public.current_user_is_security_admin()
from public;

grant execute
on function public.current_user_is_security_admin()
to authenticated;

grant execute
on function public.current_user_is_security_admin()
to service_role;


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
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
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
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
);


-- ============================================================================
-- RECEIPT DESIGN SETTINGS
-- ============================================================================

drop policy if exists booking_receipt_design_settings_staff_manage
on public.booking_receipt_design_settings;

create policy booking_receipt_design_settings_staff_manage
on public.booking_receipt_design_settings
for all
to authenticated
using (
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
);


-- ============================================================================
-- PAYMENT METHOD SETTINGS
-- ============================================================================

drop policy if exists payment_method_settings_staff_manage
on public.payment_method_settings;

create policy payment_method_settings_staff_manage
on public.payment_method_settings
for all
to authenticated
using (
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
);


-- ============================================================================
-- PAYMENT POS SETTINGS
-- ============================================================================

drop policy if exists payment_pos_settings_staff_manage
on public.payment_pos_settings;

create policy payment_pos_settings_staff_manage
on public.payment_pos_settings
for all
to authenticated
using (
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
);


-- ============================================================================
-- BOOKING COMPLETION SESSIONS
--
-- Customers complete bookings through SECURITY DEFINER RPC functions.
-- They must not directly insert/update/delete session rows.
-- Drivers must not manage them either.
-- ============================================================================

drop policy if exists booking_completion_sessions_staff_insert
on public.booking_completion_sessions;

drop policy if exists booking_completion_sessions_staff_update
on public.booking_completion_sessions;

drop policy if exists booking_completion_sessions_staff_delete
on public.booking_completion_sessions;

create policy booking_completion_sessions_staff_insert
on public.booking_completion_sessions
for insert
to authenticated
with check (
  public.current_user_is_security_admin()
  and (
    created_by_auth_user_id is null
    or created_by_auth_user_id = auth.uid()
  )
);

create policy booking_completion_sessions_staff_update
on public.booking_completion_sessions
for update
to authenticated
using (
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
);

create policy booking_completion_sessions_staff_delete
on public.booking_completion_sessions
for delete
to authenticated
using (
  public.current_user_is_security_admin()
);


-- ============================================================================
-- CRM
--
-- CRM contains customer communications / contact identities / internal notes.
-- Until granular DB permissions are installed, only super_admin may access it
-- through normal authenticated database sessions.
--
-- Server-side adapters using service_role remain unaffected.
-- ============================================================================

drop policy if exists crm_conversations_staff_all
on public.crm_conversations;

drop policy if exists crm_contact_identities_staff_all
on public.crm_contact_identities;

drop policy if exists crm_messages_staff_all
on public.crm_messages;

drop policy if exists crm_notes_staff_all
on public.crm_notes;

drop policy if exists crm_pipeline_history_staff_all
on public.crm_pipeline_history;


create policy crm_conversations_security_admin_all
on public.crm_conversations
for all
to authenticated
using (
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
);


create policy crm_contact_identities_security_admin_all
on public.crm_contact_identities
for all
to authenticated
using (
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
);


create policy crm_messages_security_admin_all
on public.crm_messages
for all
to authenticated
using (
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
);


create policy crm_notes_security_admin_all
on public.crm_notes
for all
to authenticated
using (
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
);


create policy crm_pipeline_history_security_admin_all
on public.crm_pipeline_history
for all
to authenticated
using (
  public.current_user_is_security_admin()
)
with check (
  public.current_user_is_security_admin()
);


notify pgrst, 'reload schema';

commit;
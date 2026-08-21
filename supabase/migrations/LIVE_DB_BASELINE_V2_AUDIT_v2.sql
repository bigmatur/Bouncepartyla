
-- Bounce Party LA Booking System
-- LIVE DB BASELINE V2 AUDIT — SAFE / READ ONLY / MISSING-TABLE TOLERANT
-- Generated after discovering that notification_event_types is absent in live DB.
-- This script DOES NOT modify data.

-- ============================================================
-- A. KEY TABLE PRESENCE
-- ============================================================
with expected(table_name, domain_name) as (
  values
    ('bookings','Booking'),
    ('booking_items','Booking'),
    ('customers','Customer'),
    ('payments','Payments'),
    ('contracts','Contracts'),
    ('inventory_items','Inventory'),
    ('inventory_units','Inventory'),
    ('inventory_reservations','Inventory'),
    ('route_stops','Route Board'),
    ('notification_event_types','Notifications'),
    ('notification_rules','Notifications'),
    ('notification_templates','Notifications'),
    ('notification_preferences','Notifications'),
    ('notification_messages','Notifications'),
    ('notification_deliveries','Notifications'),
    ('crm_conversations','CRM'),
    ('crm_contact_identities','CRM'),
    ('crm_messages','CRM'),
    ('crm_notes','CRM'),
    ('crm_pipeline_history','CRM'),
    ('booking_leads','CRM'),
    ('tasks','Tasks')
)
select
  e.domain_name,
  e.table_name,
  case when t.table_name is null then 'MISSING' else 'PRESENT' end as live_status
from expected e
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = e.table_name
order by e.domain_name, e.table_name;


-- ============================================================
-- B. KEY PUBLIC RPC / FUNCTIONS
-- ============================================================
with expected(function_name, domain_name) as (
  values
    ('finalize_booking_after_external_payment','Stripe / Booking'),
    ('expire_unpaid_customer_stripe_booking','Stripe / Booking'),
    ('sign_customer_booking_contract','Contracts'),
    ('complete_customer_booking_checkout','Booking / Payments'),
    ('refresh_booking_payment_totals','Payments'),
    ('get_my_booking_details','Customer Booking'),
    ('get_working_time_admin_report','Working Time'),
    ('get_working_time_break_premium_report','Working Time'),
    ('admin_review_staff_break_premium','Working Time')
)
select
  e.domain_name,
  e.function_name,
  case when p.oid is null then 'MISSING' else 'PRESENT' end as live_status,
  coalesce(pg_get_function_identity_arguments(p.oid), '') as arguments
from expected e
left join lateral (
  select p.*
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = e.function_name
  order by p.oid
  limit 1
) p on true
order by e.domain_name, e.function_name;


-- ============================================================
-- C. BOOKING STATUS + SOURCE DISTRIBUTION
-- Runs only because bookings is known to exist in this system.
-- ============================================================
select
  coalesce(status::text, '<null>') as status,
  coalesce(booking_source, '<null>') as booking_source,
  count(*)::bigint as booking_count
from public.bookings
group by 1,2
order by booking_count desc, status, booking_source;


-- ============================================================
-- D. SELF-SERVICE CHECKOUT HOLDS / POSSIBLE ANOMALIES
-- ============================================================
select
  b.id,
  b.booking_number,
  b.event_date,
  b.status::text as status,
  b.booking_source,
  b.total_amount,
  b.deposit_amount,
  b.amount_paid,
  b.balance_due,
  b.payment_status::text as payment_status,
  b.contract_status::text as contract_status,
  b.created_at,
  (
    select coalesce(sum(greatest(coalesce(p.amount,0)-coalesce(p.tip_amount,0),0)),0)
    from public.payments p
    where p.booking_id = b.id
      and lower(coalesce(p.status::text,'')) in ('paid','completed','succeeded')
  ) as authoritative_paid
from public.bookings b
where coalesce(b.booking_source,'') = 'customer_self_service'
  and b.status::text = 'pending_deposit'
order by b.created_at desc;


-- ============================================================
-- E. CONTRACT SUMMARY
-- ============================================================
select
  coalesce(status::text, '<null>') as status,
  count(*)::bigint as contract_count
from public.contracts
group by 1
order by contract_count desc;


-- ============================================================
-- F. INVENTORY RESERVATION SUMMARY
-- ============================================================
select
  coalesce(status::text, '<null>') as status,
  count(*)::bigint as reservation_count
from public.inventory_reservations
group by 1
order by reservation_count desc;


-- ============================================================
-- G. ROUTE STOPS SUMMARY
-- ============================================================
select
  coalesce(stop_type::text, '<null>') as stop_type,
  coalesce(status::text, '<null>') as status,
  count(*)::bigint as stop_count
from public.route_stops
group by 1,2
order by stop_type, stop_count desc;


-- ============================================================
-- H. OPTIONAL MODULE ROW COUNTS
-- Dynamic SQL avoids crashing when a table is missing.
-- ============================================================
create temporary table if not exists _live_audit_optional_counts (
  domain_name text,
  object_name text,
  live_status text,
  row_count bigint
) on commit drop;

truncate table _live_audit_optional_counts;

do $$
declare
  r record;
  v_count bigint;
begin
  for r in
    select *
    from (values
      ('Notifications','notification_event_types'),
      ('Notifications','notification_rules'),
      ('Notifications','notification_templates'),
      ('Notifications','notification_preferences'),
      ('Notifications','notification_messages'),
      ('Notifications','notification_deliveries'),
      ('CRM','crm_conversations'),
      ('CRM','crm_contact_identities'),
      ('CRM','crm_messages'),
      ('CRM','crm_notes'),
      ('CRM','crm_pipeline_history'),
      ('CRM','booking_leads'),
      ('Tasks','tasks')
    ) as x(domain_name, object_name)
  loop
    if to_regclass('public.' || r.object_name) is null then
      insert into _live_audit_optional_counts
      values (r.domain_name, r.object_name, 'MISSING', null);
    else
      execute format('select count(*) from public.%I', r.object_name)
        into v_count;
      insert into _live_audit_optional_counts
      values (r.domain_name, r.object_name, 'PRESENT', v_count);
    end if;
  end loop;
end $$;

select *
from _live_audit_optional_counts
order by domain_name, object_name;


-- ============================================================
-- I. NOTIFICATION OBJECT DETAIL (safe even if module absent)
-- ============================================================
select
  'notification module present?' as check_name,
  case
    when to_regclass('public.notification_event_types') is null
      then 'NO — migration 068 core is not present in live DB'
    else 'YES'
  end as result;


-- ============================================================
-- J. CRM CORE DETAIL
-- ============================================================
select
  'crm core present?' as check_name,
  case
    when to_regclass('public.crm_conversations') is null
      then 'NO — CRM core schema is not present in live DB'
    else 'YES'
  end as result;


-- ============================================================
-- K. WORKING TIME CONFIRMED LIVE TABLES
-- ============================================================
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in (
    'staff_time_entries',
    'staff_time_breaks',
    'staff_time_adjustments',
    'staff_pay_rates',
    'staff_break_premium_decisions',
    'staff_break_premium_history'
  )
order by table_name;

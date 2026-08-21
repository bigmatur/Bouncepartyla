
-- Bounce Party LA Booking System
-- Live DB Baseline v2 audit
-- READ ONLY. Safe to run in Supabase SQL Editor.

-- A. Core tables present
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in (
    'bookings','booking_items','booking_leads','customers',
    'payments','contracts',
    'inventory_items','inventory_units','inventory_reservations',
    'route_stops','route_drivers',
    'notification_event_types','notification_rules','notification_templates',
    'notification_messages','notification_deliveries','notification_preferences',
    'crm_conversations','crm_messages','crm_contact_identities','crm_notes','crm_pipeline_history'
  )
order by table_name;

-- B. Key booking/payment/contract RPCs
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and (
    p.proname ilike '%booking%'
    or p.proname ilike '%payment%'
    or p.proname ilike '%contract%'
  )
order by p.proname;

-- C. Inventory RPCs / functions
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and (
    p.proname ilike '%inventory%'
    or p.proname ilike '%reservation%'
    or p.proname ilike '%availability%'
  )
order by p.proname;

-- D. Notifications RPCs/functions
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname ilike '%notification%'
order by p.proname;

-- E. CRM tables and row counts
select 'crm_conversations' as object, count(*)::bigint as row_count from public.crm_conversations
union all
select 'crm_messages', count(*)::bigint from public.crm_messages
union all
select 'crm_contact_identities', count(*)::bigint from public.crm_contact_identities
union all
select 'crm_notes', count(*)::bigint from public.crm_notes
union all
select 'crm_pipeline_history', count(*)::bigint from public.crm_pipeline_history
order by object;

-- F. Notification tables and row counts
select 'notification_event_types' as object, count(*)::bigint as row_count from public.notification_event_types
union all
select 'notification_rules', count(*)::bigint from public.notification_rules
union all
select 'notification_templates', count(*)::bigint from public.notification_templates
union all
select 'notification_messages', count(*)::bigint from public.notification_messages
union all
select 'notification_deliveries', count(*)::bigint from public.notification_deliveries
union all
select 'notification_preferences', count(*)::bigint from public.notification_preferences
order by object;

-- G. Booking status/source snapshot
select
  coalesce(status::text,'<null>') as status,
  coalesce(booking_source,'<null>') as booking_source,
  count(*)::bigint as count
from public.bookings
group by 1,2
order by 1,2;

-- H. Potential hidden paid self-service anomalies
select
  b.id,
  b.booking_number,
  b.status::text as status,
  b.booking_source,
  b.total_amount,
  b.deposit_amount,
  b.amount_paid,
  b.balance_due,
  b.payment_status::text as payment_status,
  b.contract_status::text as contract_status,
  coalesce((
    select sum(greatest(coalesce(p.amount,0)-coalesce(p.tip_amount,0),0))
    from public.payments p
    where p.booking_id=b.id
      and lower(coalesce(p.status::text,'')) in ('paid','completed','succeeded')
  ),0) as ledger_paid
from public.bookings b
where b.booking_source='customer_self_service'
  and b.status::text='pending_deposit'
order by b.created_at desc
limit 50;

-- I. Contracts health
select
  coalesce(status::text,'<null>') as status,
  count(*)::bigint as count
from public.contracts
group by 1
order by 1;

-- J. Inventory reservation health
select
  coalesce(status::text,'<null>') as status,
  count(*)::bigint as count
from public.inventory_reservations
group by 1
order by 1;

-- K. Route stops health
select
  stop_type::text as stop_type,
  status::text as status,
  count(*)::bigint as count
from public.route_stops
group by 1,2
order by 1,2;

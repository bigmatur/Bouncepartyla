\set ON_ERROR_STOP on

begin;

-- Security invariants for the operational payment-report table and RPC.
do $$
declare
  v_rls_enabled boolean;
begin
  select c.relrowsecurity
    into v_rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'route_booking_payment_reports'
    and c.relkind = 'r';

  if not coalesce(v_rls_enabled, false) then
    raise exception 'FAIL security: route_booking_payment_reports must have RLS enabled';
  end if;

  if has_table_privilege(
    'anon',
    'public.route_booking_payment_reports',
    'SELECT, INSERT, UPDATE, DELETE'
  ) then
    raise exception 'FAIL security: anon must not have direct payment-report table privileges';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.route_booking_payment_reports',
    'SELECT, INSERT, UPDATE, DELETE'
  ) then
    raise exception 'FAIL security: authenticated must not have direct payment-report table privileges';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.route_booking_payment_reports',
    'SELECT, INSERT, UPDATE, DELETE'
  ) then
    raise exception 'FAIL security: service_role must retain payment-report table access';
  end if;

  if has_function_privilege(
    'anon',
    'public.mark_my_route_stop_payment_collected(uuid,numeric,text)',
    'EXECUTE'
  ) then
    raise exception 'FAIL security: anon must not execute mark_my_route_stop_payment_collected';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.mark_my_route_stop_payment_collected(uuid,numeric,text)',
    'EXECUTE'
  ) then
    raise exception 'FAIL security: authenticated must execute mark_my_route_stop_payment_collected';
  end if;
end
$$;

-- Driver auth fixtures
insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'authenticated',
    'authenticated',
    'driver.one.varianta@local.test',
    'not-used',
    now(),
    now(),
    now()
  ),
  (
    '66666666-1111-4111-8111-111111111111'::uuid,
    'authenticated',
    'authenticated',
    'driver.two.varianta@local.test',
    'not-used',
    now(),
    now(),
    now()
  )
on conflict (id) do update
set updated_at = now();

insert into public.profiles (id, auth_user_id, role, is_active, first_name, last_name)
values
  ('11111111-2222-4333-8444-555555555555'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'driver', true, 'Driver', 'One'),
  ('66666666-2222-4333-8444-555555555555'::uuid, '66666666-1111-4111-8111-111111111111'::uuid, 'driver', true, 'Driver', 'Two')
on conflict (auth_user_id) do update
set role = excluded.role,
    is_active = true,
    updated_at = now();

insert into public.route_drivers (id, name, color, active, sort_order, auth_user_id)
values
  ('77777777-2222-4333-8444-555555555555'::uuid, 'Driver One', '#223344', true, 1, '11111111-1111-4111-8111-111111111111'::uuid),
  ('88888888-2222-4333-8444-555555555555'::uuid, 'Driver Two', '#334455', true, 1, '66666666-1111-4111-8111-111111111111'::uuid)
on conflict (id) do update
set active = true,
    auth_user_id = excluded.auth_user_id,
    updated_at = now();

-- Common helper bookings
insert into public.bookings (
  id,
  status,
  event_date,
  subtotal,
  modifiers_total,
  delivery_fee,
  discount_amount,
  taxable_amount,
  tax_rate,
  tax_amount,
  total_amount,
  deposit_amount,
  amount_paid,
  balance_due,
  payment_status,
  contract_status,
  booking_source
)
values
  ('a1111111-2222-4333-8444-555555555555'::uuid, 'booked'::public.booking_status, current_date, 0,0,0,0,0,0,0,0,0,0,120, 'unpaid'::public.payment_status, 'not_sent'::public.contract_status, 'admin'),
  ('b1111111-2222-4333-8444-555555555555'::uuid, 'booked'::public.booking_status, current_date, 0,0,0,0,0,0,0,0,0,0,200, 'unpaid'::public.payment_status, 'not_sent'::public.contract_status, 'admin'),
  ('c1111111-2222-4333-8444-555555555555'::uuid, 'booked'::public.booking_status, current_date, 0,0,0,0,0,0,0,0,0,0,100, 'unpaid'::public.payment_status, 'not_sent'::public.contract_status, 'admin'),
  ('d1111111-2222-4333-8444-555555555555'::uuid, 'booked'::public.booking_status, current_date, 0,0,0,0,0,0,0,0,0,0,90,  'unpaid'::public.payment_status, 'not_sent'::public.contract_status, 'admin'),
  ('e1111111-2222-4333-8444-555555555555'::uuid, 'booked'::public.booking_status, current_date, 0,0,0,0,0,0,0,0,0,0,70,  'unpaid'::public.payment_status, 'not_sent'::public.contract_status, 'admin'),
  ('f1111111-2222-4333-8444-555555555555'::uuid, 'booked'::public.booking_status, current_date, 0,0,0,0,0,0,0,0,0,0,110, 'unpaid'::public.payment_status, 'not_sent'::public.contract_status, 'admin'),
  ('cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid, 'booked'::public.booking_status, current_date, 0,0,0,0,0,0,0,0,0,0,150, 'unpaid'::public.payment_status, 'not_sent'::public.contract_status, 'admin')
on conflict (id) do update
set status = 'booked'::public.booking_status,
    updated_at = now();

-- Route stop fixtures:
-- A: valid delivery report by another driver and another date should allow pickup completion.
insert into public.route_stops (
  id, booking_id, stop_type, status, sequence, sort_order, stop_date, driver_name,
  payment_collected, payment_collected_amount, proof_photo_uploaded
)
values
  ('88647a58-5629-5c3b-905c-f50ef4927a01'::uuid, 'a1111111-2222-4333-8444-555555555555'::uuid, 'delivery'::public.route_stop_type, 'completed'::public.route_stop_status, 1, 10, current_date - 1, 'Driver Two', true, 120, true),
  ('a7117c2b-57a7-57ea-ae23-9accff3bce76'::uuid, 'a1111111-2222-4333-8444-555555555555'::uuid, 'pickup'::public.route_stop_type,   'arrived'::public.route_stop_status, 2, 20, current_date,     'Driver One', false, 0,   true)
on conflict (id) do update
set status = excluded.status,
    stop_date = excluded.stop_date,
    driver_name = excluded.driver_name,
    payment_collected = excluded.payment_collected,
    payment_collected_amount = excluded.payment_collected_amount,
    proof_photo_uploaded = excluded.proof_photo_uploaded,
    updated_at = now();

-- B: partial report should not allow pickup completion.
insert into public.route_stops (
  id, booking_id, stop_type, status, sequence, sort_order, stop_date, driver_name,
  payment_collected, payment_collected_amount, proof_photo_uploaded
)
values
  ('26d4f932-dfec-5440-846f-8e037e521032'::uuid, 'b1111111-2222-4333-8444-555555555555'::uuid, 'delivery'::public.route_stop_type, 'installed'::public.route_stop_status, 1, 10, current_date, 'Driver One', true, 80,  true),
  ('3c2eafdf-876f-5f2b-a535-000565815d88'::uuid, 'b1111111-2222-4333-8444-555555555555'::uuid, 'pickup'::public.route_stop_type,   'arrived'::public.route_stop_status, 2, 20, current_date, 'Driver One', false, 0,  true)
on conflict (id) do update
set status = excluded.status,
    driver_name = excluded.driver_name,
    payment_collected = excluded.payment_collected,
    payment_collected_amount = excluded.payment_collected_amount,
    proof_photo_uploaded = excluded.proof_photo_uploaded,
    updated_at = now();

-- C: cancelled delivery report should not allow pickup completion.
insert into public.route_stops (
  id, booking_id, stop_type, status, sequence, sort_order, stop_date, driver_name,
  payment_collected, payment_collected_amount, proof_photo_uploaded
)
values
  ('c3a30f68-d584-56d9-b2ba-0937646e5823'::uuid, 'c1111111-2222-4333-8444-555555555555'::uuid, 'delivery'::public.route_stop_type, 'cancelled'::public.route_stop_status, 1, 10, current_date, 'Driver One', true, 100, true),
  ('bf0ba645-a8ab-5fbc-9210-e28775a0199c'::uuid, 'c1111111-2222-4333-8444-555555555555'::uuid, 'pickup'::public.route_stop_type,    'arrived'::public.route_stop_status,  2, 20, current_date, 'Driver One', false, 0,   true)
on conflict (id) do update
set status = excluded.status,
    driver_name = excluded.driver_name,
    payment_collected = excluded.payment_collected,
    payment_collected_amount = excluded.payment_collected_amount,
    proof_photo_uploaded = excluded.proof_photo_uploaded,
    updated_at = now();

-- D: outdated report (older valid then newer voided) should not allow completion.
insert into public.route_stops (
  id, booking_id, stop_type, status, sequence, sort_order, stop_date, driver_name,
  payment_collected, payment_collected_amount, proof_photo_uploaded
)
values
  ('f8c88409-9b1c-59be-a3d4-620bfc8e9ab0'::uuid, 'd1111111-2222-4333-8444-555555555555'::uuid, 'delivery'::public.route_stop_type, 'completed'::public.route_stop_status, 1, 10, current_date, 'Driver One', true, 90, true),
  ('a554b684-04b7-5b96-8ee4-5321ea447bb8'::uuid, 'd1111111-2222-4333-8444-555555555555'::uuid, 'pickup'::public.route_stop_type,   'arrived'::public.route_stop_status, 2, 20, current_date, 'Driver One', false, 0,  true)
on conflict (id) do update
set status = excluded.status,
    driver_name = excluded.driver_name,
    payment_collected = excluded.payment_collected,
    payment_collected_amount = excluded.payment_collected_amount,
    proof_photo_uploaded = excluded.proof_photo_uploaded,
    updated_at = now();

-- E: fallback path without report-row (legacy data) should still allow completion if delivery payment covers due.
insert into public.route_stops (
  id, booking_id, stop_type, status, sequence, sort_order, stop_date, driver_name,
  payment_collected, payment_collected_amount, proof_photo_uploaded
)
values
  ('8d552696-bc83-5527-b487-fd502add7f78'::uuid, 'e1111111-2222-4333-8444-555555555555'::uuid, 'delivery'::public.route_stop_type, 'installed'::public.route_stop_status, 1, 10, current_date, 'Driver One', true, 70, true),
  ('616457a2-0258-5d5d-8f06-8295d00ccbb5'::uuid, 'e1111111-2222-4333-8444-555555555555'::uuid, 'pickup'::public.route_stop_type,   'arrived'::public.route_stop_status, 2, 20, current_date, 'Driver One', false, 0,  true)
on conflict (id) do update
set status = excluded.status,
    driver_name = excluded.driver_name,
    payment_collected = excluded.payment_collected,
    payment_collected_amount = excluded.payment_collected_amount,
    proof_photo_uploaded = excluded.proof_photo_uploaded,
    updated_at = now();

-- F: uncompleted delivery (arrived) should not unlock pickup even with full reported amount.
insert into public.route_stops (
  id, booking_id, stop_type, status, sequence, sort_order, stop_date, driver_name,
  payment_collected, payment_collected_amount, proof_photo_uploaded
)
values
  ('ce25839b-8228-5e0c-bb02-f5bcf07f52f8'::uuid, 'f1111111-2222-4333-8444-555555555555'::uuid, 'delivery'::public.route_stop_type, 'arrived'::public.route_stop_status, 1, 10, current_date, 'Driver One', true, 110, true),
  ('c4d2b6fa-4143-51e5-b291-c8bd182de0f9'::uuid, 'f1111111-2222-4333-8444-555555555555'::uuid, 'pickup'::public.route_stop_type,   'arrived'::public.route_stop_status, 2, 20, current_date, 'Driver One', false, 0,   true)
on conflict (id) do update
set status = excluded.status,
    driver_name = excluded.driver_name,
    payment_collected = excluded.payment_collected,
    payment_collected_amount = excluded.payment_collected_amount,
    proof_photo_uploaded = excluded.proof_photo_uploaded,
    updated_at = now();

-- G: partial then additional payment report flow should be allowed across assigned stops.
insert into public.route_stops (
  id, booking_id, stop_type, status, sequence, sort_order, stop_date, driver_name,
  payment_collected, payment_collected_amount, proof_photo_uploaded
)
values
  ('0ac48646-1024-5223-b960-ea3479a82b76'::uuid, 'cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid, 'delivery'::public.route_stop_type, 'installed'::public.route_stop_status, 1, 10, current_date, 'Driver One', false, 0, true),
  ('df093f92-596a-5acc-b676-09d8b215657e'::uuid, 'cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid, 'pickup'::public.route_stop_type,   'arrived'::public.route_stop_status, 2, 20, current_date, 'Driver One', false, 0, true)
on conflict (id) do update
set status = excluded.status,
    driver_name = excluded.driver_name,
    payment_collected = excluded.payment_collected,
    payment_collected_amount = excluded.payment_collected_amount,
    proof_photo_uploaded = excluded.proof_photo_uploaded,
    updated_at = now();

-- Explicit report rows
insert into public.route_booking_payment_reports (
  id,
  booking_id,
  amount_due_at_report,
  amount_reported,
  reported_by_driver_name,
  source_route_stop_id,
  payment_method,
  report_state,
  created_at,
  updated_at
)
values
  -- A: valid and pending admin reconciliation
  ('47564233-3e28-5374-9431-1454f5cedaeb'::uuid, 'a1111111-2222-4333-8444-555555555555'::uuid, 120, 120, 'Driver Two', '88647a58-5629-5c3b-905c-f50ef4927a01'::uuid, 'cash', 'requires_review', now() - interval '30 min', now() - interval '30 min'),
  -- B: partial
  ('ebc99b7c-009e-50c4-8975-87add81716f3'::uuid, 'b1111111-2222-4333-8444-555555555555'::uuid, 200, 80, 'Driver One', '26d4f932-dfec-5440-846f-8e037e521032'::uuid, 'cash', 'requires_review', now() - interval '25 min', now() - interval '25 min'),
  -- C: cancelled delivery source stop
  ('56a9d5b1-8f9f-58b9-8b3c-c1f878b4860e'::uuid, 'c1111111-2222-4333-8444-555555555555'::uuid, 100, 100, 'Driver One', 'c3a30f68-d584-56d9-b2ba-0937646e5823'::uuid, 'cash', 'confirmed_complete', now() - interval '20 min', now() - interval '20 min'),
  -- D: older valid
  ('4b22c01a-a189-507f-b4f3-bc4a57bcd6b6'::uuid, 'd1111111-2222-4333-8444-555555555555'::uuid, 90, 90, 'Driver One', 'f8c88409-9b1c-59be-a3d4-620bfc8e9ab0'::uuid, 'cash', 'confirmed_complete', now() - interval '15 min', now() - interval '15 min'),
  -- D: newer voided/outdated
  ('5494e571-ddb2-59d0-9801-422ea24dd79d'::uuid, 'd1111111-2222-4333-8444-555555555555'::uuid, 90, 90, 'Driver One', 'f8c88409-9b1c-59be-a3d4-620bfc8e9ab0'::uuid, 'cash', 'voided', now() - interval '10 min', now() - interval '10 min'),
  -- F: full amount but source delivery is not installed/completed
  ('ead58f29-4c39-5e82-a16b-537c842034af'::uuid, 'f1111111-2222-4333-8444-555555555555'::uuid, 110, 110, 'Driver One', 'ce25839b-8228-5e0c-bb02-f5bcf07f52f8'::uuid, 'cash', 'confirmed_complete', now() - interval '8 min', now() - interval '8 min')
on conflict (id) do nothing;

-- Execute as Driver One
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111', true);


-- G6: full payment on Delivery must allow installation.
INSERT INTO public.bookings (
  id, status, event_date, subtotal, modifiers_total,
  delivery_fee, discount_amount, taxable_amount, tax_rate,
  tax_amount, total_amount, deposit_amount, amount_paid,
  balance_due, payment_status, contract_status, booking_source
)
VALUES (
  '11111111-aaaa-4aaa-8aaa-111111111111'::uuid,
  'booked', current_date, 0,0,0,0,0,0,0,0,0,0,150,
  'unpaid', 'not_sent', 'admin'
);

INSERT INTO public.route_stops (
  id, booking_id, stop_type, status, sequence, sort_order,
  stop_date, driver_name, payment_collected,
  payment_collected_amount, proof_photo_uploaded
)
VALUES (
  '22222222-aaaa-4aaa-8aaa-222222222222'::uuid,
  '11111111-aaaa-4aaa-8aaa-111111111111'::uuid,
  'delivery', 'arrived', 1, 10, current_date,
  'Driver One', false, 0, true
);

DO $g6$
DECLARE
  v_result jsonb;
  v_balance numeric;
BEGIN
  v_result := public.mark_my_route_stop_payment_collected(
    '22222222-aaaa-4aaa-8aaa-222222222222'::uuid,
    150, 'cash'
  );

  IF coalesce((v_result ->> 'already_reported')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL G6: full payment not registered';
  END IF;

  PERFORM public.update_my_route_stop_status(
    '22222222-aaaa-4aaa-8aaa-222222222222'::uuid,
    'installed'
  );

  SELECT balance_due INTO v_balance
  FROM public.bookings
  WHERE id = '11111111-aaaa-4aaa-8aaa-111111111111'::uuid;

  IF v_balance IS DISTINCT FROM 150 THEN
    RAISE EXCEPTION 'FAIL G6: booking balance changed';
  END IF;
END;
$g6$;

-- G1: partial payment report on first stop should create requires_review.
do $$
declare
  v_result jsonb;
  v_state text;
  v_amount numeric;
  v_reported boolean;
  v_needs_review boolean;
begin
  v_result := public.mark_my_route_stop_payment_collected(
    '0ac48646-1024-5223-b960-ea3479a82b76'::uuid,
    100,
    'cash'
  );

  if coalesce((v_result ->> 'already_reported')::boolean, false) then
    raise exception 'FAIL scenario G1: first partial report was treated as already reported';
  end if;

  if coalesce((v_result ->> 'payment_collected_amount')::numeric, -1) <> 100
     or coalesce((v_result ->> 'booking_payment_reported_amount')::numeric, -1) <> 100
  then
    raise exception 'FAIL scenario G1: incorrect stop/booking amounts in RPC response';
  end if;

  select r.report_state, r.amount_reported
    into v_state, v_amount
  from public.route_booking_payment_reports r
  where r.booking_id = 'cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid
  order by r.created_at desc, r.id desc
  limit 1;

  if v_state <> 'requires_review' or coalesce(v_amount, 0) <> 100 then
    raise exception 'FAIL scenario G1: expected requires_review/100, got %/%', v_state, v_amount;
  end if;

  -- Partial delivery report alone must not unlock pickup.
  begin
    perform public.update_my_route_stop_status(
      'df093f92-596a-5acc-b676-09d8b215657e'::uuid,
      'picked_up'
    );
    raise exception 'FAIL scenario G1: pickup completed on partial delivery report';
  exception
    when others then
      if position('collect payment before completing this stop' in lower(sqlerrm)) = 0 then
        raise;
      end if;
  end;

  select r.payment_reported, r.payment_report_needs_review
    into v_reported, v_needs_review
  from public.get_my_driver_booking_payment_reports(
    array['cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid]
  ) r;

  if coalesce(v_reported, false) then
    raise exception 'FAIL scenario G1: readonly RPC marked partial report as fully reported';
  end if;

  if not coalesce(v_needs_review, false) then
    raise exception 'FAIL scenario G1: readonly RPC did not mark partial report as needs_review';
  end if;
end
$$;

-- G2: additional payment report on second stop should be accepted and move latest active state to reported.
do $$
declare
  v_result jsonb;
  v_state text;
  v_amount numeric;
  v_active_count integer;
  v_source_stop uuid;
  v_reported boolean;
  v_needs_review boolean;
  v_pickup_status public.route_stop_status;
  v_balance_due numeric;
begin
  v_result := public.mark_my_route_stop_payment_collected(
    'df093f92-596a-5acc-b676-09d8b215657e'::uuid,
    50,
    'cash'
  );

  if coalesce((v_result ->> 'already_reported')::boolean, true) then
    raise exception 'FAIL scenario G2: additional payment report was blocked';
  end if;

  if coalesce((v_result ->> 'payment_collected_amount')::numeric, -1) <> 50
     or coalesce((v_result ->> 'booking_payment_reported_amount')::numeric, -1) <> 150
  then
    raise exception 'FAIL scenario G2: expected stop amount 50 and booking amount 150';
  end if;

  select r.report_state, r.amount_reported, r.source_route_stop_id
    into v_state, v_amount, v_source_stop
  from public.route_booking_payment_reports r
  where r.booking_id = 'cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid
    and r.report_state in ('reported', 'confirmed_complete', 'requires_review')
  order by r.created_at desc, r.id desc
  limit 1;

  if v_state <> 'reported' or coalesce(v_amount, 0) <> 150 then
    raise exception 'FAIL scenario G2: expected reported/150, got %/%', v_state, v_amount;
  end if;

  if v_source_stop <> '0ac48646-1024-5223-b960-ea3479a82b76'::uuid then
    raise exception 'FAIL scenario G2: cumulative report source must remain delivery stop';
  end if;

  select count(*)
    into v_active_count
  from public.route_booking_payment_reports r
  where r.booking_id = 'cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid
    and r.report_state in ('reported', 'confirmed_complete', 'requires_review');

  if v_active_count <> 1 then
    raise exception 'FAIL scenario G2: expected exactly one active report, got %', v_active_count;
  end if;

  select r.payment_reported, r.payment_report_needs_review
    into v_reported, v_needs_review
  from public.get_my_driver_booking_payment_reports(
    array['cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid]
  ) r;

  if not coalesce(v_reported, false) or coalesce(v_needs_review, false) then
    raise exception 'FAIL scenario G2: readonly RPC state mismatch after cumulative report';
  end if;

  -- Completion should now be allowed through valid booking-level report checks.
  perform public.update_my_route_stop_status(
    'df093f92-596a-5acc-b676-09d8b215657e'::uuid,
    'picked_up'
  );

  select rs.status into v_pickup_status
  from public.route_stops rs
  where rs.id = 'df093f92-596a-5acc-b676-09d8b215657e'::uuid;

  if v_pickup_status <> 'picked_up'::public.route_stop_status then
    raise exception 'FAIL scenario G2: pickup was not completed after valid cumulative report';
  end if;

  -- Operational report does not mutate booking financials.
  select b.balance_due into v_balance_due
  from public.bookings b
  where b.id = 'cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid;

  if coalesce(v_balance_due, 0) <> 150 then
    raise exception 'FAIL scenario G2: bookings.balance_due was unexpectedly changed to %', v_balance_due;
  end if;
end
$$;

-- G3: idempotent resend of same report should not create duplicate rows.
do $$
declare
  v_result jsonb;
  v_count_before integer;
  v_count_after integer;
  v_updated_at_before timestamptz;
  v_updated_at_after timestamptz;
begin
  select count(*)
    into v_count_before
  from public.route_booking_payment_reports r
  where r.booking_id = 'cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid;

  select updated_at
    into v_updated_at_before
  from public.route_stops
  where id = 'df093f92-596a-5acc-b676-09d8b215657e'::uuid;

  v_result := public.mark_my_route_stop_payment_collected(
    'df093f92-596a-5acc-b676-09d8b215657e'::uuid,
    50,
    'cash'
  );

  if not coalesce((v_result ->> 'already_reported')::boolean, false) then
    raise exception 'FAIL scenario G3: expected idempotent already_reported=true';
  end if;

  if coalesce((v_result ->> 'payment_collected_amount')::numeric, -1) <> 50
     or coalesce((v_result ->> 'booking_payment_reported_amount')::numeric, -1) <> 150
     or (v_result ->> 'payment_collected_method') is distinct from 'cash'
  then
    raise exception 'FAIL scenario G3: incorrect idempotent stop/booking amounts or method';
  end if;

  select count(*)
    into v_count_after
  from public.route_booking_payment_reports r
  where r.booking_id = 'cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid;

  select updated_at
    into v_updated_at_after
  from public.route_stops
  where id = 'df093f92-596a-5acc-b676-09d8b215657e'::uuid;

  if v_count_before <> v_count_after then
    raise exception 'FAIL scenario G3: duplicate report row was created (% -> %)', v_count_before, v_count_after;
  end if;

  if v_updated_at_before is distinct from v_updated_at_after then
    raise exception 'FAIL scenario G3: idempotent resend updated the route stop';
  end if;
end
$$;

-- G3b: an idempotent resend cannot silently change the stop payment method.
do $$
begin
  begin
    perform public.mark_my_route_stop_payment_collected(
      'df093f92-596a-5acc-b676-09d8b215657e'::uuid,
      50,
      'venmo'
    );
  exception
    when others then
      if position('already reported for this stop' in lower(sqlerrm)) > 0 then
        return;
      end if;
      raise;
  end;

  raise exception 'FAIL scenario G3b: payment method changed on idempotent resend';
end
$$;


-- G4: voided report must not be accepted as an idempotent resend.
UPDATE public.route_booking_payment_reports
SET report_state = 'voided',
    updated_at = now()
WHERE booking_id = 'cd35202a-1851-58fa-aa3d-0e9dbb79f11a'::uuid
  AND report_state IN ('reported', 'confirmed_complete', 'requires_review');

DO $test_g4$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    v_result := public.mark_my_route_stop_payment_collected(
      'df093f92-596a-5acc-b676-09d8b215657e'::uuid,
      50,
      'cash'
    );
  EXCEPTION WHEN OTHERS THEN
    IF position('administrator' IN lower(SQLERRM)) > 0
       OR position('voided' IN lower(SQLERRM)) > 0 THEN
      RETURN;
    END IF;
    RAISE;
  END;

  RAISE EXCEPTION 'FAIL scenario G4: voided payment was accepted';
END;
$test_g4$;

-- G5: stale pickup marker must not bypass a voided report.
UPDATE public.route_stops
SET status = 'scheduled',
    payment_collected = true,
    payment_collected_amount = 150
WHERE id = 'df093f92-596a-5acc-b676-09d8b215657e'::uuid;
DO $g5$
BEGIN
  BEGIN
    PERFORM public.update_my_route_stop_status(
      'df093f92-596a-5acc-b676-09d8b215657e'::uuid, 'picked_up');
  EXCEPTION WHEN OTHERS THEN
    IF position('collect payment before completing this stop'
      IN lower(SQLERRM)) > 0 THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'FAIL scenario G5: stale marker accepted';
END;
$g5$;

-- G7: voided report blocks fresh payment from another stop.
UPDATE public.route_stops
SET payment_collected = false, payment_collected_amount = 0
WHERE id = '0ac48646-1024-5223-b960-ea3479a82b76'::uuid;
DO $g7$
BEGIN
  BEGIN
    PERFORM public.mark_my_route_stop_payment_collected(
      '0ac48646-1024-5223-b960-ea3479a82b76'::uuid,
      150,
      'cash'
    );
  EXCEPTION WHEN OTHERS THEN
    IF position('voided' IN lower(SQLERRM)) > 0
       OR position('administrator' IN lower(SQLERRM)) > 0
    THEN
      RETURN;
    END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'FAIL scenario G7: new report accepted after void';
END;
$g7$;

-- G8: full Delivery report must not duplicate payment on Pickup.
DO $g8$
DECLARE
  v_result jsonb;
  v_stop_paid boolean;
  v_stop_amount numeric;
  v_report_count integer;
  v_report_amount numeric;
BEGIN
  v_result := public.mark_my_route_stop_payment_collected(
    'a7117c2b-57a7-57ea-ae23-9accff3bce76'::uuid,
    120,
    'cash'
  );

  IF coalesce((v_result ->> 'payment_collected')::boolean, false)
     OR NOT coalesce((v_result ->> 'already_reported')::boolean, false)
     OR coalesce((v_result ->> 'payment_collected_amount')::numeric, 0) <> 0
     OR coalesce((v_result ->> 'booking_payment_reported_amount')::numeric, 0) <> 120
  THEN
    RAISE EXCEPTION 'FAIL G8: incorrect already-reported response';
  END IF;

  SELECT coalesce(payment_collected, false), coalesce(payment_collected_amount, 0)
    INTO v_stop_paid, v_stop_amount
  FROM public.route_stops
  WHERE id = 'a7117c2b-57a7-57ea-ae23-9accff3bce76'::uuid;

  IF v_stop_paid OR v_stop_amount <> 0 THEN
    RAISE EXCEPTION 'FAIL G8: pickup stop was marked paid';
  END IF;

  SELECT count(*), max(amount_reported)
    INTO v_report_count, v_report_amount
  FROM public.route_booking_payment_reports
  WHERE booking_id = 'a1111111-2222-4333-8444-555555555555'::uuid
    AND report_state IN ('reported', 'confirmed_complete', 'requires_review');

  IF v_report_count <> 1 OR v_report_amount <> 120 THEN
    RAISE EXCEPTION 'FAIL G8: payment report duplicated or changed';
  END IF;
END;
$g8$;
-- A: should pass (same booking, valid delivery report, other driver/date)
select public.update_my_route_stop_status(
  'a7117c2b-57a7-57ea-ae23-9accff3bce76'::uuid,
  'picked_up'
) as scenario_a_result;

do $$
declare
  v_status public.route_stop_status;
begin
  select rs.status into v_status
  from public.route_stops rs
  where rs.id = 'a7117c2b-57a7-57ea-ae23-9accff3bce76'::uuid;

  if v_status <> 'picked_up'::public.route_stop_status then
    raise exception 'FAIL scenario A: pickup did not complete despite valid delivery report';
  end if;
end
$$;

-- B: should fail (partial report)
do $$
begin
  perform public.update_my_route_stop_status(
    '3c2eafdf-876f-5f2b-a535-000565815d88'::uuid,
    'picked_up'
  );
  raise exception 'FAIL scenario B: pickup completed with partial report';
exception
  when others then
    if position('collect payment before completing this stop' in lower(sqlerrm)) = 0 then
      raise;
    end if;
end
$$;

-- C: should fail (report source delivery is cancelled)
do $$
begin
  perform public.update_my_route_stop_status(
    'bf0ba645-a8ab-5fbc-9210-e28775a0199c'::uuid,
    'picked_up'
  );
  raise exception 'FAIL scenario C: pickup completed with cancelled delivery report';
exception
  when others then
    if position('collect payment before completing this stop' in lower(sqlerrm)) = 0 then
      raise;
    end if;
end
$$;

-- D: should fail (latest report is voided/outdated)
do $$
begin
  perform public.update_my_route_stop_status(
    'a554b684-04b7-5b96-8ee4-5321ea447bb8'::uuid,
    'picked_up'
  );
  raise exception 'FAIL scenario D: pickup completed with outdated/voided latest report';
exception
  when others then
    if position('collect payment before completing this stop' in lower(sqlerrm)) = 0 then
      raise;
    end if;
end
$$;

-- E: should pass via fallback (no report row, legacy delivery marker covers balance)
select public.update_my_route_stop_status(
  '616457a2-0258-5d5d-8f06-8295d00ccbb5'::uuid,
  'picked_up'
) as scenario_e_result;

do $$
declare
  v_status public.route_stop_status;
begin
  select rs.status into v_status
  from public.route_stops rs
  where rs.id = '616457a2-0258-5d5d-8f06-8295d00ccbb5'::uuid;

  if v_status <> 'picked_up'::public.route_stop_status then
    raise exception 'FAIL scenario E: pickup did not complete with valid fallback delivery payment marker';
  end if;
end
$$;

-- F: should fail (source delivery is arrived, not installed/completed)
do $$
begin
  perform public.update_my_route_stop_status(
    'c4d2b6fa-4143-51e5-b291-c8bd182de0f9'::uuid,
    'picked_up'
  );
  raise exception 'FAIL scenario F: pickup completed with uncompleted delivery report source';
exception
  when others then
    if position('collect payment before completing this stop' in lower(sqlerrm)) = 0 then
      raise;
    end if;
end
$$;

rollback;

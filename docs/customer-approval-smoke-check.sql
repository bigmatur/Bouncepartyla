-- Customer approval flow smoke-check (strict)
-- Run in an isolated test DB only. Do NOT run in production.
--
-- Requires two psql sessions for concurrency sections:
--   Session A (customer context)
--   Session B (admin/staff context)
--
-- Replace placeholders before running:
--   :booking_id_primary        -> pending self-service booking with requirements
--   :booking_id_secondary      -> second self-service booking for reject/reset checks
--   :event_date_target         -> date used for park/venue contention diagnostics
--   :customer_auth_user_id     -> auth.users.id of booking owner
--   :admin_auth_user_id        -> auth.users.id of admin/manager reviewer

begin;

create temporary table if not exists smoke_params (
  booking_id_primary uuid not null,
  booking_id_secondary uuid not null,
  event_date_target date not null,
  customer_auth_user_id uuid not null,
  admin_auth_user_id uuid not null
) on commit drop;

truncate table smoke_params;

insert into smoke_params(
  booking_id_primary,
  booking_id_secondary,
  event_date_target,
  customer_auth_user_id,
  admin_auth_user_id
)
values (
  :'booking_id_primary'::uuid,
  :'booking_id_secondary'::uuid,
  :'event_date_target'::date,
  :'customer_auth_user_id'::uuid,
  :'admin_auth_user_id'::uuid
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  (select customer_auth_user_id::text from smoke_params limit 1),
  true
);

-- ---------------------------------------------------------------------------
-- 1) Baseline invariants before approval request
-- ---------------------------------------------------------------------------
do $$
declare
  v_req_count integer;
  v_hold_count integer;
begin
  select count(*) into v_req_count
  from public.booking_inventory_requirements r
  where r.booking_id = (select booking_id_primary from smoke_params limit 1);

  if v_req_count <= 0 then
    raise exception 'ASSERT FAILED: requirements missing for booking %', (select booking_id_primary from smoke_params limit 1);
  end if;

  select count(*) into v_hold_count
  from public.inventory_reservations ir
  where ir.booking_id = (select booking_id_primary from smoke_params limit 1)
    and ir.status = 'reserved'
    and ir.hold_attempt_id is not null
    and coalesce(ir.hold_expires_at, now() - interval '1 second') > now();

  if v_hold_count <> 0 then
    raise exception 'ASSERT FAILED: unexpected active hold reservations before approval request';
  end if;
end;
$$;

select id, status, booking_source, customer_approval_state, customer_approval_revision
from public.bookings
where id = (select booking_id_primary from smoke_params limit 1);

-- ---------------------------------------------------------------------------
-- 2) Request approval idempotency (same input must not bump revision)
-- ---------------------------------------------------------------------------
with r1 as (
  select public.request_my_customer_booking_approval(
    (select booking_id_primary from smoke_params limit 1),
    array['park_venue_capacity']::text[],
    jsonb_build_object('check', 'smoke', 'step', 1),
    'smoke request'
  ) as payload
),
r2 as (
  select public.request_my_customer_booking_approval(
    (select booking_id_primary from smoke_params limit 1),
    array['park_venue_capacity']::text[],
    jsonb_build_object('check', 'smoke', 'step', 1),
    'smoke request'
  ) as payload
)
select
  r1.payload ->> 'status' as first_status,
  r1.payload ->> 'revision' as first_revision,
  r2.payload ->> 'status' as second_status,
  r2.payload ->> 'revision' as second_revision,
  coalesce((r2.payload ->> 'idempotent')::boolean, false) as second_idempotent
from r1, r2;

-- ---------------------------------------------------------------------------
-- 3) Approve booking, validate hold window and active attempt revision binding
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claim.sub',
  (select admin_auth_user_id::text from smoke_params limit 1),
  true
);

select public.approve_customer_booking_approval(
  (select booking_id_primary from smoke_params limit 1),
  null,
  'smoke approve'
) as approve_payload;

do $$
declare
  v_booking record;
  v_attempt record;
begin
  select customer_approval_state, customer_approval_revision, customer_approval_expires_at
  into v_booking
  from public.bookings
  where id = (select booking_id_primary from smoke_params limit 1);

  if coalesce(v_booking.customer_approval_state, '') <> 'approved' then
    raise exception 'ASSERT FAILED: booking not approved';
  end if;

  if v_booking.customer_approval_expires_at is null or v_booking.customer_approval_expires_at <= now() then
    raise exception 'ASSERT FAILED: approval expiry missing or expired';
  end if;

  select id, state, approval_revision, hold_expires_at
  into v_attempt
  from public.booking_checkout_attempts
  where booking_id = (select booking_id_primary from smoke_params limit 1)
    and state in ('holding', 'stripe_bound')
  order by created_at desc
  limit 1;

  if v_attempt.id is null then
    raise exception 'ASSERT FAILED: no active checkout attempt after approval';
  end if;

  if v_attempt.approval_revision is distinct from v_booking.customer_approval_revision then
    raise exception 'ASSERT FAILED: attempt approval_revision mismatch';
  end if;

  if v_attempt.hold_expires_at > v_booking.customer_approval_expires_at then
    raise exception 'ASSERT FAILED: attempt hold exceeds approval expiry';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Expire path and re-request
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claim.sub',
  (select customer_auth_user_id::text from smoke_params limit 1),
  true
);

with latest as (
  select a.id, a.stripe_checkout_session_id
  from public.booking_checkout_attempts a
  where a.booking_id = (select booking_id_primary from smoke_params limit 1)
    and a.state in ('holding', 'stripe_bound')
  order by a.created_at desc
  limit 1
)
select public.release_booking_checkout_attempt_hold(
  (select booking_id_primary from smoke_params limit 1),
  (select id from latest),
  (select stripe_checkout_session_id from latest),
  'smoke_force_expire'
) as release_payload;

select public.expire_customer_booking_approval_if_needed(
  (select booking_id_primary from smoke_params limit 1),
  'smoke_expire'
) as expire_payload;

select id, customer_approval_state, customer_approval_revision, customer_approval_expires_at
from public.bookings
where id = (select booking_id_primary from smoke_params limit 1);

select public.request_my_customer_booking_approval(
  (select booking_id_primary from smoke_params limit 1),
  array['park_venue_capacity']::text[],
  jsonb_build_object('check', 'smoke-rerequest'),
  'request again after expiry'
) as rerequest_payload;

-- ---------------------------------------------------------------------------
-- 5) Reject path must clear active attempts
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claim.sub',
  (select customer_auth_user_id::text from smoke_params limit 1),
  true
);

select public.request_my_customer_booking_approval(
  (select booking_id_secondary from smoke_params limit 1),
  array['last_minute']::text[],
  jsonb_build_object('check', 'smoke-reject'),
  'smoke reject path'
) as request_secondary_payload;

select set_config(
  'request.jwt.claim.sub',
  (select admin_auth_user_id::text from smoke_params limit 1),
  true
);

select public.review_customer_booking_approval(
  (select booking_id_secondary from smoke_params limit 1),
  null,
  'rejected',
  'capacity rejected',
  null
) as reject_payload;

do $$
declare
  v_active_attempts integer;
begin
  select count(*)
  into v_active_attempts
  from public.booking_checkout_attempts a
  where a.booking_id = (select booking_id_secondary from smoke_params limit 1)
    and a.state in ('holding', 'stripe_bound');

  if v_active_attempts <> 0 then
    raise exception 'ASSERT FAILED: active attempts remain after rejection';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Admin reset RPC must be atomic and invalidate attempts
-- ---------------------------------------------------------------------------
select public.reset_customer_booking_approval_for_admin(
  (select booking_id_secondary from smoke_params limit 1),
  'smoke_admin_reset',
  jsonb_build_object('source', 'smoke_sql'),
  true
) as reset_payload;

select id, customer_approval_state, customer_approval_revision, customer_approval_expires_at
from public.bookings
where id = (select booking_id_secondary from smoke_params limit 1);

do $$
declare
  v_before_state text;
  v_before_revision integer;
  v_before_reason text[];
  v_after_state text;
  v_after_revision integer;
  v_after_reason text[];
  v_payload jsonb;
begin
  select customer_approval_state, customer_approval_revision, customer_approval_reasons
  into v_before_state, v_before_revision, v_before_reason
  from public.bookings
  where id = (select booking_id_secondary from smoke_params limit 1);

  perform set_config(
    'request.jwt.claim.sub',
    (select customer_auth_user_id::text from smoke_params limit 1),
    true
  );

  v_payload := public.reset_customer_booking_approval_for_admin(
    (select booking_id_secondary from smoke_params limit 1),
    'smoke_reset_forbidden',
    '{}'::jsonb,
    true
  );

  if coalesce((v_payload ->> 'success')::boolean, true)
     or coalesce(v_payload ->> 'status', '') <> 'forbidden' then
    raise exception 'ASSERT FAILED: expected forbidden reset result';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    (select admin_auth_user_id::text from smoke_params limit 1),
    true
  );

  select customer_approval_state, customer_approval_revision, customer_approval_reasons
  into v_after_state, v_after_revision, v_after_reason
  from public.bookings
  where id = (select booking_id_secondary from smoke_params limit 1);

  if v_after_state is distinct from v_before_state
     or v_after_revision is distinct from v_before_revision
     or v_after_reason is distinct from v_before_reason then
    raise exception 'ASSERT FAILED: booking changed after failed reset';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Finalize idempotency after expiry window
-- ---------------------------------------------------------------------------
do $$
declare
  v_attempt record;
  v_first jsonb;
  v_second jsonb;
begin
  select a.id, a.stripe_checkout_session_id
  into v_attempt
  from public.booking_checkout_attempts a
  where a.booking_id = (select booking_id_primary from smoke_params limit 1)
    and a.state in ('stripe_bound', 'finalized')
    and a.stripe_checkout_session_id is not null
  order by a.created_at desc
  limit 1;

  if v_attempt.id is null then
    raise notice 'SKIP idempotency finalize assertion: no stripe-bound/finalized attempt in fixture';
    return;
  end if;

  v_first := public.finalize_booking_after_temporary_checkout_attempt(
    (select booking_id_primary from smoke_params limit 1),
    v_attempt.id,
    v_attempt.stripe_checkout_session_id
  );

  update public.booking_checkout_attempts
  set hold_expires_at = now() - interval '5 minutes'
  where id = v_attempt.id;

  v_second := public.finalize_booking_after_temporary_checkout_attempt(
    (select booking_id_primary from smoke_params limit 1),
    v_attempt.id,
    v_attempt.stripe_checkout_session_id
  );

  if coalesce((v_second ->> 'success')::boolean, false) is false then
    raise exception 'ASSERT FAILED: second finalize is not idempotent';
  end if;

  if coalesce(v_second ->> 'status', '') not in ('already_finalized', 'confirmed') then
    raise exception 'ASSERT FAILED: unexpected second finalize status %', coalesce(v_second ->> 'status', 'null');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Contention diagnostics
-- ---------------------------------------------------------------------------
select public.evaluate_customer_booking_approval(
  (select event_date_target from smoke_params limit 1),
  '10:00',
  null,
  null
) as evaluation_snapshot;

-- ---------------------------------------------------------------------------
-- 9) Concurrency recipes (manual, two sessions)
-- ---------------------------------------------------------------------------
-- SESSION A:
--   begin;
--   select public.request_my_customer_booking_approval(:'booking_id_primary'::uuid, array['park_venue_capacity']::text[], '{}'::jsonb, 'A');
--   select pg_sleep(2);
--   commit;
--
-- SESSION B (start before A commits):
--   begin;
--   select public.request_my_customer_booking_approval(:'booking_id_primary'::uuid, array['park_venue_capacity']::text[], '{}'::jsonb, 'B');
--   commit;
--
-- Expectation:
--   no duplicate active holds, monotonic revision, and idempotent payloads for identical request inputs.

rollback;

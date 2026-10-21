#!/usr/bin/env bash
set -euo pipefail

DB_URL="${BP_TEST_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/bounceparty_migration_test}"
HOLD_SECONDS="${BP_TEST_HOLD_SECONDS:-3}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd psql
require_cmd uuidgen
require_cmd awk
require_cmd grep
require_cmd mktemp

current_db="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "select current_database();")"
if [[ "$current_db" != "bounceparty_migration_test" ]]; then
  echo "Refusing to run: current_database() is '$current_db', expected 'bounceparty_migration_test'." >&2
  exit 1
fi

gen_uuid() {
  uuidgen | tr '[:upper:]' '[:lower:]'
}

AUTH_ID="$(gen_uuid)"
CUSTOMER_ID="$(gen_uuid)"
CONVERSATION_ID="$(gen_uuid)"
CLIENT_KEY_SAME="$(gen_uuid)"
CLIENT_KEY_CONFLICT="$(gen_uuid)"
EMAIL="im_two_session_$(date +%s)_$RANDOM@example.local"

TMP_DIR="$(mktemp -d)"
S1_SQL="$TMP_DIR/s1.sql"
S2_SQL="$TMP_DIR/s2.sql"
S3_SQL="$TMP_DIR/s3.sql"
S4_SQL="$TMP_DIR/s4.sql"
S1_OUT="$TMP_DIR/s1.out"
S2_OUT="$TMP_DIR/s2.out"
S3_OUT="$TMP_DIR/s3.out"
S4_OUT="$TMP_DIR/s4.out"
S1_ERR="$TMP_DIR/s1.err"
S2_ERR="$TMP_DIR/s2.err"
S3_ERR="$TMP_DIR/s3.err"
S4_ERR="$TMP_DIR/s4.err"

cleanup() {
  set +e
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 <<SQL >/dev/null 2>&1
begin;
delete from public.crm_conversations where id = '$CONVERSATION_ID'::uuid;
delete from public.profiles where auth_user_id = '$AUTH_ID'::uuid;
delete from public.customers where id = '$CUSTOMER_ID'::uuid;
delete from auth.users where id = '$AUTH_ID'::uuid;
rollback;
SQL

  # Run real cleanup outside rollback.
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 <<SQL >/dev/null 2>&1
begin;
delete from public.crm_conversations where id = '$CONVERSATION_ID'::uuid;
delete from public.profiles where auth_user_id = '$AUTH_ID'::uuid;
delete from public.customers where id = '$CUSTOMER_ID'::uuid;
delete from auth.users where id = '$AUTH_ID'::uuid;
commit;
SQL

  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "[setup] Preparing isolated customer/conversation fixtures in $current_db"
psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 <<SQL
begin;
insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values (
  '$AUTH_ID'::uuid,
  'authenticated',
  'authenticated',
  '$EMAIL',
  '42a1047EqJtq98hPqEX7fNZaFWoOeR6V9Ezg4Q8VE3d2r0Rk5v0zzakDxG6',
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb
);

insert into public.customers (
  id,
  auth_user_id,
  first_name,
  last_name,
  full_name,
  phone,
  email,
  default_state
)
values (
  '$CUSTOMER_ID'::uuid,
  '$AUTH_ID'::uuid,
  'Concurrent',
  'Customer',
  'Concurrent Customer',
  '5551304001',
  '$EMAIL',
  'CA'
);

insert into public.profiles (
  auth_user_id,
  role,
  customer_id,
  first_name,
  last_name,
  phone,
  is_active
)
values (
  '$AUTH_ID'::uuid,
  'customer',
  '$CUSTOMER_ID'::uuid,
  'Concurrent',
  'Customer',
  '5551304001',
  true
);

insert into public.crm_conversations (
  id,
  lead_id,
  customer_id,
  booking_id,
  subject,
  status,
  priority,
  needs_reply,
  unread_count,
  customer_unread_count,
  customer_last_read_at,
  last_message_at,
  last_inbound_at,
  last_outbound_at,
  last_channel,
  conversation_scope,
  created_at,
  updated_at
)
values (
  '$CONVERSATION_ID'::uuid,
  null,
  '$CUSTOMER_ID'::uuid,
  null,
  'Internal Support',
  'open',
  'normal',
  false,
  0,
  0,
  null,
  null,
  null,
  null,
  'internal',
  'internal',
  now(),
  now()
);
commit;
SQL

cat >"$S1_SQL" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$AUTH_ID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '$AUTH_ID', 'role', 'authenticated', 'aud', 'authenticated')::text, true);
select 'S1_RESULT|' || (r->>'success') || '|' || (r->>'message_id') || '|' || coalesce(r->>'idempotent_replay', '')
from (
  select public.send_my_internal_message(
    '$CLIENT_KEY_SAME'::uuid,
    'Two-session same payload',
    '[]'::jsonb
  ) as r
) q;
select pg_sleep($HOLD_SECONDS);
commit;
SQL

cat >"$S2_SQL" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$AUTH_ID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '$AUTH_ID', 'role', 'authenticated', 'aud', 'authenticated')::text, true);
select 'S2_RESULT|' ||
       t0::text || '|' ||
       t1::text || '|' ||
       (t1 - t0)::text || '|' ||
       (r->>'success') || '|' ||
       (r->>'message_id') || '|' ||
       coalesce((r->>'idempotent_replay'), '')
from (select extract(epoch from clock_timestamp()) as t0) s
cross join lateral (
  select public.send_my_internal_message(
    '$CLIENT_KEY_SAME'::uuid,
    'Two-session same payload',
    '[]'::jsonb
  ) as r
) call
cross join lateral (select extract(epoch from clock_timestamp()) as t1) e;
commit;
SQL

echo "[test-1] Running two concurrent sessions with same key/payload"
psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -f "$S1_SQL" >"$S1_OUT" 2>"$S1_ERR" &
S1_PID=$!

sleep 0.4
psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -f "$S2_SQL" >"$S2_OUT" 2>"$S2_ERR"
S2_STATUS=$?
wait "$S1_PID"
S1_STATUS=$?

if [[ $S1_STATUS -ne 0 ]]; then
  echo "Session 1 failed" >&2
  cat "$S1_ERR" >&2
  exit 1
fi
if [[ $S2_STATUS -ne 0 ]]; then
  echo "Session 2 failed" >&2
  cat "$S2_ERR" >&2
  exit 1
fi

S1_LINE="$(grep '^S1_RESULT|' "$S1_OUT" | tail -n 1)"
S2_LINE="$(grep '^S2_RESULT|' "$S2_OUT" | tail -n 1)"

IFS='|' read -r _ S1_SUCCESS S1_MESSAGE_ID S1_REPLAY <<<"$S1_LINE"
IFS='|' read -r _ S2_T0 S2_T1 S2_ELAPSED S2_SUCCESS S2_MESSAGE_ID S2_REPLAY <<<"$S2_LINE"

if [[ "$S1_SUCCESS" != "true" || "$S2_SUCCESS" != "true" ]]; then
  echo "Expected both same-payload RPC calls to succeed. S1=$S1_SUCCESS S2=$S2_SUCCESS" >&2
  exit 1
fi

if [[ -z "$S1_MESSAGE_ID" || "$S1_MESSAGE_ID" != "$S2_MESSAGE_ID" ]]; then
  echo "Expected both sessions to return the same message_id. S1=$S1_MESSAGE_ID S2=$S2_MESSAGE_ID" >&2
  exit 1
fi

min_wait="$(awk -v hold="$HOLD_SECONDS" 'BEGIN{ printf "%.3f", hold - 0.5 }')"
wait_ok="$(awk -v elapsed="$S2_ELAPSED" -v min="$min_wait" 'BEGIN{ if (elapsed >= min) print "yes"; else print "no" }')"
if [[ "$wait_ok" != "yes" ]]; then
  echo "Expected session 2 to wait on lock. elapsed=$S2_ELAPSED min_expected=$min_wait" >&2
  exit 1
fi

VERIFY_ONE="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 <<SQL
select
  (select count(*) from public.crm_messages m
    where m.conversation_id = '$CONVERSATION_ID'::uuid
      and m.channel = 'internal'
      and m.direction = 'inbound'
      and coalesce(m.body_text, '') = 'Two-session same payload')::text
  || '|' ||
  (select count(*) from public.crm_internal_message_idempotency i
    where i.sender_user_id = '$AUTH_ID'::uuid
      and i.sender_role = 'customer'
      and i.client_message_id = '$CLIENT_KEY_SAME'::uuid
      and i.conversation_id = '$CONVERSATION_ID'::uuid)::text
  || '|' ||
  (select coalesce(c.unread_count, -1) from public.crm_conversations c where c.id = '$CONVERSATION_ID'::uuid)::text;
SQL
)"

IFS='|' read -r MSG_COUNT IDEM_COUNT UNREAD_COUNT <<<"$VERIFY_ONE"

if [[ "$MSG_COUNT" != "1" ]]; then
  echo "Expected exactly one crm_messages row for same-key test, got $MSG_COUNT" >&2
  exit 1
fi
if [[ "$IDEM_COUNT" != "1" ]]; then
  echo "Expected exactly one idempotency row for same-key test, got $IDEM_COUNT" >&2
  exit 1
fi
if [[ "$UNREAD_COUNT" != "1" ]]; then
  echo "Expected unread_count=1 after duplicate retry, got $UNREAD_COUNT" >&2
  exit 1
fi

cat >"$S3_SQL" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$AUTH_ID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '$AUTH_ID', 'role', 'authenticated', 'aud', 'authenticated')::text, true);
select 'S3_RESULT|' || (r->>'success') || '|' || (r->>'message_id') || '|' || coalesce(r->>'idempotent_replay', '')
from (
  select public.send_my_internal_message(
    '$CLIENT_KEY_CONFLICT'::uuid,
    'Conflict body A',
    '[]'::jsonb
  ) as r
) q;
select pg_sleep($HOLD_SECONDS);
commit;
SQL

cat >"$S4_SQL" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$AUTH_ID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', '$AUTH_ID', 'role', 'authenticated', 'aud', 'authenticated')::text, true);
select public.send_my_internal_message(
  '$CLIENT_KEY_CONFLICT'::uuid,
  'Conflict body B',
  '[]'::jsonb
);
commit;
SQL

echo "[test-2] Running two concurrent sessions with same key but conflicting payloads"
psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -f "$S3_SQL" >"$S3_OUT" 2>"$S3_ERR" &
S3_PID=$!

sleep 0.4
S4_START_S="$(date +%s)"
set +e
psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -f "$S4_SQL" >"$S4_OUT" 2>"$S4_ERR"
S4_STATUS=$?
set -e
S4_END_S="$(date +%s)"
S4_ELAPSED_S=$((S4_END_S - S4_START_S))

wait "$S3_PID"
S3_STATUS=$?

if [[ $S3_STATUS -ne 0 ]]; then
  echo "Session 3 failed" >&2
  cat "$S3_ERR" >&2
  exit 1
fi

if [[ $S4_STATUS -eq 0 ]]; then
  echo "Expected conflicting payload session to fail, but it succeeded" >&2
  cat "$S4_OUT" >&2
  exit 1
fi

if ! grep -q "idempotency_key_reused_with_different_payload" "$S4_ERR"; then
  echo "Expected idempotency_key_reused_with_different_payload error in session 4" >&2
  cat "$S4_ERR" >&2
  exit 1
fi

if (( S4_ELAPSED_S < HOLD_SECONDS - 1 )); then
  echo "Expected conflicting payload session to overlap and wait. elapsed_seconds=$S4_ELAPSED_S hold_seconds=$HOLD_SECONDS" >&2
  exit 1
fi

VERIFY_TWO="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 <<SQL
select
  (select count(*) from public.crm_messages m
    where m.conversation_id = '$CONVERSATION_ID'::uuid
      and m.channel = 'internal'
      and m.direction = 'inbound'
      and coalesce(m.body_text, '') = 'Conflict body A')::text
  || '|' ||
  (select count(*) from public.crm_messages m
    where m.conversation_id = '$CONVERSATION_ID'::uuid
      and m.channel = 'internal'
      and m.direction = 'inbound'
      and coalesce(m.body_text, '') = 'Conflict body B')::text
  || '|' ||
  (select count(*) from public.crm_internal_message_idempotency i
    where i.sender_user_id = '$AUTH_ID'::uuid
      and i.sender_role = 'customer'
      and i.client_message_id = '$CLIENT_KEY_CONFLICT'::uuid
      and i.conversation_id = '$CONVERSATION_ID'::uuid)::text
  || '|' ||
  (select coalesce(c.unread_count, -1) from public.crm_conversations c where c.id = '$CONVERSATION_ID'::uuid)::text;
SQL
)"

IFS='|' read -r CONFLICT_A_COUNT CONFLICT_B_COUNT CONFLICT_IDEM_COUNT UNREAD_AFTER_CONFLICT <<<"$VERIFY_TWO"

if [[ "$CONFLICT_A_COUNT" != "1" ]]; then
  echo "Expected one persisted row for conflicting key winner payload A, got $CONFLICT_A_COUNT" >&2
  exit 1
fi
if [[ "$CONFLICT_B_COUNT" != "0" ]]; then
  echo "Expected zero persisted rows for conflicting key loser payload B, got $CONFLICT_B_COUNT" >&2
  exit 1
fi
if [[ "$CONFLICT_IDEM_COUNT" != "1" ]]; then
  echo "Expected one idempotency row for conflicting key, got $CONFLICT_IDEM_COUNT" >&2
  exit 1
fi
if [[ "$UNREAD_AFTER_CONFLICT" != "2" ]]; then
  echo "Expected unread_count=2 after second unique successful message, got $UNREAD_AFTER_CONFLICT" >&2
  exit 1
fi

echo "[ok] Two-session concurrency idempotency test passed"
echo "S1 message_id: $S1_MESSAGE_ID"
echo "S2 message_id: $S2_MESSAGE_ID"
echo "S2 elapsed seconds waiting for lock: $S2_ELAPSED"
echo "Conflict session elapsed seconds: $S4_ELAPSED_S"
echo "Cleanup is handled automatically via trap on exit"

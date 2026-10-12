# Customer approval flow manual checklist

Run in isolated test environment. No production deploy or migration execution.

## A. Baseline invariants
1. Pick two self-service bookings in pending_deposit state with populated booking_inventory_requirements.
2. For each booking verify:
   - booking_source = customer_self_service
   - customer_approval_state in (pending, approved, rejected, expired)
   - no unexpected active hold rows before explicit approval.
3. Confirm contract can be signed before redirect to approval-pending state.

## B. Request idempotency and revision
1. Submit request approval twice with identical reasons/snapshot/comment.
2. Verify second call returns idempotent=true and does not increment revision.
3. Submit request with changed snapshot or reasons.
4. Verify revision increments exactly once and history row is appended.

## C. Approve -> deposit payment -> finalize
1. Approve via admin action (or approve RPC).
2. Verify:
   - customer_approval_state = approved
   - customer_approval_expires_at is set
   - approval window is 60 minutes
   - active attempt approval_revision matches booking.customer_approval_revision.
3. Start customer deposit payment.
4. Verify Stripe bind succeeds only while approval remains approved and unexpired.
5. Complete payment and verify:
   - payment row exists with external_reference = Stripe session id
   - finalize RPC confirms booking
   - hold rows are converted to persistent reservations.

## D. Expiry coupling
1. Approve and create a temporary deposit attempt.
2. Release/expire hold and run expiry transition.
3. Verify booking moves to customer_approval_state = expired.
4. Confirm customer payment action redirects as expired and cannot bind/finalize.
5. Re-request approval and verify new revision.

## E. Reject and reset behavior
1. Reject pending approval.
2. Verify no active attempts in holding/stripe_bound remain.
3. Trigger admin booking edit that materially changes date/time/address.
4. Verify reset RPC atomically:
   - moves approval back to pending
   - increments revision
   - clears approval expiry
   - invalidates active attempts.
5. Confirm private notes edits do not reset approval.

## F. Race and idempotency checks
1. Dual request race from two sessions:
   - no duplicate active holds
   - monotonic revision
   - deterministic state.
2. Double approve race:
   - one success, second already_approved/state_conflict
   - no second hold acquisition.
3. Webhook replay on finalized attempt:
   - repeated processing returns idempotent success
   - no duplicate payment rows by external_reference.

## G. Accounting compatibility for manual review
1. Force a reconciliation-needed scenario (revision mismatch after session create).
2. Verify captured funds are recorded as received (status paid) with reconciliation note.
3. Verify booking does not finalize while approval is invalid.

## H. Admin bypass compatibility
1. Admin-created booking payment path still works without customer approval gate.
2. Completion-session protected admin/customer completion links still enforce completion token logic.
3. Staff mobile/admin API create+complete flow remains operational.

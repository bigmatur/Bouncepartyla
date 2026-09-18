# Booking Engine v2 — Phase 4

This phase introduced the first customer completion flow for staff-created pending-deposit bookings.

The current implementation now separates three independent lifetimes:

- completion link/session lifetime (default about 24 hours);
- initial admin inventory hold for Send to customer (default 60 minutes);
- Stripe Checkout session lifetime (separate, shorter payment window).

## Included

- `?complete=1` renders a dedicated completion panel on the customer booking page.
- Customer can sign the booking contract using a typed legal name and consent checkbox.
- Contract insertion is protected by a `security definer` RPC that verifies authenticated customer ownership and completion-session eligibility.
- Send to customer persists booking inventory requirements and acquires a temporary inventory hold.
- Customer checkout uses structured checkout attempts with atomic inventory reuse or reacquire.
- Stripe reconciliation is authoritative for payment synchronization and then invokes authoritative external-payment booking finalization rules.

## Payment boundary

This phase does not add a new card processor. It uses existing Stripe Checkout and the `payments` table as the source of truth.

If a completion link is still valid but the original 60-minute hold expired, inventory is rechecked/reacquired atomically before starting Stripe payment.

## Required migrations

Apply migrations in order:

1. `025_booking_completion_sessions.sql`
2. `111_admin_temporary_inventory_holds.sql`

# Booking Engine v2 — Phase 4

This phase adds the first functional customer completion flow for staff-created temporary bookings.

## Included

- `?complete=1` renders a dedicated completion panel on the customer booking page.
- Customer can sign the temporary booking contract using a typed legal name and consent checkbox.
- Contract insertion is protected by a `security definer` RPC that verifies the authenticated email against the active completion session.
- `finalize_temporary_booking()` atomically verifies:
  - active, unexpired completion session;
  - authenticated customer email;
  - signed contract;
  - paid payments totaling at least the required deposit.
- Once requirements are met it:
  - changes the booking to `confirmed`;
  - updates contract/payment totals and balance;
  - completes the temporary session;
  - creates missing delivery and pickup Route Board stops.

## Payment boundary

This phase does not add a new card processor. It uses the existing `payments` table as the source of truth. A payment recorded by the existing admin/POS flow can then be detected by **Check and confirm booking**.

## Required migrations

Apply migrations in order:

1. `025_booking_completion_sessions.sql`
2. `026_finalize_temporary_booking.sql`

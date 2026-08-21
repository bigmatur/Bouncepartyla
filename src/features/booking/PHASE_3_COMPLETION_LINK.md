# Booking Engine v2 — Phase 3

This phase adds a secure customer completion link for staff-created temporary bookings.

## Behavior

- `staff_send_to_customer` creates an expiring completion session.
- Only a SHA-256 token hash is stored in Supabase.
- The raw token exists only in the email link.
- The customer must sign in with the same email address that received the link.
- After authentication the session is claimed and the customer is redirected to the existing booking page with `?complete=1`.
- Default hold time is 24 hours and can be overridden with `BOOKING_TEMPORARY_HOLD_HOURS` (maximum 168 hours).
- Creating a replacement session revokes previous unfinished sessions for the same booking.

## Required database migration

Apply:

`supabase/migrations/025_booking_completion_sessions.sql`

The next phase should render the contract/deposit completion panel when the booking page receives `complete=1`, then atomically confirm the booking and create route stops after both requirements are satisfied.

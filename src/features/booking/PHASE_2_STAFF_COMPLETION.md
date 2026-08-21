# Booking Engine v2 — Phase 2

This phase introduces two explicit staff completion strategies in the admin booking wizard:

- `staff_send_to_customer` (default): creates a draft temporary reservation, reserves product/modifier inventory, does not sign a contract, does not capture payment, and does not create route stops.
- `staff_complete_now`: preserves the existing in-person contract, payment, and route-stop behavior.

The next phase should add the customer completion token/session, notification delivery, expiration settings, and conversion of the draft reservation into a confirmed booking after contract plus deposit.

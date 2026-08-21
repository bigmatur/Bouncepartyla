-- 087_stripe_payment_idempotency.sql
--
-- Prevents duplicate Stripe Checkout payments when Stripe delivers
-- the same webhook concurrently or retries an event.
--
-- Only Stripe payments are constrained. Cash, Zelle, Venmo, card/manual
-- and other payment references keep their existing behavior.

create unique index if not exists ux_payments_stripe_external_reference
on public.payments (external_reference)
where method = 'stripe'
  and external_reference is not null
  and btrim(external_reference) <> '';

notify pgrst, 'reload schema';
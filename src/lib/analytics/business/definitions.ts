export const BUSINESS_REVENUE_BOOKING_STATUSES = new Set([
  "booked",
  "scheduled",
  "inventory_reserved",
  "picking",
  "loaded",
  "out_for_delivery",
  "installed",
  "pickup_scheduled",
  "picked_up",
  "returned",
  "cleaning",
  "closed",
]);

export const BUSINESS_PREBOOKING_STATUSES = new Set([
  "draft",
  "quote",
  "pending_deposit",
]);

export const BUSINESS_EXCLUDED_BOOKING_STATUSES = new Set([
  "cancelled",
  "refunded",
]);

export const SUCCESSFUL_PAYMENT_STATUSES = new Set([
  "paid",
  "completed",
  "succeeded",
  "success",
]);

export function normalizeBusinessStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isBusinessRevenueBooking(
  booking: {
    status?: unknown;
    archived_at?: unknown;
  } | null | undefined,
) {
  if (!booking) return false;
  if (booking.archived_at) return false;

  return BUSINESS_REVENUE_BOOKING_STATUSES.has(
    normalizeBusinessStatus(booking.status),
  );
}

export function isSuccessfulBusinessPayment(
  payment: {
    status?: unknown;
  } | null | undefined,
) {
  if (!payment) return false;

  return SUCCESSFUL_PAYMENT_STATUSES.has(
    normalizeBusinessStatus(payment.status || "paid"),
  );
}
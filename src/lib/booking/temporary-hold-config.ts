import "server-only";

const DEFAULT_ADMIN_TEMPORARY_HOLD_MINUTES = 60;
const DEFAULT_TEMPORARY_CHECKOUT_SESSION_MINUTES = 30;
const DEFAULT_TEMPORARY_CHECKOUT_HOLD_BUFFER_MINUTES = 10;

function readBoundedMinutes(value: string, fallback: number, maxValue = 24 * 60) {
  const parsed = Number(value || "");

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.floor(parsed), maxValue));
}

export function getAdminTemporaryHoldMinutes() {
  return readBoundedMinutes(
    String(process.env.ADMIN_TEMPORARY_HOLD_MINUTES || ""),
    DEFAULT_ADMIN_TEMPORARY_HOLD_MINUTES,
  );
}

export function getTemporaryCheckoutSessionMinutes() {
  return readBoundedMinutes(
    String(process.env.TEMPORARY_BOOKING_CHECKOUT_SESSION_MINUTES || ""),
    DEFAULT_TEMPORARY_CHECKOUT_SESSION_MINUTES,
  );
}

export function getTemporaryCheckoutHoldBufferMinutes() {
  return readBoundedMinutes(
    String(process.env.TEMPORARY_BOOKING_CHECKOUT_HOLD_BUFFER_MINUTES || ""),
    DEFAULT_TEMPORARY_CHECKOUT_HOLD_BUFFER_MINUTES,
  );
}

export function minutesFromNowToIso(minutesFromNow: number) {
  return new Date(Date.now() + Math.max(0, minutesFromNow) * 60 * 1000).toISOString();
}

export function minutesFromNowToUnixSeconds(minutesFromNow: number) {
  return Math.floor(Date.now() / 1000) + Math.max(0, Math.floor(minutesFromNow * 60));
}

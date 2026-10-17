"use server";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getQuickCheckInventorySnapshot } from "@/lib/booking/quick-check-inventory-snapshot";
import { normalizeLosAngelesDateInput } from "@/lib/date-time/los-angeles-day-window";

function isValidTimeString(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function normalizeTimeInput(rawValue: string | null, fallback: string) {
  const value = String(rawValue || "").trim();

  if (!isValidTimeString(value)) {
    return fallback;
  }

  return value;
}

export async function getAvailabilitySnapshotAction(formData: FormData) {
  const selectedDate = normalizeLosAngelesDateInput(String(formData.get("eventDate") || "").trim());
  const eventStartTime = normalizeTimeInput(formData.get("eventStartTime") as string | null, "09:00");
  const eventEndTime = normalizeTimeInput(formData.get("eventEndTime") as string | null, "21:00");

  const { supabase } = await requireAdminPermission("bookings.view");

  return getQuickCheckInventorySnapshot({
    supabase: supabase as any,
    eventDate: selectedDate,
    eventStartTime,
    eventEndTime,
    bookingActor: "cashier",
  });
}

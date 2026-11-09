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

function currentQuarterStartIso() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 1);
  return new Date(Date.UTC(year, Math.floor((month - 1) / 3) * 3, 1)).toISOString();
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

export async function getZipTaxEstimateAction(formData: FormData) {
  const zip = String(formData.get("zip") || "").trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) {
    return { ok: false, message: "Enter a 5-digit ZIP." };
  }

  const { supabase } = await requireAdminPermission("bookings.view");
  const { data, error } = await supabase
    .from("tax_rate_cache")
    .select("tax_rate, created_at")
    .eq("zip", zip)
    .gte("created_at", currentQuarterStartIso())
    .order("created_at", { ascending: false })
    .limit(12);

  if (error || !data?.length) {
    return {
      ok: false,
      message: "No verified current-quarter rate is stored for this ZIP yet.",
    };
  }

  const rates = data
    .map((row: any) => Number(row.tax_rate))
    .filter((rate: number) => Number.isFinite(rate) && rate > 0)
    .map((rate: number) => (rate <= 1 ? rate * 100 : rate));
  const distinctRates = [...new Set(rates.map((rate: number) => rate.toFixed(6)))];

  if (distinctRates.length !== 1) {
    return {
      ok: false,
      message: "This ZIP has more than one current tax rate. Enter the full venue address.",
    };
  }

  return {
    ok: true,
    taxRate: Number(distinctRates[0]),
    message: "ZIP estimate from current-quarter verified addresses.",
  };
}

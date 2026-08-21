"use server";

import { createClient } from "@/lib/supabase/server";
import { calculateCanonicalBookingPricing } from "@/lib/booking/canonical-pricing";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const value = getString(formData, key);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getNullableNumber(formData: FormData, key: string) {
  const value = getString(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function calculateBookingPricingAction(formData: FormData) {
  const supabase = await createClient();

  return calculateCanonicalBookingPricing({
    supabase,
    setupAddress: getString(formData, "setupAddress"),
    setupCity: getString(formData, "setupCity"),
    setupState: getString(formData, "setupState") || "CA",
    setupZip: getString(formData, "setupZip"),
    destinationLat: getNullableNumber(formData, "destinationLat"),
    destinationLng: getNullableNumber(formData, "destinationLng"),
    manualDistanceMiles: getNullableNumber(formData, "manualDistanceMiles"),
    subtotal: getNumber(formData, "subtotal", 0),
    depositAmount: getNumber(formData, "depositAmount", 0),
  });
}

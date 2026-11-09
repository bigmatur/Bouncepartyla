import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateDeliveryFee } from "@/lib/delivery/calculate";
import { getCdtfaTaxRateByAddress } from "@/lib/tax/cdtfa";
import { normalizeTaxRatePercent } from "@/lib/tax/normalize-tax-rate";

export type CanonicalBookingPricingResult = {
  ok: boolean;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  taxRate: number;
  taxAmount: number;
  taxableAmount: number;
  totalAmount: number;
  depositAmount: number;
  balanceDue: number;
  distanceMiles: number | null;
  deliveryMode: string;
  matchedZoneName: string | null;
  deliveryReason: string;
  deliveryError: string | null;
  taxError: string | null;
  taxWarning: string | null;
};

function money(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function currentQuarterStartIso() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 1);
  const quarterMonth = Math.floor((month - 1) / 3) * 3;
  return new Date(Date.UTC(year, quarterMonth, 1)).toISOString();
}

async function getCurrentQuarterZipTaxFallback(input: {
  supabase: SupabaseClient;
  zip: string;
}) {
  const { data, error } = await input.supabase
    .from("tax_rate_cache")
    .select("tax_rate, created_at")
    .eq("zip", input.zip.slice(0, 5))
    .gte("created_at", currentQuarterStartIso())
    .order("created_at", { ascending: false })
    .limit(12);

  if (error || !data?.length) return null;

  const rates = data
    .map((row: any) => normalizeTaxRatePercent(row.tax_rate))
    .filter((rate: number) => Number.isFinite(rate) && rate > 0);
  const distinctRates = [...new Set(rates.map((rate: number) => rate.toFixed(6)))];

  // A ZIP can cross local tax boundaries. Only fall back automatically when
  // all current-quarter, verified entries agree on one rate.
  if (distinctRates.length !== 1) return null;

  return {
    taxRate: Number(distinctRates[0]),
  };
}

export async function calculateCanonicalBookingPricing(input: {
  supabase: SupabaseClient;
  setupAddress?: string | null;
  setupCity?: string | null;
  setupState?: string | null;
  setupZip?: string | null;
  subtotal: number;
  discountAmount?: number;
  depositAmount?: number;
  destinationLat?: number | null;
  destinationLng?: number | null;
  manualDistanceMiles?: number | null;
}): Promise<CanonicalBookingPricingResult> {
  const setupAddress = String(input.setupAddress || "").trim();
  const setupCity = String(input.setupCity || "").trim();
  const setupState = String(input.setupState || "CA").trim() || "CA";
  const setupZip = String(input.setupZip || "").trim();
  const subtotal = money(input.subtotal);
  const discountAmount = money(
    Math.max(
      0,
      Math.min(money(input.discountAmount), subtotal),
    ),
  );
  const depositAmount = money(input.depositAmount);

  const { data: settingsRows, error: settingsError } = await input.supabase
    .from("business_settings")
    .select("tax_enabled")
    .order("created_at", { ascending: true })
    .limit(1);

  if (settingsError) throw new Error(settingsError.message);

  const settings = settingsRows?.[0] || null;

  let deliveryFee = 0;
  let distanceMiles: number | null = null;
  let deliveryMode = "per_mile";
  let matchedZoneName: string | null = null;
  let deliveryReason = "";
  let deliveryError: string | null = null;

  try {
    const delivery = await calculateDeliveryFee({
      destinationAddress: setupAddress,
      destinationCity: setupCity,
      destinationState: setupState,
      destinationZip: setupZip,
      destinationLat: input.destinationLat ?? null,
      destinationLng: input.destinationLng ?? null,
      manualDistanceMiles: input.manualDistanceMiles ?? null,
      supabase: input.supabase,
    });

    deliveryFee = money(delivery.deliveryFee);
    distanceMiles = delivery.distanceMiles == null ? null : Number(delivery.distanceMiles);
    deliveryMode = String(delivery.mode || "per_mile");
    matchedZoneName = delivery.matchedZoneName || null;
    deliveryReason = String(delivery.reason || "");
  } catch (error: any) {
    deliveryError = error?.message || "Delivery calculation failed.";
  }

  let taxRate = 0;
  let taxError: string | null = null;
  let taxWarning: string | null = null;

  if (settings?.tax_enabled !== false) {
    if (!setupAddress || !setupCity || !setupZip) {
      taxError = "Address, city and ZIP are required for tax lookup.";
    } else {
      try {
        const tax = await getCdtfaTaxRateByAddress({
          address: setupAddress,
          city: setupCity,
          zip: setupZip,
        });

        taxRate = normalizeTaxRatePercent(tax.taxRate);
        if (tax.raw?.lookup_method === "mapped_coordinates_fallback") {
          taxWarning = "Tax was verified from the mapped venue location because a rooftop address match was unavailable.";
        }

        const cacheWrite = await input.supabase.from("tax_rate_cache").insert({
          address: setupAddress,
          city: setupCity,
          state: setupState,
          zip: setupZip,
          tax_rate: taxRate,
          raw_response: tax.raw,
          provider: "cdtfa",
        });

        if (cacheWrite.error) {
          console.warn("[pricing] tax cache write skipped:", cacheWrite.error.message);
        }
      } catch (error: any) {
        const liveError = error?.message || "Tax lookup failed.";
        const zipFallback = await getCurrentQuarterZipTaxFallback({
          supabase: input.supabase,
          zip: setupZip,
        });

        if (zipFallback) {
          taxRate = zipFallback.taxRate;
          taxWarning = "Tax rate was estimated from recent verified addresses in this ZIP for the current quarter.";
        } else {
          taxError = `${liveError} Tax is not verified and no single current-quarter ZIP rate is available.`;
        }
      }
    }
  }

  const taxableSubtotal = money(
    Math.max(subtotal - discountAmount, 0),
  );
  const taxableAmount = money(taxableSubtotal + deliveryFee);
  const taxAmount = money(taxableAmount * (taxRate / 100));
  const totalAmount = money(
    taxableSubtotal + deliveryFee + taxAmount,
  );
  const balanceDue = money(Math.max(totalAmount - depositAmount, 0));

  return {
    ok: !deliveryError && !taxError,
    subtotal,
    discountAmount,
    deliveryFee,
    taxRate,
    taxAmount,
    taxableAmount,
    totalAmount,
    depositAmount,
    balanceDue,
    distanceMiles,
    deliveryMode,
    matchedZoneName,
    deliveryReason,
    deliveryError,
    taxError,
    taxWarning,
  };
}

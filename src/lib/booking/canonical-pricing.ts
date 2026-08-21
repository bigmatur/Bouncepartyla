import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateDeliveryFee } from "@/lib/delivery/calculate";
import { getCdtfaTaxRateByAddress } from "@/lib/tax/cdtfa";
import { normalizeTaxRatePercent } from "@/lib/tax/normalize-tax-rate";

export type CanonicalBookingPricingResult = {
  ok: boolean;
  subtotal: number;
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
};

function money(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export async function calculateCanonicalBookingPricing(input: {
  supabase: SupabaseClient;
  setupAddress?: string | null;
  setupCity?: string | null;
  setupState?: string | null;
  setupZip?: string | null;
  subtotal: number;
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

        const [zipCacheResult, cityCacheResult] = await Promise.all([
          setupZip
            ? input.supabase
                .from("tax_rates_cache")
                .select("tax_rate, zip, city")
                .eq("zip", setupZip)
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null } as any),
          setupCity
            ? input.supabase
                .from("tax_rates_cache")
                .select("tax_rate, zip, city")
                .ilike("city", setupCity)
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null } as any),
        ]);

        const cacheRow = zipCacheResult?.data || cityCacheResult?.data || null;

        if (cacheRow && Number.isFinite(Number(cacheRow.tax_rate || 0))) {
          taxRate = normalizeTaxRatePercent(cacheRow.tax_rate);
          taxError = null;
        } else {
          taxError = liveError;
        }
      }
    }
  }

  const taxableAmount = money(subtotal + deliveryFee);
  const taxAmount = money(taxableAmount * (taxRate / 100));
  const totalAmount = money(subtotal + deliveryFee + taxAmount);
  const balanceDue = money(Math.max(totalAmount - depositAmount, 0));

  return {
    ok: !deliveryError && !taxError,
    subtotal,
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
  };
}

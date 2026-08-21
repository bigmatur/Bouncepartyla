import type { TaxRateResult } from "@/types/pricing";

type CachedTaxRate = {
  id: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  normalized_address: string | null;
  tax_rate: number;
  tax_area_code: string | null;
  source: string;
  expires_at: string | null;
};

export function normalizeAddress(input: {
  address: string;
  city: string;
  state: string;
  zip: string;
}): string {
  return [
    input.address.trim().toLowerCase(),
    input.city.trim().toLowerCase(),
    input.state.trim().toLowerCase(),
    input.zip.trim(),
  ].join("|");
}

export function getTaxRateFromCache(params: {
  address: string;
  city: string;
  state: string;
  zip: string;
  cachedRates: CachedTaxRate[];
}): TaxRateResult {
  const normalized = normalizeAddress({
    address: params.address,
    city: params.city,
    state: params.state,
    zip: params.zip,
  });

  const exactMatch = params.cachedRates.find(
    (rate) => rate.normalized_address === normalized
  );

  if (exactMatch) {
    return {
      taxRate: Number(exactMatch.tax_rate),
      taxAreaCode: exactMatch.tax_area_code,
      source: "cache",
    };
  }

  const zipMatch = params.cachedRates.find(
    (rate) => rate.zip === params.zip
  );

  if (zipMatch) {
    return {
      taxRate: Number(zipMatch.tax_rate),
      taxAreaCode: zipMatch.tax_area_code,
      source: "zip_fallback",
      warning:
        "Tax rate was matched by ZIP only. Full address lookup is recommended.",
    };
  }

  return {
    taxRate: 0,
    source: "manual",
    warning: "Tax rate not found. Manual tax rate required.",
  };
}
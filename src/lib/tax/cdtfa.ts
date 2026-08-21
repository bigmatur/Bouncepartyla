type CdtfaTaxInput = {
  address: string;
  city: string;
  zip: string;
};

type CdtfaTaxResult = {
  taxRate: number;
  raw: any;
};

function normalizeRate(value: unknown) {
  if (typeof value === "number") {
    if (value > 1) return value;
    return value * 100;
  }

  if (typeof value === "string") {
    const cleaned = value.replace("%", "").trim();
    const parsed = Number(cleaned);

    if (Number.isNaN(parsed)) return null;
    if (parsed > 1) return parsed;

    return parsed * 100;
  }

  return null;
}

function findRateDeep(value: any): number | null {
  if (!value) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    for (const [key, childValue] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();

      if (
        lowerKey === "rate" ||
        lowerKey === "taxrate" ||
        lowerKey === "tax_rate" ||
        lowerKey === "salesandusetaxrate" ||
        lowerKey === "sales_and_use_tax_rate" ||
        lowerKey.includes("taxrate") ||
        lowerKey.includes("tax_rate")
      ) {
        const normalized = normalizeRate(childValue);
        if (normalized !== null) return normalized;
      }
    }

    for (const childValue of Object.values(value)) {
      const found = findRateDeep(childValue);
      if (found !== null) return found;
    }
  }

  if (Array.isArray(value)) {
    for (const childValue of value) {
      const found = findRateDeep(childValue);
      if (found !== null) return found;
    }
  }

  return null;
}

async function readResponseBody(response: Response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function getCdtfaTaxRateByAddress({
  address,
  city,
  zip,
}: CdtfaTaxInput): Promise<CdtfaTaxResult> {
  const cleanAddress = address.trim();
  const cleanCity = city.trim();
  const cleanZip = zip.trim();

  if (!cleanAddress || !cleanCity || !cleanZip) {
    throw new Error("Address, city and ZIP are required for CDTFA tax lookup.");
  }

  const url = new URL(
    "https://services.maps.cdtfa.ca.gov/api/taxrate/GetRateByAddress"
  );

  // CDTFA API expects these exact query parameter names.
  url.searchParams.set("Address", cleanAddress);
  url.searchParams.set("City", cleanCity);
  url.searchParams.set("Zip", cleanZip);
  url.searchParams.set("IncludeUpHierarchy", "false");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const raw = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(
      `CDTFA tax lookup failed: ${response.status}. ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`
    );
  }

  const taxRate = findRateDeep(raw);

  if (taxRate === null) {
    throw new Error(
      `Could not read tax rate from CDTFA response: ${JSON.stringify(raw)}`
    );
  }

  return {
    taxRate,
    raw,
  };
}
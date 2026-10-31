// Address tax lookup: Google rooftop geocode + official CDTFA polygons.
type CdtfaTaxInput = { address: string; city: string; zip: string };
type CdtfaTaxResult = { taxRate: number; raw: any };

const TAX_LAYER = "https://services6.arcgis.com/snwvZ3EmaoXJiugR/arcgis/rest/services/California_Sales_and_Use_Tax_Rates/FeatureServer/1/query";

function laQuarter(time: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "numeric",
  }).formatToParts(new Date(time));
  const year = parts.find(p => p.type === "year")!.value;
  const month = Number(parts.find(p => p.type === "month")!.value);
  return `${year}-Q${Math.ceil(month / 3)}`;
}

async function fetchTaxJson(url: URL, signal: AbortSignal, service: string) {
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" }, cache: "no-store", signal,
  });
  if (!response.ok) throw new Error(`${service}: HTTP ${response.status}`);
  const raw = await response.json();
  if (raw?.error) throw new Error(`${service}: service returned an error`);
  return raw;
}

export async function getCdtfaTaxRateByAddress({
  address, city, zip,
}: CdtfaTaxInput): Promise<CdtfaTaxResult> {
  const cleanAddress = address.trim();
  const cleanCity = city.trim();
  const cleanZip = zip.trim();
  if (!cleanAddress || !cleanCity || !/^\d{5}(?:-\d{4})?$/.test(cleanZip)) {
    throw new Error("A complete California street address, city and ZIP are required for tax lookup.");
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) throw new Error("Tax address lookup is not configured.");
  // One budget for BOTH external requests, including response bodies.
  const signal = AbortSignal.timeout(8000);
  const google = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  google.searchParams.set("address", `${cleanAddress}, ${cleanCity}, CA ${cleanZip}, USA`);
  google.searchParams.set("key", apiKey);
  const geocode = await fetchTaxJson(google, signal, "Address lookup");
  if (geocode?.status !== "OK" || !Array.isArray(geocode.results) || geocode.results.length !== 1) {
    throw new Error("Tax address could not be matched uniquely. Check the full street address.");
  }
  const match = geocode.results[0];
  const components = Array.isArray(match.address_components) ? match.address_components : [];
  const component = (type: string) => components.find((c: any) => c.types?.includes(type))?.short_name;
  const inputNumber = cleanAddress.match(/^\s*(\d+[A-Za-z]?(?:-\d+)?)/)?.[1];
  if (match.partial_match || match.geometry?.location_type !== "ROOFTOP" ||
      component("country") !== "US" || component("administrative_area_level_1") !== "CA" ||
      component("postal_code") !== cleanZip.slice(0, 5) ||
      !inputNumber || String(component("street_number") || "").toLowerCase() !== inputNumber.toLowerCase() ||
      !component("route")) {
    throw new Error("Tax address needs verification: a complete rooftop match with matching street number and ZIP is required.");
  }
  const lat = match.geometry?.location?.lat;
  const lng = match.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error("Tax address lookup returned invalid coordinates.");
  }
  const query = new URL(TAX_LAYER);
  const params: Record<string, string> = {
    f: "json", where: "1=1", geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "JURIS_NAME,RATE,START_DATE,DateStamp", returnGeometry: "false",
  };
  for (const [key, value] of Object.entries(params)) query.searchParams.set(key, value);
  const response = await fetchTaxJson(query, signal, "CDTFA");
  if (!Array.isArray(response.features) || !response.features.length || response.exceededTransferLimit) {
    throw new Error("CDTFA did not return a complete tax-area match for this address.");
  }
  const now = Date.now();
  const eligible = response.features.map((f: any) => f.attributes).filter((a: any) =>
    a && typeof a.DateStamp === "number" && Number.isFinite(a.DateStamp) &&
    typeof a.START_DATE === "number" && Number.isFinite(a.START_DATE) &&
    a.DateStamp <= now && a.START_DATE <= now && laQuarter(a.DateStamp) === laQuarter(now)
  );
  if (!eligible.length) throw new Error("CDTFA has no current-quarter rate for this address. Tax requires verification.");
  const latest = Math.max(...eligible.map((a: any) => a.DateStamp));
  const current = eligible.filter((a: any) => a.DateStamp === latest);
  const rates = current.map((a: any) => a.RATE);
  if (rates.some((rate: any) => typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate >= 1)) {
    throw new Error("CDTFA returned an invalid tax rate.");
  }
  const percentages = rates.map((rate: number) => Number((rate * 100).toFixed(6)));
  if (new Set(percentages).size !== 1) {
    throw new Error("This address intersects tax areas with different rates. Tax requires verification.");
  }
  return {
    taxRate: percentages[0],
    raw: {
      provider: "cdtfa_arcgis", checked_at: new Date(now).toISOString(),
      requested_address: { address: cleanAddress, city: cleanCity, zip: cleanZip },
      matched_address: match.formatted_address, location_type: match.geometry.location_type,
      coordinates: { lat, lng }, tax_area: current, response,
    },
  };
}

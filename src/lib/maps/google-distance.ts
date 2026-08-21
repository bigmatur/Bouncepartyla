type GoogleDistanceInput = {
  originAddress: string;
  destinationAddress: string;
  departureTime?: Date | string | number | null;
  trafficModel?: "best_guess" | "pessimistic" | "optimistic";
};

type GoogleDistanceResult = {
  distanceMiles: number;
  distanceMeters: number;
  durationText: string | null;
  originAddress: string | null;
  destinationAddress: string | null;
  raw: any;
};

function metersToMiles(meters: number) {
  return meters / 1609.344;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeDepartureTime(value: Date | string | number | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : new Date(String(value));

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (parsed.getTime() <= Date.now()) {
    return "now";
  }

  return String(Math.floor(parsed.getTime() / 1000));
}

export async function getGoogleDrivingDistanceMiles({
  originAddress,
  destinationAddress,
  departureTime,
  trafficModel = "best_guess",
}: GoogleDistanceInput): Promise<GoogleDistanceResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY in .env.local.");
  }

  if (!originAddress || !destinationAddress) {
    throw new Error("Origin and destination addresses are required.");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");

  url.searchParams.set("origins", originAddress);
  url.searchParams.set("destinations", destinationAddress);
  url.searchParams.set("units", "imperial");
  url.searchParams.set("mode", "driving");

  const normalizedDepartureTime = normalizeDepartureTime(departureTime);
  if (normalizedDepartureTime) {
    url.searchParams.set("departure_time", normalizedDepartureTime);
    url.searchParams.set("traffic_model", trafficModel);
  }

  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const raw = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `Google distance lookup failed: ${response.status}. ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`
    );
  }

  if (!raw || raw.status !== "OK") {
    throw new Error(
      `Google distance lookup failed: ${raw?.status || "UNKNOWN"}. ${
        raw?.error_message || JSON.stringify(raw)
      }`
    );
  }

  const element = raw.rows?.[0]?.elements?.[0];

  if (!element || element.status !== "OK") {
    throw new Error(
      `Google distance result failed: ${element?.status || "UNKNOWN"}`
    );
  }

  const distanceMeters = Number(element.distance?.value || 0);

  if (!distanceMeters || Number.isNaN(distanceMeters)) {
    throw new Error("Google distance response did not include distance value.");
  }

  const distanceMiles = metersToMiles(distanceMeters);

  return {
    distanceMiles: Number(distanceMiles.toFixed(2)),
    distanceMeters,
    durationText: element.duration_in_traffic?.text || element.duration?.text || null,
    originAddress: raw.origin_addresses?.[0] || null,
    destinationAddress: raw.destination_addresses?.[0] || null,
    raw,
  };
}
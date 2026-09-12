import "server-only";

import { resolveIntegrationConnection } from "@/lib/integrations/connections";

export type RouteWeatherForecast = {
  temperatureF: number | null;
  condition: string | null;
  windMph: number | null;
  gustMph: number | null;
  forecastTime: string | null;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

const ROUTE_TIME_ZONE = "America/Los_Angeles";

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return asUtc - date.getTime();
}

export function routeLocalDateTimeToDate(
  date: string,
  time: string | null | undefined,
) {
  const dateMatch = String(date || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  const timeMatch = String(time || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);

  if (!dateMatch || !timeMatch) {
    throw new Error("Invalid route event date or time.");
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);

  const utcGuess = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );

  const firstOffset = timeZoneOffsetMs(utcGuess, ROUTE_TIME_ZONE);
  let result = new Date(utcGuess.getTime() - firstOffset);

  const correctedOffset = timeZoneOffsetMs(result, ROUTE_TIME_ZONE);

  if (correctedOffset !== firstOffset) {
    result = new Date(utcGuess.getTime() - correctedOffset);
  }

  return result;
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

async function getGoogleMapsServerKey() {
  const environmentApiKey = String(process.env.GOOGLE_MAPS_API_KEY || "").trim();
  if (environmentApiKey) return environmentApiKey;

  const integration = await resolveIntegrationConnection("google_maps");
  const credentials = integration.credentials as Record<string, string>;
  const apiKey = String(credentials.server_api_key || "").trim();

  if (!apiKey) {
    throw new Error("Google Maps server API key is not configured.");
  }

  return apiKey;
}

async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<Coordinates> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const raw = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Google geocoding failed: ${response.status}.`);
  }

  if (
    !raw ||
    raw.status !== "OK" ||
    !raw.results?.[0]?.geometry?.location
  ) {
    throw new Error(
      `Google geocoding failed: ${raw?.status || "UNKNOWN"}.`,
    );
  }

  const latitude = Number(raw.results[0].geometry.location.lat);
  const longitude = Number(raw.results[0].geometry.location.lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Google geocoding returned invalid coordinates.");
  }

  return { latitude, longitude };
}

function requestedForecastHours(target: Date) {
  const diffHours = Math.ceil((target.getTime() - Date.now()) / 3_600_000);

  if (diffHours < -1 || diffHours > 240) {
    throw new Error(
      "Weather forecast is outside the supported hourly forecast window.",
    );
  }

  return Math.max(1, Math.min(240, diffHours + 3));
}

function closestForecastHour(forecastHours: any[], target: Date) {
  let closest: any = null;
  let closestDiff = Number.POSITIVE_INFINITY;

  for (const hour of forecastHours) {
    const startTime = String(hour?.interval?.startTime || "");
    const timestamp = new Date(startTime).getTime();

    if (Number.isNaN(timestamp)) continue;

    const diff = Math.abs(timestamp - target.getTime());

    if (diff < closestDiff) {
      closest = hour;
      closestDiff = diff;
    }
  }

  return closest;
}

function nullableFiniteNumber(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getRouteWeatherForecast(params: {
  address: string;
  targetTime: Date;
}): Promise<RouteWeatherForecast> {
  const apiKey = await getGoogleMapsServerKey();
  const coordinates = await geocodeAddress(params.address, apiKey);

  const url = new URL(
    "https://weather.googleapis.com/v1/forecast/hours:lookup",
  );

  url.searchParams.set("key", apiKey);
  url.searchParams.set("location.latitude", String(coordinates.latitude));
  url.searchParams.set("location.longitude", String(coordinates.longitude));
  url.searchParams.set("unitsSystem", "IMPERIAL");
  url.searchParams.set(
    "hours",
    String(requestedForecastHours(params.targetTime)),
  );
  url.searchParams.set("pageSize", "240");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const raw = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `Google Weather lookup failed: ${response.status}. ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`,
    );
  }

  const forecastHours = Array.isArray(raw?.forecastHours)
    ? raw.forecastHours
    : [];

  const forecast = closestForecastHour(forecastHours, params.targetTime);

  if (!forecast) {
    throw new Error(
      "Google Weather did not return a forecast for this time.",
    );
  }

  const temperature = nullableFiniteNumber(forecast?.temperature?.degrees);
  const wind = nullableFiniteNumber(forecast?.wind?.speed?.value);
  const gust = nullableFiniteNumber(forecast?.wind?.gust?.value);

  return {
    temperatureF: temperature,
    condition:
      String(forecast?.weatherCondition?.description?.text || "").trim() ||
      null,
    windMph: wind,
    gustMph: gust,
    forecastTime: String(forecast?.interval?.startTime || "").trim() || null,
  };
}

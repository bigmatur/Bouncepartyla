import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getGoogleDrivingDistanceMiles } from "@/lib/maps/google-distance";

type DeliveryInput = {
  destinationAddress?: string | null;
  destinationCity?: string | null;
  destinationState?: string | null;
  destinationZip?: string | null;

  destinationLat?: number | null;
  destinationLng?: number | null;
  manualDistanceMiles?: number | null;
  supabase?: SupabaseClient;
};

type DeliveryMode = "per_mile" | "miles" | "zones" | "radius_zones" | "zip_zones";

type DeliveryResult = {
  mode: DeliveryMode;
  deliveryFee: number;
  distanceMiles: number | null;
  matchedZoneName: string | null;
  reason: string;
};

type DeliverySettings = {
  source: "business_settings" | "system_settings";
  delivery_pricing_mode?: string | null;

  origin_address?: string | null;
  origin_city?: string | null;
  origin_state?: string | null;
  origin_zip?: string | null;
  origin_lat?: number | string | null;
  origin_lng?: number | string | null;

  warehouse_address?: string | null;
  warehouse_city?: string | null;
  warehouse_state?: string | null;
  warehouse_zip?: string | null;
  warehouse_lat?: number | string | null;
  warehouse_lng?: number | string | null;

  delivery_base_fee?: number | string | null;
  delivery_per_mile_rate?: number | string | null;
  delivery_minimum_fee?: number | string | null;
  delivery_free_radius_miles?: number | string | null;

  free_delivery_miles?: number | string | null;
  price_per_mile?: number | string | null;
  minimum_delivery_fee?: number | string | null;
};

function toNumber(value: any, fallback = 0) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function deg2rad(value: number) {
  return value * (Math.PI / 180);
}

function haversineMiles({
  fromLat,
  fromLng,
  toLat,
  toLng,
}: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}) {
  const earthRadiusMiles = 3958.8;

  const dLat = deg2rad(toLat - fromLat);
  const dLng = deg2rad(toLng - fromLng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(fromLat)) *
      Math.cos(deg2rad(toLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
}

function pointInPolygon(point: [number, number], polygon: [number, number][]) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

function zoneContainsPoint(zone: any, lat?: number | null, lng?: number | null) {
  if (!zone?.polygon_geojson || lat == null || lng == null) return false;

  const geojson = zone.polygon_geojson;

  if (geojson.type === "Polygon") {
    const ring = geojson.coordinates?.[0];

    if (!Array.isArray(ring)) return false;

    const polygon = ring.map((coord: any) => [
      Number(coord[0]),
      Number(coord[1]),
    ]) as [number, number][];

    return pointInPolygon([Number(lng), Number(lat)], polygon);
  }

  return false;
}

function zoneMatchesText(
  zone: any,
  destinationCity?: string | null,
  destinationZip?: string | null
) {
  const city = destinationCity?.trim().toLowerCase();
  const zip = destinationZip?.trim();

  const cityNames = Array.isArray(zone.city_names) ? zone.city_names : [];
  const zipCodes = Array.isArray(zone.zip_codes) ? zone.zip_codes : [];

  const directZip = zone.zip ? String(zone.zip).trim() === zip : false;
  const directCity = zone.city
    ? String(zone.city).trim().toLowerCase() === city
    : false;

  const cityMatch =
    city &&
    cityNames.some((value: string) => value.trim().toLowerCase() === city);

  const zipMatch = zip && zipCodes.some((value: string) => value.trim() === zip);

  return Boolean(cityMatch || zipMatch || directCity || directZip);
}

function calculatePerMileFee({
  distanceMiles,
  baseFee,
  perMileRate,
  minimumFee,
  freeRadiusMiles,
}: {
  distanceMiles: number;
  baseFee: number;
  perMileRate: number;
  minimumFee: number;
  freeRadiusMiles: number;
}) {
  const billableMiles = Math.max(0, distanceMiles - freeRadiusMiles);
  const fee = baseFee + billableMiles * perMileRate;

  return Math.max(fee, minimumFee);
}

function buildAddress({
  address,
  city,
  state,
  zip,
}: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  return [address, city, state, zip].filter(Boolean).join(", ");
}

function normalizeMode(value?: string | null): DeliveryMode {
  if (value === "radius_zones") return "radius_zones";
  if (value === "zip_zones") return "zip_zones";
  if (value === "zones") return "zones";
  if (value === "miles") return "miles";
  return "per_mile";
}

function getOrigin(settings: DeliverySettings) {
  return {
    address: settings.origin_address || settings.warehouse_address,
    city: settings.origin_city || settings.warehouse_city,
    state: settings.origin_state || settings.warehouse_state || "CA",
    zip: settings.origin_zip || settings.warehouse_zip,
    lat:
      settings.origin_lat == null
        ? settings.warehouse_lat == null
          ? null
          : Number(settings.warehouse_lat)
        : Number(settings.origin_lat),
    lng:
      settings.origin_lng == null
        ? settings.warehouse_lng == null
          ? null
          : Number(settings.warehouse_lng)
        : Number(settings.origin_lng),
  };
}

function getPerMileSettings(settings: DeliverySettings) {
  return {
    baseFee: toNumber(settings.delivery_base_fee, 0),
    perMileRate: toNumber(settings.delivery_per_mile_rate ?? settings.price_per_mile, 0),
    minimumFee: toNumber(settings.delivery_minimum_fee ?? settings.minimum_delivery_fee, 0),
    freeRadiusMiles: toNumber(
      settings.delivery_free_radius_miles ?? settings.free_delivery_miles,
      0
    ),
  };
}

async function getDeliverySettings(
  supabase: SupabaseClient,
): Promise<DeliverySettings> {
  const { data: businessRows, error: businessError } = await supabase
    .from("business_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!businessError && businessRows?.[0]) {
    return {
      ...businessRows[0],
      source: "business_settings",
    };
  }

  const { data: systemRows, error: systemError } = await supabase
    .from("system_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);

  if (!systemError && systemRows?.[0]) {
    return {
      ...systemRows[0],
      source: "system_settings",
    };
  }

  throw new Error(
    businessError?.message || systemError?.message || "Delivery settings not found."
  );
}

async function getBestDistanceMiles({
  settings,
  destinationAddress,
  destinationCity,
  destinationState,
  destinationZip,
  destinationLat,
  destinationLng,
  manualDistanceMiles,
}: DeliveryInput & { settings: DeliverySettings }) {
  if (manualDistanceMiles != null && Number(manualDistanceMiles) > 0) {
    return {
      distanceMiles: Number(manualDistanceMiles),
      reason: "Manual miles.",
    };
  }

  const origin = getOrigin(settings);

  const originAddress = buildAddress({
    address: origin.address,
    city: origin.city,
    state: origin.state || "CA",
    zip: origin.zip,
  });

  const destinationFullAddress = buildAddress({
    address: destinationAddress,
    city: destinationCity,
    state: destinationState || "CA",
    zip: destinationZip,
  });

  if (originAddress && destinationFullAddress) {
    try {
      const googleDistance = await getGoogleDrivingDistanceMiles({
        originAddress,
        destinationAddress: destinationFullAddress,
      });

      return {
        distanceMiles: googleDistance.distanceMiles,
        reason: `Google Maps driving distance. ${googleDistance.durationText || ""}`.trim(),
      };
    } catch {
      // Fall back to coordinates below when available.
    }
  }

  if (
    origin.lat == null ||
    origin.lng == null ||
    destinationLat == null ||
    destinationLng == null
  ) {
    return {
      distanceMiles: null,
      reason: "Missing address/coordinates.",
    };
  }

  const distanceMiles = haversineMiles({
    fromLat: origin.lat,
    fromLng: origin.lng,
    toLat: Number(destinationLat),
    toLng: Number(destinationLng),
  });

  return {
    distanceMiles,
    reason: "Coordinate distance.",
  };
}

export async function calculateDeliveryFee({
  destinationAddress,
  destinationCity,
  destinationState = "CA",
  destinationZip,
  destinationLat,
  destinationLng,
  manualDistanceMiles,
  supabase: providedSupabase,
}: DeliveryInput): Promise<DeliveryResult> {
  const supabase = providedSupabase ?? (await createClient());
  const settings = await getDeliverySettings(supabase);
  const mode = normalizeMode(settings.delivery_pricing_mode);
  const perMileSettings = getPerMileSettings(settings);

  if (mode === "zip_zones") {
    const zip = destinationZip?.trim();

    if (zip) {
      const { data: zones, error } = await supabase
        .from("delivery_zip_zones")
        .select("*")
        .eq("active", true)
        .eq("zip_code", zip)
        .order("sort_order", { ascending: true })
        .limit(1);

      if (!error && zones?.[0]) {
        const zone = zones[0];

        return {
          mode,
          deliveryFee: roundMoney(toNumber(zone.delivery_fee, 0)),
          distanceMiles: null,
          matchedZoneName: zone.zone_name || zone.zip_code,
          reason: "Matched ZIP delivery zone.",
        };
      }
    }

    return {
      mode,
      deliveryFee: roundMoney(perMileSettings.minimumFee),
      distanceMiles: null,
      matchedZoneName: null,
      reason: "No ZIP zone matched. Used minimum delivery fee.",
    };
  }

  if (mode === "radius_zones") {
    const distance = await getBestDistanceMiles({
      settings,
      destinationAddress,
      destinationCity,
      destinationState,
      destinationZip,
      destinationLat,
      destinationLng,
      manualDistanceMiles,
    });

    if (distance.distanceMiles == null) {
      return {
        mode,
        deliveryFee: roundMoney(perMileSettings.minimumFee),
        distanceMiles: null,
        matchedZoneName: null,
        reason: `${distance.reason} Used minimum delivery fee.`,
      };
    }

    const { data: zones, error } = await supabase
      .from("delivery_radius_zones")
      .select("*")
      .eq("active", true)
      .lte("from_miles", distance.distanceMiles)
      .gt("to_miles", distance.distanceMiles)
      .order("sort_order", { ascending: true })
      .limit(1);

    if (!error && zones?.[0]) {
      const zone = zones[0];

      return {
        mode,
        deliveryFee: roundMoney(toNumber(zone.delivery_fee, 0)),
        distanceMiles: roundMoney(distance.distanceMiles),
        matchedZoneName: zone.name || "Radius zone",
        reason: `Matched radius delivery zone. ${distance.reason}`,
      };
    }

    return {
      mode,
      deliveryFee: roundMoney(perMileSettings.minimumFee),
      distanceMiles: roundMoney(distance.distanceMiles),
      matchedZoneName: null,
      reason: `No radius zone matched. ${distance.reason} Used minimum fee.`,
    };
  }

  if (mode === "zones") {
    const { data: zones, error: zonesError } = await supabase
      .from("delivery_zones")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (zonesError) {
      throw new Error(zonesError.message);
    }

    const matchedZone = (zones || []).find((zone: any) => {
      return (
        zoneContainsPoint(zone, destinationLat, destinationLng) ||
        zoneMatchesText(zone, destinationCity, destinationZip)
      );
    });

    if (matchedZone) {
      return {
        mode,
        deliveryFee: roundMoney(
          toNumber(matchedZone.delivery_fee ?? matchedZone.base_fee, 0)
        ),
        distanceMiles: null,
        matchedZoneName: matchedZone.name || matchedZone.zone_name,
        reason: "Matched legacy delivery zone.",
      };
    }

    return {
      mode,
      deliveryFee: roundMoney(perMileSettings.minimumFee),
      distanceMiles: null,
      matchedZoneName: null,
      reason: "No legacy zone matched. Used minimum fee.",
    };
  }

  const distance = await getBestDistanceMiles({
    settings,
    destinationAddress,
    destinationCity,
    destinationState,
    destinationZip,
    destinationLat,
    destinationLng,
    manualDistanceMiles,
  });

  if (distance.distanceMiles == null) {
    return {
      mode,
      deliveryFee: roundMoney(perMileSettings.minimumFee),
      distanceMiles: null,
      matchedZoneName: null,
      reason: `${distance.reason} Used minimum delivery fee.`,
    };
  }

  const finalFee = calculatePerMileFee({
    distanceMiles: distance.distanceMiles,
    ...perMileSettings,
  });

  return {
    mode,
    deliveryFee: roundMoney(finalFee),
    distanceMiles: roundMoney(distance.distanceMiles),
    matchedZoneName: null,
    reason: `Calculated by miles. ${distance.reason}`,
  };
}

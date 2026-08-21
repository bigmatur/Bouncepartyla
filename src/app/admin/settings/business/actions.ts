"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getCdtfaTaxRateByAddress } from "@/lib/tax/cdtfa";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
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

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function parseCommaList(value: string | null) {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonOrNull(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Invalid GeoJSON format.");
  }
}

function revalidateBusinessSettings() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/business");
  revalidatePath("/admin/bookings/new");
}

export async function updateBusinessSettingsAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const settingsId = getString(formData, "settingsId");

  const payload = {
    business_name: getString(formData, "businessName") || "Bounce Party LA",
    warehouse_name: getString(formData, "warehouseName") || "Main Warehouse",

    origin_address: getNullableString(formData, "originAddress"),
    origin_city: getNullableString(formData, "originCity"),
    origin_state: getString(formData, "originState") || "CA",
    origin_zip: getNullableString(formData, "originZip"),

    origin_lat: getNullableNumber(formData, "originLat"),
    origin_lng: getNullableNumber(formData, "originLng"),

    delivery_pricing_mode:
      getString(formData, "deliveryPricingMode") === "zones"
        ? "zones"
        : "per_mile",

    delivery_base_fee: getNumber(formData, "deliveryBaseFee", 0),
    delivery_per_mile_rate: getNumber(formData, "deliveryPerMileRate", 0),
    delivery_minimum_fee: getNumber(formData, "deliveryMinimumFee", 0),
    delivery_free_radius_miles: getNumber(formData, "deliveryFreeRadiusMiles", 0),

    tax_provider: "cdtfa",
    tax_enabled: getBoolean(formData, "taxEnabled"),

    updated_at: new Date().toISOString(),
  };

  if (settingsId) {
    const { error } = await supabase
      .from("business_settings")
      .update(payload)
      .eq("id", settingsId);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase.from("business_settings").insert(payload);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidateBusinessSettings();
}

export async function createDeliveryZoneAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const name = getString(formData, "name");

  if (!name) {
    throw new Error("Zone name is required.");
  }

  const polygonText = getNullableString(formData, "polygonGeojson");

  const { error } = await supabase.from("delivery_zones").insert({
    name,
    description: getNullableString(formData, "description"),
    delivery_fee: getNumber(formData, "deliveryFee", 0),
    polygon_geojson: parseJsonOrNull(polygonText),
    zip_codes: parseCommaList(getNullableString(formData, "zipCodes")),
    city_names: parseCommaList(getNullableString(formData, "cityNames")),
    sort_order: getNumber(formData, "sortOrder", 100),
    active: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateBusinessSettings();
}

export async function updateDeliveryZoneAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const zoneId = getString(formData, "zoneId");
  const name = getString(formData, "name");

  if (!zoneId) {
    throw new Error("Missing zone id.");
  }

  if (!name) {
    throw new Error("Zone name is required.");
  }

  const polygonText = getNullableString(formData, "polygonGeojson");

  const { error } = await supabase
    .from("delivery_zones")
    .update({
      name,
      description: getNullableString(formData, "description"),
      delivery_fee: getNumber(formData, "deliveryFee", 0),
      polygon_geojson: parseJsonOrNull(polygonText),
      zip_codes: parseCommaList(getNullableString(formData, "zipCodes")),
      city_names: parseCommaList(getNullableString(formData, "cityNames")),
      sort_order: getNumber(formData, "sortOrder", 100),
      updated_at: new Date().toISOString(),
    })
    .eq("id", zoneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateBusinessSettings();
}

export async function toggleDeliveryZoneAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const zoneId = getString(formData, "zoneId");
  const active = getBoolean(formData, "active");

  if (!zoneId) {
    throw new Error("Missing zone id.");
  }

  const { error } = await supabase
    .from("delivery_zones")
    .update({
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", zoneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateBusinessSettings();
}

export async function lookupTaxRateAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const address = getString(formData, "taxAddress");
  const city = getString(formData, "taxCity");
  const zip = getString(formData, "taxZip");

  if (!address || !city || !zip) {
    throw new Error("Address, city and ZIP are required.");
  }

  const result = await getCdtfaTaxRateByAddress({
    address,
    city,
    zip,
  });

  const { error } = await supabase.from("tax_rate_cache").insert({
    address,
    city,
    state: "CA",
    zip,
    tax_rate: result.taxRate,
    raw_response: result.raw,
    provider: "cdtfa",
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateBusinessSettings();
}
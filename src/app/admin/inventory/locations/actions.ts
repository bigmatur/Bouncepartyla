"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const parsed = Number(value.replace(",", "."));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function revalidateInventoryLocations() {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/locations");
  revalidatePath("/admin/inventory/receive");
  revalidatePath("/admin/inventory/movements");
  revalidatePath("/admin/inventory/returns");
}

export async function createWarehouseLocationAction(formData: FormData) {
  const supabase = await createClient();

  const name = getString(formData, "name");
  const parentId = getNullableString(formData, "parentId");
  const locationType = getString(formData, "locationType") || "zone";
  const description = getNullableString(formData, "description");
  const sortOrder = getNumber(formData, "sortOrder", 100);

  if (!name) {
    throw new Error("Location name is required.");
  }

  const slug = createSlug(name);

  const { error } = await supabase.from("warehouse_locations").insert({
    name,
    slug,
    parent_id: parentId,
    location_type: locationType,
    description,
    sort_order: sortOrder,
    active: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryLocations();
}

export async function updateWarehouseLocationAction(formData: FormData) {
  const supabase = await createClient();

  const locationId = getString(formData, "locationId");
  const name = getString(formData, "name");
  const parentId = getNullableString(formData, "parentId");
  const locationType = getString(formData, "locationType") || "zone";
  const description = getNullableString(formData, "description");
  const sortOrder = getNumber(formData, "sortOrder", 100);
  const active = getBoolean(formData, "active");

  if (!locationId) {
    throw new Error("Missing location id.");
  }

  if (!name) {
    throw new Error("Location name is required.");
  }

  if (parentId === locationId) {
    throw new Error("Location cannot be parent of itself.");
  }

  const slug = createSlug(name);

  const { error } = await supabase
    .from("warehouse_locations")
    .update({
      name,
      slug,
      parent_id: parentId,
      location_type: locationType,
      description,
      sort_order: sortOrder,
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", locationId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryLocations();
}

export async function toggleWarehouseLocationAction(formData: FormData) {
  const supabase = await createClient();

  const locationId = getString(formData, "locationId");
  const active = getBoolean(formData, "active");

  if (!locationId) {
    throw new Error("Missing location id.");
  }

  const { error } = await supabase
    .from("warehouse_locations")
    .update({
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", locationId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryLocations();
}

export async function deleteWarehouseLocationAction(formData: FormData) {
  const supabase = await createClient();

  const locationId = getString(formData, "locationId");

  if (!locationId) {
    throw new Error("Missing location id.");
  }

  const { count: childrenCount, error: childrenError } = await supabase
    .from("warehouse_locations")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", locationId);

  if (childrenError) {
    throw new Error(childrenError.message);
  }

  if ((childrenCount || 0) > 0) {
    throw new Error(
      "Cannot delete this location because it has child locations. Move or delete child locations first."
    );
  }

  const { count: unitsCount, error: unitsError } = await supabase
    .from("inventory_units")
    .select("id", { count: "exact", head: true })
    .eq("warehouse_location_id", locationId);

  if (unitsError) {
    throw new Error(unitsError.message);
  }

  if ((unitsCount || 0) > 0) {
    throw new Error(
      "Cannot delete this location because inventory units are assigned to it. Move units to another location first."
    );
  }

  const { error } = await supabase
    .from("warehouse_locations")
    .delete()
    .eq("id", locationId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryLocations();
}
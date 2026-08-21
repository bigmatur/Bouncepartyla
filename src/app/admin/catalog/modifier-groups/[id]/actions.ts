"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const BUCKET_NAME = "catalog-images";

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

function getNullableUuid(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function getInventoryBehavior(formData: FormData) {
  return getString(formData, "inventoryBehavior") === "consumable"
    ? "consumable"
    : "reusable";
}

function isMissingColumnError(
  error: any,
  tableName: string,
  columnName: string,
) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  if (code === "42703") {
    return true;
  }

  return (
    message.includes("column") &&
    message.includes(String(columnName).toLowerCase()) &&
    message.includes(String(tableName).toLowerCase())
  );
}

function getNullableHexColor(formData: FormData, key: string) {
  const value = getString(formData, key);
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

function resolveOptionMarkerColor(formData: FormData) {
  const markerColor = getNullableHexColor(formData, "markerColor");
  const initialMarkerColor = getNullableHexColor(formData, "initialMarkerColor");
  const useMarkerColor = getBoolean(formData, "useMarkerColor");

  if (useMarkerColor) {
    return markerColor;
  }

  // If the user changed color picker value, treat it as explicit intent.
  if (markerColor && markerColor !== initialMarkerColor) {
    return markerColor;
  }

  return null;
}

function safeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isRealFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "name" in value &&
      "size" in value &&
      Number((value as File).size) > 0
  );
}

function revalidateGroup(groupId: string) {
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/catalog/modifier-groups");
  revalidatePath(`/admin/catalog/modifier-groups/${groupId}`);
  revalidatePath("/admin/bookings/new");
}

async function uploadCatalogImage({
  file,
  folder,
}: {
  file: File;
  folder: string;
}) {
  const supabase = await createClient();

  const extension = file.name.includes(".")
    ? file.name.split(".").pop()
    : "jpg";

  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(
    file.name || `image.${extension}`
  )}`;

  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, bytes, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

  if (!data.publicUrl) {
    throw new Error("Could not create public image URL.");
  }

  return data.publicUrl;
}

export async function updateModifierGroupAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");

  if (!groupId) {
    throw new Error("Missing group id.");
  }

  const groupName = getString(formData, "groupName");

  if (!groupName) {
    throw new Error("Group name is required.");
  }

  const selectionType = getString(formData, "selectionType") || "single";

  if (!["single", "multiple", "quantity"].includes(selectionType)) {
    throw new Error("Unsupported selection type.");
  }

  const maxTotalQuantityRaw = getString(formData, "maxTotalQuantity");
  let maxTotalQuantity: number | null = null;

  if (selectionType === "multiple" && maxTotalQuantityRaw) {
    const parsedMaxTotalQuantity = Number(maxTotalQuantityRaw);

    if (
      !Number.isFinite(parsedMaxTotalQuantity) ||
      parsedMaxTotalQuantity < 1
    ) {
      throw new Error("Max total quantity must be a whole number of at least 1.");
    }

    maxTotalQuantity = Math.floor(parsedMaxTotalQuantity);
  }

  const { error } = await supabase
    .from("modifier_groups")
    .update({
      name: groupName,
      selection_type: selectionType,
      max_total_quantity: maxTotalQuantity,
      description: getNullableString(formData, "description"),
      sort_order: getNumber(formData, "sortOrder", 100),
      active: getBoolean(formData, "active"),
      required_by_default: getBoolean(formData, "requiredByDefault"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateGroup(groupId);
}

export async function uploadModifierGroupPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");
  const file = formData.get("photo");

  if (!groupId) {
    throw new Error("Missing group id.");
  }

  if (!isRealFile(file)) {
    throw new Error("Choose a photo first.");
  }

  const imageUrl = await uploadCatalogImage({
    file,
    folder: `modifier-groups/${groupId}`,
  });

  const { error } = await supabase
    .from("modifier_groups")
    .update({
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateGroup(groupId);
}

export async function removeModifierGroupPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");

  if (!groupId) {
    throw new Error("Missing group id.");
  }

  const { error } = await supabase
    .from("modifier_groups")
    .update({
      image_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateGroup(groupId);
}

export async function createModifierGroupOptionAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");
  const optionName = getString(formData, "optionName");

  if (!groupId) {
    throw new Error("Missing group id.");
  }

  if (!optionName) {
    throw new Error("Option name is required.");
  }

  const inventoryItemId = getNullableUuid(formData, "inventoryItemId");
  const inventoryQuantity = Math.max(1, Math.floor(getNumber(formData, "inventoryQuantity", 1)));
  const trackInventory = Boolean(inventoryItemId) && getBoolean(formData, "trackInventory");
  const inventoryBehavior = getInventoryBehavior(formData);

  const requestedSortOrder = Math.floor(getNumber(formData, "sortOrder", 0));

  const { data: existingOptions, error: existingOptionsError } = await supabase
    .from("modifier_group_options")
    .select("sort_order")
    .eq("modifier_group_id", groupId);

  if (existingOptionsError) {
    throw new Error(existingOptionsError.message);
  }

  const usedSortOrders = new Set(
    (existingOptions || []).map((option: any) => Number(option.sort_order || 0))
  );

  let sortOrder = requestedSortOrder > 0 ? requestedSortOrder : 10;

  while (usedSortOrders.has(sortOrder)) {
    sortOrder += 10;
  }

  const markerColor = resolveOptionMarkerColor(formData);

  const payload: Record<string, any> = {
    modifier_group_id: groupId,
    option_name: optionName,
    description: getNullableString(formData, "description"),
    price_delta: getNumber(formData, "priceDelta", 0),
    inventory_item_id: inventoryItemId,
    inventory_quantity: inventoryQuantity,
    track_inventory: trackInventory,
    inventory_behavior: inventoryBehavior,
    active: true,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };

  if (markerColor) {
    payload.marker_color = markerColor;
  }

  let { error } = await supabase
    .from("modifier_group_options")
    .insert(payload);

  if (error && isMissingColumnError(error, "modifier_group_options", "inventory_behavior")) {
    const { inventory_behavior, ...legacyPayload } = payload;
    const fallbackResult = await supabase
      .from("modifier_group_options")
      .insert(legacyPayload);
    error = fallbackResult.error;
  }

  if (error && isMissingColumnError(error, "modifier_group_options", "marker_color")) {
    const { marker_color, ...legacyPayload } = payload;
    const fallbackResult = await supabase
      .from("modifier_group_options")
      .insert(legacyPayload);
    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  revalidateGroup(groupId);
}

export async function updateModifierGroupOptionAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");
  const optionId = getString(formData, "optionId");
  const optionName = getString(formData, "optionName");

  if (!groupId || !optionId) {
    throw new Error("Missing option id.");
  }

  if (!optionName) {
    throw new Error("Option name is required.");
  }

  const inventoryItemId = getNullableUuid(formData, "inventoryItemId");
  const inventoryQuantity = Math.max(1, Math.floor(getNumber(formData, "inventoryQuantity", 1)));
  const trackInventory = Boolean(inventoryItemId) && getBoolean(formData, "trackInventory");
  const inventoryBehavior = getInventoryBehavior(formData);

  const markerColor = resolveOptionMarkerColor(formData);

  const payload: Record<string, any> = {
    option_name: optionName,
    description: getNullableString(formData, "description"),
    price_delta: getNumber(formData, "priceDelta", 0),
    marker_color: markerColor,
    inventory_item_id: inventoryItemId,
    inventory_quantity: inventoryQuantity,
    track_inventory: trackInventory,
    inventory_behavior: inventoryBehavior,
    active: getBoolean(formData, "active"),
    sort_order: getNumber(formData, "sortOrder", 100),
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase
    .from("modifier_group_options")
    .update(payload)
    .eq("id", optionId);

  if (error && isMissingColumnError(error, "modifier_group_options", "inventory_behavior")) {
    const { inventory_behavior, ...legacyPayload } = payload;
    const fallbackResult = await supabase
      .from("modifier_group_options")
      .update(legacyPayload)
      .eq("id", optionId);
    error = fallbackResult.error;
  }

  if (error && isMissingColumnError(error, "modifier_group_options", "marker_color")) {
    const { marker_color, ...legacyPayload } = payload;
    const fallbackResult = await supabase
      .from("modifier_group_options")
      .update(legacyPayload)
      .eq("id", optionId);
    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  revalidateGroup(groupId);
}

export async function uploadModifierGroupOptionPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");
  const optionId = getString(formData, "optionId");
  const file = formData.get("photo");

  if (!groupId || !optionId) {
    throw new Error("Missing option id.");
  }

  if (!isRealFile(file)) {
    throw new Error("Choose a photo first.");
  }

  const imageUrl = await uploadCatalogImage({
    file,
    folder: `modifier-groups/${groupId}/options/${optionId}`,
  });

  const { error } = await supabase
    .from("modifier_group_options")
    .update({
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", optionId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateGroup(groupId);
}

export async function removeModifierGroupOptionPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");
  const optionId = getString(formData, "optionId");

  if (!groupId || !optionId) {
    throw new Error("Missing option id.");
  }

  const { error } = await supabase
    .from("modifier_group_options")
    .update({
      image_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", optionId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateGroup(groupId);
}

export async function deleteModifierGroupOptionAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");
  const optionId = getString(formData, "optionId");

  if (!groupId || !optionId) {
    throw new Error("Missing option id.");
  }

  const { error } = await supabase
    .from("modifier_group_options")
    .delete()
    .eq("id", optionId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateGroup(groupId);
}

export async function connectProductToGroupAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");
  const productId = getString(formData, "productId");

  if (!groupId || !productId) {
    throw new Error("Choose product first.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("product_modifier_groups")
    .select("id")
    .eq("product_id", productId)
    .eq("modifier_group_id", groupId)
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing && existing.length > 0) {
    revalidateGroup(groupId);
    return;
  }

  const { error } = await supabase.from("product_modifier_groups").insert({
    product_id: productId,
    modifier_group_id: groupId,
    sort_order: getNumber(formData, "sortOrder", 100),
    required: getBoolean(formData, "required"),
    active: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateGroup(groupId);
}

export async function disconnectProductFromGroupAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");
  const connectionId = getString(formData, "connectionId");

  if (!groupId || !connectionId) {
    throw new Error("Missing connection id.");
  }

  const { error } = await supabase
    .from("product_modifier_groups")
    .delete()
    .eq("id", connectionId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateGroup(groupId);
}

export async function deleteModifierGroupAction(formData: FormData) {
  const supabase = await createClient();

  const groupId = getString(formData, "groupId");

  if (!groupId) {
    throw new Error("Missing group id.");
  }

  await supabase
    .from("modifier_group_options")
    .delete()
    .eq("modifier_group_id", groupId);

  await supabase
    .from("product_modifier_groups")
    .delete()
    .eq("modifier_group_id", groupId);

  const { error } = await supabase
    .from("modifier_groups")
    .delete()
    .eq("id", groupId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/catalog");
  revalidatePath("/admin/catalog/modifier-groups");

  redirect("/admin/catalog/modifier-groups");
}

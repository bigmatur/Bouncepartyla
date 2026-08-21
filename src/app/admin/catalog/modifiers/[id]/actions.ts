"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getNullableNumber(formData: FormData, key: string) {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return null;
  }

  return numberValue;
}

function getBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

export async function updateModifierAction(formData: FormData) {
  const supabase = await createClient();

  const modifierId = getString(formData, "modifierId");

  if (!modifierId) {
    throw new Error("Missing add-on id.");
  }

  const { error } = await supabase
    .from("modifiers")
    .update({
      name: getString(formData, "name"),
      short_description: getNullableString(formData, "shortDescription"),
      description: getNullableString(formData, "description"),
      image_url: getNullableString(formData, "imageUrl"),
      price: getNullableNumber(formData, "price") || 0,
      taxable: getBoolean(formData, "taxable"),
      affects_inventory: getBoolean(formData, "affectsInventory"),
      allow_quantity: getBoolean(formData, "allowQuantity"),
      min_quantity: getNullableNumber(formData, "minQuantity") || 0,
      max_quantity: getNullableNumber(formData, "maxQuantity") || 1,
      setup_minutes: getNullableNumber(formData, "setupMinutes") || 0,
      teardown_minutes: getNullableNumber(formData, "teardownMinutes") || 0,
      modifier_type: getNullableString(formData, "modifierType"),
      public_visible: getBoolean(formData, "publicVisible"),
      active: getBoolean(formData, "active"),
      sort_order: getNullableNumber(formData, "sortOrder") || 100,
      admin_notes: getNullableString(formData, "adminNotes"),
    })
    .eq("id", modifierId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/modifiers/${modifierId}`);
  revalidatePath("/admin/catalog/modifier-groups");
  revalidatePath("/admin/bookings/new");
}

export async function uploadModifierImageAction(formData: FormData) {
  const supabase = await createClient();

  const modifierId = getString(formData, "modifierId");
  const file = formData.get("image");

  if (!modifierId) {
    throw new Error("Missing add-on id.");
  }

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Please select an image.");
  }

  const extension = file.name.split(".").pop() || "jpg";
  const filePath = `modifiers/${modifierId}/${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("catalog-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage
    .from("catalog-images")
    .getPublicUrl(filePath);

  const imageUrl = data.publicUrl;

  const { error: updateError } = await supabase
    .from("modifiers")
    .update({
      image_url: imageUrl,
    })
    .eq("id", modifierId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/modifiers/${modifierId}`);
  revalidatePath("/admin/bookings/new");
}
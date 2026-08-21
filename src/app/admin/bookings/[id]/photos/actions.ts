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

function isMissingTableError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42p01" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation")
  );
}

function isMissingColumnError(error: any, tableName: string, columnName: string) {
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

function normalizePhotoType(value: string) {
  const allowed = [
    "delivery_setup",
    "pickup",
    "damage",
    "cleaning",
    "inventory",
    "customer",
    "general",
  ];

  return allowed.includes(value) ? value : "general";
}

function safeFileName(value: string) {
  const clean = String(value || "photo")
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return clean || "photo";
}

function revalidateBookingPhotoPages(bookingId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/photos`);
  revalidatePath(`/admin/bookings/${bookingId}/workflow`);
  revalidatePath(`/admin/bookings/${bookingId}/checklist`);
  revalidatePath("/admin/routes/driver/checklists");
  revalidatePath("/admin/inventory/damages");
  revalidatePath("/admin/inventory/cleaning");
}

export async function uploadBookingPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  const photoType = normalizePhotoType(getString(formData, "photoType"));
  const routeStopId = getNullableString(formData, "routeStopId");
  const checklistItemId = getNullableString(formData, "checklistItemId");
  const inventoryItemId = getNullableString(formData, "inventoryItemId");
  const inventoryUnitId = getNullableString(formData, "inventoryUnitId");
  const caption = getNullableString(formData, "caption");
  const takenBy = getNullableString(formData, "takenBy");

  const file = formData.get("photo");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a photo to upload.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }

  const fileExtension =
    file.name.includes(".") && file.name.split(".").pop()
      ? file.name.split(".").pop()
      : "jpg";

  const filePath = [
    bookingId,
    photoType,
    `${Date.now()}-${safeFileName(file.name || `photo.${fileExtension}`)}`,
  ].join("/");

  const uploadResult = await supabase.storage
    .from("booking-photos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  const publicUrlResult = supabase.storage
    .from("booking-photos")
    .getPublicUrl(filePath);

  const photoUrl = publicUrlResult.data.publicUrl;

  const insertPayload: Record<string, any> = {
    booking_id: bookingId,
    route_stop_id: routeStopId,
    checklist_item_id: checklistItemId,
    inventory_item_id: inventoryItemId,
    inventory_unit_id: inventoryUnitId,
    photo_type: photoType,
    photo_url: photoUrl,
    storage_path: filePath,
    caption,
    taken_by: takenBy,
    updated_at: new Date().toISOString(),
  };

  let insertResult = await supabase.from("booking_photos").insert(insertPayload);

  if (
    insertResult.error &&
    isMissingColumnError(insertResult.error, "booking_photos", "storage_path")
  ) {
    const fallbackPayload = { ...insertPayload };
    delete fallbackPayload.storage_path;

    insertResult = await supabase.from("booking_photos").insert(fallbackPayload);
  }

  if (insertResult.error) {
    await supabase.storage.from("booking-photos").remove([filePath]);

    if (isMissingTableError(insertResult.error)) {
      throw new Error("booking_photos table is missing. Run the SQL first.");
    }

    throw new Error(insertResult.error.message);
  }

  revalidateBookingPhotoPages(bookingId);
}

export async function deleteBookingPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const photoId = getString(formData, "photoId");
  const storagePath = getNullableString(formData, "storagePath");

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  if (!photoId) {
    throw new Error("Missing photo id.");
  }

  const { error } = await supabase
    .from("booking_photos")
    .delete()
    .eq("id", photoId)
    .eq("booking_id", bookingId);

  if (error) {
    throw new Error(error.message);
  }

  if (storagePath) {
    await supabase.storage.from("booking-photos").remove([storagePath]);
  }

  revalidateBookingPhotoPages(bookingId);
}
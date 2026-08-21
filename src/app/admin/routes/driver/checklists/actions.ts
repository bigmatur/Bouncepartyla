"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkStartedAction } from "@/app/time-clock/actions";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
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

function revalidateDriverPages(bookingId?: string, date?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/routes");
  revalidatePath("/admin/routes/driver");
  revalidatePath("/admin/routes/driver/checklists");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/cleaning");
  revalidatePath("/admin/inventory/damages");

  if (date) {
    revalidatePath(`/admin/routes/driver/checklists?date=${date}`);
  }

  if (bookingId) {
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath(`/admin/bookings/${bookingId}/checklist`);
    revalidatePath(`/admin/bookings/${bookingId}/inventory`);
    revalidatePath(`/admin/bookings/${bookingId}/routes`);
    revalidatePath(`/admin/bookings/${bookingId}/workflow`);
    revalidatePath(`/admin/bookings/${bookingId}/photos`);
  }
}

async function syncChecklistInventoryWorkflow({
  bookingId,
  checklistItemId,
}: {
  bookingId: string;
  checklistItemId: string;
}) {
  const supabase = await createClient();

  const { data: checklistItem, error: checklistError } = await supabase
    .from("booking_checklist_items")
    .select(
      `
      id,
      booking_id,
      inventory_item_id,
      inventory_unit_id,
      title,
      quantity,
      returned,
      needs_cleaning,
      damaged,
      missing,
      checked_by,
      notes
    `
    )
    .eq("id", checklistItemId)
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (checklistError) {
    throw new Error(checklistError.message);
  }

  if (!checklistItem) {
    return;
  }

  const inventoryUnitId = String((checklistItem as any).inventory_unit_id || "");
  const inventoryItemId = String((checklistItem as any).inventory_item_id || "");

  if (!inventoryUnitId) {
    return;
  }

  const { data: unit, error: unitError } = await supabase
    .from("inventory_units")
    .select("id, inventory_item_id, status")
    .eq("id", inventoryUnitId)
    .maybeSingle();

  if (unitError) {
    throw new Error(unitError.message);
  }

  if (!unit) {
    return;
  }

  const itemId = inventoryItemId || String((unit as any).inventory_item_id || "");
  const now = new Date().toISOString();

  const title = String((checklistItem as any).title || "Checklist item");
  const notes = String((checklistItem as any).notes || "").trim();
  const checkedBy = String((checklistItem as any).checked_by || "").trim();

  const returned = Boolean((checklistItem as any).returned);
  const needsCleaning = Boolean((checklistItem as any).needs_cleaning);
  const damaged = Boolean((checklistItem as any).damaged);
  const missing = Boolean((checklistItem as any).missing);

  if (damaged) {
    const damageNotes = notes
      ? `Marked damaged from driver checklist: ${title}\n\n${notes}`
      : `Marked damaged from driver checklist: ${title}`;

    const { error: updateUnitError } = await supabase
      .from("inventory_units")
      .update({
        status: "damaged",
        damage_notes: damageNotes,
        damaged_at: now,
        updated_at: now,
      })
      .eq("id", inventoryUnitId);

    if (updateUnitError) {
      throw new Error(updateUnitError.message);
    }

    const { data: existingReports, error: existingReportError } = await supabase
      .from("inventory_damage_reports")
      .select("id")
      .eq("inventory_unit_id", inventoryUnitId)
      .eq("booking_id", bookingId)
      .in("status", ["reported", "repair_needed", "in_repair"])
      .limit(1);

    if (existingReportError && !isMissingTableError(existingReportError)) {
      throw new Error(existingReportError.message);
    }

    const hasActiveReport = (existingReports || []).length > 0;

    if (!hasActiveReport && !existingReportError) {
      const { error: insertDamageError } = await supabase
        .from("inventory_damage_reports")
        .insert({
          inventory_unit_id: inventoryUnitId,
          inventory_item_id: itemId || null,
          booking_id: bookingId,
          status: "reported",
          severity: "medium",
          reported_by: checkedBy || null,
          damage_title: `Driver damage: ${title}`,
          damage_description: damageNotes,
          estimated_repair_cost: 0,
          actual_repair_cost: 0,
          updated_at: now,
        });

      if (insertDamageError && !isMissingTableError(insertDamageError)) {
        throw new Error(insertDamageError.message);
      }
    }

    return;
  }

  if (missing) {
    const missingNotes = notes
      ? `Marked missing from driver checklist: ${title}\n\n${notes}`
      : `Marked missing from driver checklist: ${title}`;

    const { error: updateUnitError } = await supabase
      .from("inventory_units")
      .update({
        status: "lost",
        damage_notes: missingNotes,
        updated_at: now,
      })
      .eq("id", inventoryUnitId);

    if (updateUnitError) {
      const message = String(updateUnitError.message || "").toLowerCase();

      if (!message.includes("invalid input value for enum")) {
        throw new Error(updateUnitError.message);
      }

      const { error: fallbackError } = await supabase
        .from("inventory_units")
        .update({
          damage_notes: missingNotes,
          updated_at: now,
        })
        .eq("id", inventoryUnitId);

      if (fallbackError) {
        throw new Error(fallbackError.message);
      }
    }

    return;
  }

  if (needsCleaning) {
    const cleaningNotes = notes
      ? `Needs cleaning from driver checklist: ${title}\n\n${notes}`
      : `Needs cleaning from driver checklist: ${title}`;

    const { error: updateUnitError } = await supabase
      .from("inventory_units")
      .update({
        status: "dirty",
        cleaning_notes: cleaningNotes,
        updated_at: now,
      })
      .eq("id", inventoryUnitId);

    if (updateUnitError) {
      throw new Error(updateUnitError.message);
    }

    const { error: cleaningLogError } = await supabase
      .from("inventory_cleaning_logs")
      .insert({
        inventory_unit_id: inventoryUnitId,
        inventory_item_id: itemId || null,
        status_from: String((unit as any).status || "") || null,
        status_to: "dirty",
        cleaned_by: checkedBy || null,
        notes: cleaningNotes,
      });

    if (cleaningLogError && !isMissingTableError(cleaningLogError)) {
      throw new Error(cleaningLogError.message);
    }

    return;
  }

  if (returned) {
    const { error: updateUnitError } = await supabase
      .from("inventory_units")
      .update({
        status: "available",
        updated_at: now,
      })
      .eq("id", inventoryUnitId);

    if (updateUnitError) {
      throw new Error(updateUnitError.message);
    }
  }
}

export async function quickToggleDriverChecklistItemAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const checklistItemId = getString(formData, "checklistItemId");
  const field = getString(formData, "field");
  const value = getBoolean(formData, "value");
  const date = getString(formData, "date");

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  if (!checklistItemId) {
    throw new Error("Missing checklist item id.");
  }

  const allowedFields = [
    "loaded",
    "installed",
    "picked_up",
    "returned",
    "needs_cleaning",
    "damaged",
    "missing",
  ];

  if (!allowedFields.includes(field)) {
    throw new Error("Invalid checklist field.");
  }

  const now = new Date().toISOString();

  const updateData: Record<string, any> = {
    [field]: value,
    updated_at: now,
  };

  if (field === "loaded" && value) {
    updateData.loaded_at = now;
  }

  if (field === "installed" && value) {
    updateData.installed_at = now;
  }

  if (field === "picked_up" && value) {
    updateData.picked_up_at = now;
  }

  if (field === "returned" && value) {
    updateData.returned_at = now;
  }

  const { error } = await supabase
    .from("booking_checklist_items")
    .update(updateData)
    .eq("id", checklistItemId)
    .eq("booking_id", bookingId);

  if (error) {
    throw new Error(error.message);
  }

  await syncChecklistInventoryWorkflow({
    bookingId,
    checklistItemId,
  });

  revalidateDriverPages(bookingId, date);
}

export async function updateDriverRouteStopStatusAction(formData: FormData) {
  const supabase = await createClient();

  const stopId = getString(formData, "stopId");
  const bookingId = getString(formData, "bookingId");
  const status = getString(formData, "status");
  const date = getString(formData, "date");

  if (!stopId) {
    throw new Error("Missing route stop id.");
  }

  if (!status) {
    throw new Error("Missing status.");
  }

  // Any real route progress must auto-start the driver's work shift.
  if (["on_the_way", "arrived", "installed", "picked_up", "completed"].includes(status)) {
    try {
      await ensureWorkStartedAction("driver_route");
    } catch (error: any) {
      console.warn("Driver time auto-start failed in checklist", {
        stopId,
        status,
        message: String(error?.message || error || "Unknown error"),
      });
    }
  }

  const now = new Date().toISOString();

  const updateData: Record<string, any> = {
    status,
    updated_at: now,
  };

  if (status === "arrived") {
    updateData.arrived_at = now;
  }

  if (["installed", "picked_up", "completed"].includes(status)) {
    updateData.completed_at = now;
  }

  const { error } = await supabase
    .from("route_stops")
    .update(updateData)
    .eq("id", stopId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateDriverPages(bookingId || undefined, date);
}

export async function uploadDriverChecklistPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const routeStopId = getNullableString(formData, "routeStopId");
  const checklistItemId = getNullableString(formData, "checklistItemId");
  const inventoryItemId = getNullableString(formData, "inventoryItemId");
  const inventoryUnitId = getNullableString(formData, "inventoryUnitId");
  const photoType = normalizePhotoType(getString(formData, "photoType"));
  const caption = getNullableString(formData, "caption");
  const takenBy = getNullableString(formData, "takenBy");
  const date = getString(formData, "date");

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

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
    "driver-checklist",
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
      throw new Error("booking_photos table is missing. Run the Photos SQL first.");
    }

    throw new Error(insertResult.error.message);
  }

  revalidateDriverPages(bookingId, date);
}
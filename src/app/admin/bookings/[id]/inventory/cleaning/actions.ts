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

function revalidateCleaning(unitId?: string, itemId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/cleaning");
  revalidatePath("/admin/inventory/operations");
  revalidatePath("/admin/inventory/movements");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/bookings/new");

  if (unitId) {
    revalidatePath(`/admin/inventory/units/${unitId}`);
  }

  if (itemId) {
    revalidatePath(`/admin/inventory/items/${itemId}`);
  }
}

async function updateUnitCleaningStatus({
  unitId,
  statusTo,
  cleanedBy,
  notes,
}: {
  unitId: string;
  statusTo: string;
  cleanedBy: string | null;
  notes: string | null;
}) {
  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("inventory_units")
    .select("id, inventory_item_id, status")
    .eq("id", unitId)
    .single();

  if (unitError) {
    throw new Error(unitError.message);
  }

  const statusFrom = String(unit.status || "");

  const updateData: Record<string, any> = {
    status: statusTo,
    updated_at: new Date().toISOString(),
  };

  if (statusTo === "available") {
    updateData.last_cleaned_at = new Date().toISOString();
    updateData.cleaned_by = cleanedBy;
    updateData.cleaning_notes = notes;
  }

  if (statusTo === "cleaning") {
    updateData.cleaning_notes = notes;
  }

  const { error: updateError } = await supabase
    .from("inventory_units")
    .update(updateData)
    .eq("id", unitId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: logError } = await supabase
    .from("inventory_cleaning_logs")
    .insert({
      inventory_unit_id: unitId,
      inventory_item_id: unit.inventory_item_id,
      status_from: statusFrom || null,
      status_to: statusTo,
      cleaned_by: cleanedBy,
      notes,
    });

  if (logError) {
    throw new Error(logError.message);
  }

  revalidateCleaning(unitId, unit.inventory_item_id);
}

export async function startCleaningUnitAction(formData: FormData) {
  const unitId = getString(formData, "unitId");
  const cleanedBy = getNullableString(formData, "cleanedBy");
  const notes = getNullableString(formData, "notes");

  if (!unitId) {
    throw new Error("Missing unit id.");
  }

  await updateUnitCleaningStatus({
    unitId,
    statusTo: "cleaning",
    cleanedBy,
    notes,
  });
}

export async function markUnitCleanedAction(formData: FormData) {
  const unitId = getString(formData, "unitId");
  const cleanedBy = getNullableString(formData, "cleanedBy");
  const notes = getNullableString(formData, "notes");

  if (!unitId) {
    throw new Error("Missing unit id.");
  }

  await updateUnitCleaningStatus({
    unitId,
    statusTo: "available",
    cleanedBy,
    notes,
  });
}

export async function markUnitDirtyAction(formData: FormData) {
  const unitId = getString(formData, "unitId");
  const cleanedBy = getNullableString(formData, "cleanedBy");
  const notes = getNullableString(formData, "notes");

  if (!unitId) {
    throw new Error("Missing unit id.");
  }

  await updateUnitCleaningStatus({
    unitId,
    statusTo: "dirty",
    cleanedBy,
    notes,
  });
}

export async function sendUnitToMaintenanceAction(formData: FormData) {
  const unitId = getString(formData, "unitId");
  const cleanedBy = getNullableString(formData, "cleanedBy");
  const notes = getNullableString(formData, "notes");

  if (!unitId) {
    throw new Error("Missing unit id.");
  }

  await updateUnitCleaningStatus({
    unitId,
    statusTo: "maintenance",
    cleanedBy,
    notes,
  });
}

export async function archiveUnitFromCleaningAction(formData: FormData) {
  const unitId = getString(formData, "unitId");
  const cleanedBy = getNullableString(formData, "cleanedBy");
  const notes = getNullableString(formData, "notes");

  if (!unitId) {
    throw new Error("Missing unit id.");
  }

  await updateUnitCleaningStatus({
    unitId,
    statusTo: "archived",
    cleanedBy,
    notes,
  });
}
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

  if (!value) {
    return fallback;
  }

  const parsed = Number(value.replace(",", "."));

  return Number.isNaN(parsed) ? fallback : parsed;
}

function revalidateDamages(unitId?: string, itemId?: string, bookingId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/damages");
  revalidatePath("/admin/inventory/cleaning");
  revalidatePath("/admin/inventory/operations");
  revalidatePath("/admin/inventory/movements");
  revalidatePath("/admin/bookings");

  if (unitId) {
    revalidatePath(`/admin/inventory/units/${unitId}`);
  }

  if (itemId) {
    revalidatePath(`/admin/inventory/items/${itemId}`);
  }

  if (bookingId) {
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath(`/admin/bookings/${bookingId}/inventory`);
  }
}

const allowedStatuses = [
  "reported",
  "repair_needed",
  "in_repair",
  "repaired",
  "retired",
  "closed",
  "cancelled",
];

const allowedSeverities = ["low", "medium", "high", "critical"];

function unitStatusForDamageStatus(status: string) {
  if (status === "reported") return "damaged";
  if (status === "repair_needed") return "repair_needed";
  if (status === "in_repair") return "in_repair";
  if (status === "repaired") return "available";
  if (status === "retired") return "retired";
  if (status === "closed") return "available";

  return null;
}

export async function createDamageReportAction(formData: FormData) {
  const supabase = await createClient();

  const inventoryUnitId = getNullableString(formData, "inventoryUnitId");
  const bookingId = getNullableString(formData, "bookingId");

  const severity = getString(formData, "severity") || "medium";
  const status = getString(formData, "status") || "reported";

  const reportedBy = getNullableString(formData, "reportedBy");
  const assignedTo = getNullableString(formData, "assignedTo");

  const damageTitle = getNullableString(formData, "damageTitle");
  const damageDescription = getNullableString(formData, "damageDescription");
  const repairNotes = getNullableString(formData, "repairNotes");

  const estimatedRepairCost = getNumber(formData, "estimatedRepairCost", 0);
  const actualRepairCost = getNumber(formData, "actualRepairCost", 0);

  if (!inventoryUnitId) {
    throw new Error("Choose inventory unit.");
  }

  if (!damageTitle && !damageDescription) {
    throw new Error("Add damage title or description.");
  }

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid damage status.");
  }

  if (!allowedSeverities.includes(severity)) {
    throw new Error("Invalid damage severity.");
  }

  const { data: unit, error: unitError } = await supabase
    .from("inventory_units")
    .select("id, inventory_item_id, status")
    .eq("id", inventoryUnitId)
    .single();

  if (unitError) {
    throw new Error(unitError.message);
  }

  const { data: report, error: reportError } = await supabase
    .from("inventory_damage_reports")
    .insert({
      inventory_unit_id: inventoryUnitId,
      inventory_item_id: unit.inventory_item_id,
      booking_id: bookingId,

      status,
      severity,

      reported_by: reportedBy,
      assigned_to: assignedTo,

      damage_title: damageTitle,
      damage_description: damageDescription,
      repair_notes: repairNotes,

      estimated_repair_cost: estimatedRepairCost,
      actual_repair_cost: actualRepairCost,

      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (reportError) {
    throw new Error(reportError.message);
  }

  const nextUnitStatus = unitStatusForDamageStatus(status);

  if (nextUnitStatus) {
    const unitUpdate: Record<string, any> = {
      status: nextUnitStatus,
      damage_notes: damageDescription || damageTitle,
      updated_at: new Date().toISOString(),
    };

    if (["reported", "repair_needed", "in_repair"].includes(status)) {
      unitUpdate.damaged_at = new Date().toISOString();
    }

    if (status === "repaired" || status === "closed") {
      unitUpdate.repaired_at = new Date().toISOString();
      unitUpdate.repair_notes = repairNotes;
    }

    const { error: updateUnitError } = await supabase
      .from("inventory_units")
      .update(unitUpdate)
      .eq("id", inventoryUnitId);

    if (updateUnitError) {
      throw new Error(updateUnitError.message);
    }
  }

  revalidateDamages(inventoryUnitId, unit.inventory_item_id, bookingId || undefined);

}

export async function updateDamageReportAction(formData: FormData) {
  const supabase = await createClient();

  const reportId = getString(formData, "reportId");

  if (!reportId) {
    throw new Error("Missing damage report id.");
  }

  const status = getString(formData, "status") || "reported";
  const severity = getString(formData, "severity") || "medium";

  const reportedBy = getNullableString(formData, "reportedBy");
  const assignedTo = getNullableString(formData, "assignedTo");

  const damageTitle = getNullableString(formData, "damageTitle");
  const damageDescription = getNullableString(formData, "damageDescription");
  const repairNotes = getNullableString(formData, "repairNotes");

  const estimatedRepairCost = getNumber(formData, "estimatedRepairCost", 0);
  const actualRepairCost = getNumber(formData, "actualRepairCost", 0);

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid damage status.");
  }

  if (!allowedSeverities.includes(severity)) {
    throw new Error("Invalid damage severity.");
  }

  const { data: existingReport, error: existingError } = await supabase
    .from("inventory_damage_reports")
    .select("id, inventory_unit_id, inventory_item_id, booking_id")
    .eq("id", reportId)
    .single();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const updateData: Record<string, any> = {
    status,
    severity,

    reported_by: reportedBy,
    assigned_to: assignedTo,

    damage_title: damageTitle,
    damage_description: damageDescription,
    repair_notes: repairNotes,

    estimated_repair_cost: estimatedRepairCost,
    actual_repair_cost: actualRepairCost,

    updated_at: new Date().toISOString(),
  };

  if (status === "repaired") {
    updateData.repaired_at = new Date().toISOString();
  }

  if (status === "closed" || status === "cancelled") {
    updateData.closed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("inventory_damage_reports")
    .update(updateData)
    .eq("id", reportId);

  if (error) {
    throw new Error(error.message);
  }

  const nextUnitStatus = unitStatusForDamageStatus(status);

  if (existingReport.inventory_unit_id && nextUnitStatus) {
    const unitUpdate: Record<string, any> = {
      status: nextUnitStatus,
      damage_notes: damageDescription || damageTitle,
      repair_notes: repairNotes,
      updated_at: new Date().toISOString(),
    };

    if (["reported", "repair_needed", "in_repair"].includes(status)) {
      unitUpdate.damaged_at = new Date().toISOString();
    }

    if (status === "repaired" || status === "closed") {
      unitUpdate.repaired_at = new Date().toISOString();
    }

    const { error: unitError } = await supabase
      .from("inventory_units")
      .update(unitUpdate)
      .eq("id", existingReport.inventory_unit_id);

    if (unitError) {
      throw new Error(unitError.message);
    }
  }

  revalidateDamages(
    existingReport.inventory_unit_id || undefined,
    existingReport.inventory_item_id || undefined,
    existingReport.booking_id || undefined
  );
}

export async function quickUpdateDamageStatusAction(formData: FormData) {
  const supabase = await createClient();

  const reportId = getString(formData, "reportId");
  const status = getString(formData, "status");

  if (!reportId) {
    throw new Error("Missing damage report id.");
  }

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid damage status.");
  }

  const { data: existingReport, error: existingError } = await supabase
    .from("inventory_damage_reports")
    .select("id, inventory_unit_id, inventory_item_id, booking_id, repair_notes, damage_title, damage_description")
    .eq("id", reportId)
    .single();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const updateData: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "repaired") {
    updateData.repaired_at = new Date().toISOString();
  }

  if (status === "closed" || status === "cancelled") {
    updateData.closed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("inventory_damage_reports")
    .update(updateData)
    .eq("id", reportId);

  if (error) {
    throw new Error(error.message);
  }

  const nextUnitStatus = unitStatusForDamageStatus(status);

  if (existingReport.inventory_unit_id && nextUnitStatus) {
    const unitUpdate: Record<string, any> = {
      status: nextUnitStatus,
      updated_at: new Date().toISOString(),
    };

    if (["reported", "repair_needed", "in_repair"].includes(status)) {
      unitUpdate.damaged_at = new Date().toISOString();
      unitUpdate.damage_notes =
        existingReport.damage_description || existingReport.damage_title || null;
    }

    if (status === "repaired" || status === "closed") {
      unitUpdate.repaired_at = new Date().toISOString();
      unitUpdate.repair_notes = existingReport.repair_notes || null;
    }

    const { error: unitError } = await supabase
      .from("inventory_units")
      .update(unitUpdate)
      .eq("id", existingReport.inventory_unit_id);

    if (unitError) {
      throw new Error(unitError.message);
    }
  }

  revalidateDamages(
    existingReport.inventory_unit_id || undefined,
    existingReport.inventory_item_id || undefined,
    existingReport.booking_id || undefined
  );
}

export async function deleteDamageReportAction(formData: FormData) {
  const supabase = await createClient();

  const reportId = getString(formData, "reportId");

  if (!reportId) {
    throw new Error("Missing damage report id.");
  }

  const { data: existingReport, error: existingError } = await supabase
    .from("inventory_damage_reports")
    .select("id, inventory_unit_id, inventory_item_id, booking_id")
    .eq("id", reportId)
    .single();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const { error } = await supabase
    .from("inventory_damage_reports")
    .delete()
    .eq("id", reportId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateDamages(
    existingReport.inventory_unit_id || undefined,
    existingReport.inventory_item_id || undefined,
    existingReport.booking_id || undefined
  );
}
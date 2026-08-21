"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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

function revalidateDamages(itemId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/operations");
  revalidatePath("/admin/inventory/cleaning");
  revalidatePath("/admin/inventory/damages");
  revalidatePath("/admin/inventory/movements");

  if (itemId) {
    revalidatePath(`/admin/inventory/items/${itemId}`);
  }
}

export async function createDamageReportAction(formData: FormData) {
  const supabase = await createClient();

  const inventoryItemId = getNullableString(formData, "inventoryItemId");
  const inventoryUnitId = getNullableString(formData, "inventoryUnitId");
  const bookingId = getNullableString(formData, "bookingId");
  const idempotencyKey = getString(formData, "damageRequestId");
  const title = getString(formData, "title");
  const severity = getString(formData, "severity") || "medium";
  const repairCost = getNumber(formData, "repairCost", 0);
  const description = getNullableString(formData, "description");

  if (!title) {
    throw new Error("Damage title is required.");
  }

  if (!isUuid(idempotencyKey)) {
    throw new Error("Invalid damage request id.");
  }

  let resolvedItemId = inventoryItemId;

  if (inventoryUnitId && !resolvedItemId) {
    const { data: unit, error: unitError } = await supabase
      .from("inventory_units")
      .select("inventory_item_id")
      .eq("id", inventoryUnitId)
      .single();

    if (unitError) {
      throw new Error(unitError.message);
    }

    resolvedItemId = unit.inventory_item_id;
  }

  const { data: result, error } = await supabase.rpc("process_inventory_damage", {
    p_inventory_item_id: resolvedItemId,
    p_inventory_unit_id: inventoryUnitId,
    p_booking_id: bookingId,
    p_idempotency_key: idempotencyKey,
    p_title: title,
    p_severity: severity,
    p_repair_cost: repairCost,
    p_description: description,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!result || !["processed", "already_processed"].includes(result.status)) {
    throw new Error("Damage report transaction did not complete.");
  }

  revalidateDamages(resolvedItemId || undefined);
}

export async function updateDamageStatusAction(formData: FormData) {
  const supabase = await createClient();

  const reportId = getString(formData, "reportId");
  const status = getString(formData, "status") || "open";
  const unitStatus = getNullableString(formData, "unitStatus");
  const notes = getNullableString(formData, "notes");

  if (!reportId) {
    throw new Error("Missing damage report id.");
  }

  const { data: report, error: reportError } = await supabase
    .from("damage_reports")
    .select("id, inventory_item_id, inventory_unit_id, description")
    .eq("id", reportId)
    .single();

  if (reportError) {
    throw new Error(reportError.message);
  }

  const resolvedAt = status === "resolved" || status === "closed" ? new Date().toISOString() : null;
  const nextDescription = notes
    ? `${report.description || ""}\n\nUpdate: ${notes}`.trim()
    : report.description;

  const { error } = await supabase
    .from("damage_reports")
    .update({
      status,
      description: nextDescription,
      resolved_at: resolvedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) {
    throw new Error(error.message);
  }

  if (report.inventory_unit_id && unitStatus) {
    const { error: unitError } = await supabase
      .from("inventory_units")
      .update({
        status: unitStatus,
        condition: unitStatus === "available" ? "good" : unitStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", report.inventory_unit_id);

    if (unitError) {
      throw new Error(unitError.message);
    }
  }

  revalidateDamages(report.inventory_item_id || undefined);
}

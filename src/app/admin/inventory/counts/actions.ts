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

function getNullableUuid(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const value = getString(formData, key);
  if (!value) return fallback;

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? fallback : numberValue;
}

function makeCountNumber() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .slice(0, 19)
    .replace(/[-:T]/g, "");

  return `CNT-${stamp}`;
}

export async function createInventoryCountAction(formData: FormData) {
  const supabase = await createClient();

  const warehouseLocationId = getNullableUuid(formData, "warehouseLocationId");
  const notes = getNullableString(formData, "notes");

  const countNumber = makeCountNumber();

  const { error } = await supabase.rpc("start_inventory_count", {
    p_count_number: countNumber,
    p_warehouse_location_id: warehouseLocationId,
    p_notes: notes,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/counts");
}

export async function updateInventoryCountLineAction(formData: FormData) {
  const supabase = await createClient();

  const countId = getString(formData, "countId");
  const lineId = getString(formData, "lineId");
  const countedQuantity = getNumber(formData, "countedQuantity", 0);
  const expectedQuantity = getNumber(formData, "expectedQuantity", 0);
  const countedStatus = getNullableString(formData, "countedStatus");
  const notes = getNullableString(formData, "notes");

  if (!countId || !lineId) {
    throw new Error("Missing count line.");
  }

  const { error } = await supabase
    .from("inventory_count_lines")
    .update({
      counted_quantity: countedQuantity,
      difference_quantity: countedQuantity - expectedQuantity,
      counted_status: countedStatus,
      notes,
    })
    .eq("id", lineId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/inventory/counts");
}

export async function completeInventoryCountAction(formData: FormData) {
  const supabase = await createClient();

  const countId = getString(formData, "countId");

  if (!countId) {
    throw new Error("Missing count id.");
  }

  const { data: result, error } = await supabase.rpc("complete_inventory_count", {
    p_count_id: countId,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!result || !["processed", "already_processed"].includes(result.status)) {
    throw new Error("Inventory count completion did not complete.");
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/counts");
}

export async function cancelInventoryCountAction(formData: FormData) {
  const supabase = await createClient();

  const countId = getString(formData, "countId");

  if (!countId) {
    throw new Error("Missing count id.");
  }

  const { error } = await supabase
    .from("inventory_counts")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
    })
    .eq("id", countId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/inventory/counts");
}
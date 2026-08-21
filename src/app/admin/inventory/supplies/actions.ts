"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getDateString(formData: FormData, key: string) {
  const value = getString(formData, key);
  if (!value) return new Date().toISOString();

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function revalidateSupplies() {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/supplies");
  revalidatePath("/admin/inventory/receive");
  revalidatePath("/admin/inventory/movements");
}

async function getNextSupplyNumber() {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("inventory_supplies")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(error.message);
  }

  const nextNumber = (count || 0) + 1;

  return `SUP-${String(nextNumber).padStart(5, "0")}`;
}

export async function createInventorySupplyAction(formData: FormData) {
  const supabase = await createClient();

  const supplierName = getNullableString(formData, "supplierName");
  const warehouseLocationId = getNullableString(formData, "warehouseLocationId");
  const receivedBy = getNullableString(formData, "receivedBy");
  const currency = getString(formData, "currency") || "USD";
  const supplyDate = getDateString(formData, "supplyDate");
  const notes = getNullableString(formData, "notes");

  const supplyNumber = await getNextSupplyNumber();

  const { data: supply, error } = await supabase
    .from("inventory_supplies")
    .insert({
      supply_number: supplyNumber,
      supplier_name: supplierName,
      warehouse_location_id: warehouseLocationId,
      received_by: receivedBy,
      currency,
      status: "draft",
      supply_date: supplyDate,
      notes,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidateSupplies();

  redirect(`/admin/inventory/supplies/${supply.id}`);
}

export async function cancelInventorySupplyAction(formData: FormData) {
  const supabase = await createClient();

  const supplyId = getString(formData, "supplyId");

  if (!supplyId) {
    throw new Error("Missing supply id.");
  }

  const { data: supply, error: loadError } = await supabase
    .from("inventory_supplies")
    .select("id, status")
    .eq("id", supplyId)
    .single();

  if (loadError) {
    throw new Error(loadError.message);
  }

  if (supply.status !== "draft") {
    throw new Error("Only draft supplies can be cancelled.");
  }

  const { error } = await supabase
    .from("inventory_supplies")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplyId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSupplies();
  revalidatePath(`/admin/inventory/supplies/${supplyId}`);
}

export async function deleteDraftInventorySupplyAction(formData: FormData) {
  const supabase = await createClient();

  const supplyId = getString(formData, "supplyId");

  if (!supplyId) {
    throw new Error("Missing supply id.");
  }

  const { data: supply, error: loadError } = await supabase
    .from("inventory_supplies")
    .select("id, status")
    .eq("id", supplyId)
    .single();

  if (loadError) {
    throw new Error(loadError.message);
  }

  if (supply.status !== "draft" && supply.status !== "cancelled") {
    throw new Error("Only draft or cancelled supplies can be deleted.");
  }

  const { error } = await supabase
    .from("inventory_supplies")
    .delete()
    .eq("id", supplyId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSupplies();
}
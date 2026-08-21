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

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? fallback : numberValue;
}

function getNullableUuid(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function createMovement({
  movementType,
  itemId,
  unitId,
  quantity,
  fromStatus,
  toStatus,
  fromLocationId,
  toLocationId,
  reason,
  notes,
}: {
  movementType: string;
  itemId?: string | null;
  unitId?: string | null;
  quantity?: number;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  reason?: string | null;
  notes?: string | null;
}) {
  const supabase = await createClient();

  const { error } = await supabase.from("inventory_movements").insert({
    movement_type: movementType,
    inventory_item_id: itemId || null,
    inventory_unit_id: unitId || null,
    quantity: quantity || 1,
    from_status: fromStatus || null,
    to_status: toStatus || null,
    from_location_id: fromLocationId || null,
    to_location_id: toLocationId || null,
    reason: reason || null,
    notes: notes || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function createInventoryCategoryAction(formData: FormData) {
  const supabase = await createClient();

  const name = getString(formData, "name");
  const parentId = getNullableUuid(formData, "parentId");
  const sortOrder = getNumber(formData, "sortOrder", 100);

  if (!name) {
    throw new Error("Enter category name.");
  }

  const slug = slugify(name) || `category-${Date.now()}`;

  const { error } = await supabase.from("inventory_categories").upsert(
    {
      name,
      slug,
      parent_id: parentId,
      sort_order: sortOrder,
      active: true,
    },
    {
      onConflict: "slug",
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/categories");
}

export async function createWarehouseLocationAction(formData: FormData) {
  const supabase = await createClient();

  const name = getString(formData, "name");
  const locationType = getString(formData, "locationType") || "zone";
  const sortOrder = getNumber(formData, "sortOrder", 100);

  if (!name) {
    throw new Error("Enter location name.");
  }

  const slug = slugify(name) || `location-${Date.now()}`;

  const { error } = await supabase.from("warehouse_locations").upsert(
    {
      name,
      slug,
      location_type: locationType,
      sort_order: sortOrder,
      active: true,
    },
    {
      onConflict: "slug",
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/locations");
}

export async function createInventoryItemAction(formData: FormData) {
  const supabase = await createClient();

  const name = getString(formData, "name");
  const trackingType = getString(formData, "trackingType") || "serialized";
  const categoryId = getNullableUuid(formData, "categoryId");
  const sku = getNullableString(formData, "sku");
  const unitLabel = getString(formData, "unitLabel") || "each";
  const quantityOnHand = getNumber(formData, "quantityOnHand", 0);
  const reorderPoint = getNumber(formData, "reorderPoint", 0);

  if (!name) {
    throw new Error("Enter inventory item name.");
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      name,
      sku,
      tracking_type: trackingType,
      category_id: categoryId,
      unit_label: unitLabel,
      quantity_on_hand: trackingType === "quantity" ? quantityOnHand : 0,
      quantity_available: trackingType === "quantity" ? quantityOnHand : 0,
      reorder_point: reorderPoint,
      active: true,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createMovement({
    movementType: "purchase_receive",
    itemId: data.id,
    quantity: trackingType === "quantity" ? quantityOnHand : 1,
    toStatus: "available",
    reason: "New inventory item created",
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/receive");
}

export async function receiveQuantityStockAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");
  const quantity = getNumber(formData, "quantity", 0);
  const notes = getNullableString(formData, "notes");

  if (!itemId || quantity <= 0) {
    throw new Error("Choose item and enter quantity.");
  }

  const { data: item, error: itemError } = await supabase
    .from("inventory_items")
    .select("id, quantity_on_hand, quantity_available")
    .eq("id", itemId)
    .single();

  if (itemError || !item) {
    throw new Error(itemError?.message || "Inventory item not found.");
  }

  const quantityBefore = Number(item.quantity_on_hand || 0);
  const availableBefore = Number(item.quantity_available || 0);
  const quantityAfter = quantityBefore + quantity;
  const availableAfter = availableBefore + quantity;

  const { error: updateError } = await supabase
    .from("inventory_items")
    .update({
      quantity_on_hand: quantityAfter,
      quantity_available: availableAfter,
    })
    .eq("id", itemId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await supabase.from("inventory_adjustments").insert({
    adjustment_type: "receive",
    inventory_item_id: itemId,
    quantity_before: quantityBefore,
    quantity_change: quantity,
    quantity_after: quantityAfter,
    reason: "Receive stock",
    notes,
  });

  await createMovement({
    movementType: "purchase_receive",
    itemId,
    quantity,
    toStatus: "available",
    reason: "Receive stock",
    notes,
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/receive");
}

export async function createInventoryUnitAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");
  const unitCode = getString(formData, "unitCode");
  const status = getString(formData, "status") || "available";
  const warehouseLocationId = getNullableUuid(formData, "warehouseLocationId");
  const condition = getString(formData, "condition") || "good";
  const notes = getNullableString(formData, "notes");

  if (!itemId || !unitCode) {
    throw new Error("Choose item and enter unit code.");
  }

  const { data, error } = await supabase
    .from("inventory_units")
    .insert({
      inventory_item_id: itemId,
      unit_code: unitCode,
      status,
      warehouse_location_id: warehouseLocationId,
      condition,
      notes,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createMovement({
    movementType: "purchase_receive",
    itemId,
    unitId: data.id,
    quantity: 1,
    toStatus: status,
    toLocationId: warehouseLocationId,
    reason: "New unit created",
    notes,
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/receive");
}

export async function changeInventoryUnitStatusAction(formData: FormData) {
  const supabase = await createClient();

  const unitId = getString(formData, "unitId");
  const toStatus = getString(formData, "toStatus");
  const toLocationId = getNullableUuid(formData, "toLocationId");
  const reason = getNullableString(formData, "reason");
  const notes = getNullableString(formData, "notes");

  if (!unitId || !toStatus) {
    throw new Error("Choose unit and status.");
  }

  const { data: unit, error: unitError } = await supabase
    .from("inventory_units")
    .select("id, inventory_item_id, status, warehouse_location_id")
    .eq("id", unitId)
    .single();

  if (unitError || !unit) {
    throw new Error(unitError?.message || "Unit not found.");
  }

  const updatePayload: Record<string, any> = {
    status: toStatus,
    warehouse_location_id: toLocationId,
  };

  if (toStatus === "available") {
    updatePayload.last_inspected_at = new Date().toISOString();
  }

  if (toStatus === "cleaning") {
    updatePayload.last_cleaned_at = null;
  }

  if (toStatus === "retired") {
    updatePayload.retired_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from("inventory_units")
    .update(updatePayload)
    .eq("id", unitId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await createMovement({
    movementType: "status_change",
    itemId: unit.inventory_item_id,
    unitId,
    quantity: 1,
    fromStatus: unit.status,
    toStatus,
    fromLocationId: unit.warehouse_location_id,
    toLocationId,
    reason,
    notes,
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/movements");
}

export async function writeOffUnitAction(formData: FormData) {
  const supabase = await createClient();

  const unitId = getString(formData, "unitId");
  const writeOffStatus = getString(formData, "writeOffStatus") || "retired";
  const reason = getNullableString(formData, "reason");
  const notes = getNullableString(formData, "notes");

  if (!unitId) {
    throw new Error("Choose unit.");
  }

  const allowedStatuses = ["retired", "lost", "damaged", "maintenance"];

  if (!allowedStatuses.includes(writeOffStatus)) {
    throw new Error("Invalid write-off status.");
  }

  const { data: unit, error: unitError } = await supabase
    .from("inventory_units")
    .select("id, inventory_item_id, status, warehouse_location_id")
    .eq("id", unitId)
    .single();

  if (unitError || !unit) {
    throw new Error(unitError?.message || "Unit not found.");
  }

  const updatePayload: Record<string, any> = {
    status: writeOffStatus,
  };

  if (writeOffStatus === "retired") {
    updatePayload.retired_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("inventory_units")
    .update(updatePayload)
    .eq("id", unitId);

  if (error) {
    throw new Error(error.message);
  }

  let adjustmentType = "write_off";
  let movementType = "write_off";

  if (writeOffStatus === "lost") {
    adjustmentType = "loss";
    movementType = "lost";
  }

  if (writeOffStatus === "damaged" || writeOffStatus === "maintenance") {
    adjustmentType = "damage";
    movementType = "send_to_repair";
  }

  await supabase.from("inventory_adjustments").insert({
    adjustment_type: adjustmentType,
    inventory_item_id: unit.inventory_item_id,
    inventory_unit_id: unitId,
    quantity_change: writeOffStatus === "maintenance" ? 0 : -1,
    from_status: unit.status,
    to_status: writeOffStatus,
    reason,
    notes,
  });

  await createMovement({
    movementType,
    itemId: unit.inventory_item_id,
    unitId,
    quantity: 1,
    fromStatus: unit.status,
    toStatus: writeOffStatus,
    fromLocationId: unit.warehouse_location_id,
    reason,
    notes,
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/write-offs");
  revalidatePath("/admin/inventory/movements");
}
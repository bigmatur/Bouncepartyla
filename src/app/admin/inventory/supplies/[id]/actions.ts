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

  const parsed = Number(value.replace(",", "."));
  return Number.isNaN(parsed) ? fallback : parsed;
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

function cleanCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function revalidateSupply(supplyId: string) {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/supplies");
  revalidatePath(`/admin/inventory/supplies/${supplyId}`);
  revalidatePath("/admin/inventory/movements");
  revalidatePath("/admin/inventory/receive");
}

function lineTotal(quantity: number, unitCost: number) {
  return Number((quantity * unitCost).toFixed(2));
}

function buildUnitPrefix({
  supplyNumber,
  itemName,
  sku,
  lineId,
}: {
  supplyNumber: string | null;
  itemName: string | null;
  sku: string | null;
  lineId: string;
}) {
  const cleanSupply = cleanCode(supplyNumber || "SUP");
  const cleanSku = cleanCode(sku || "");
  const cleanName = cleanCode(itemName || "UNIT").slice(0, 18);
  const cleanLine = lineId.slice(0, 6).toUpperCase();

  return `${cleanSupply}-${cleanSku || cleanName || "UNIT"}-${cleanLine}`;
}

async function getNextUnitCodes({
  prefix,
  quantity,
}: {
  prefix: string;
  quantity: number;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_units")
    .select("unit_code")
    .ilike("unit_code", `${prefix}-%`);

  if (error) {
    throw new Error(error.message);
  }

  const usedNumbers = new Set<number>();

  for (const row of data || []) {
    const code = String(row.unit_code || "");
    const match = code.match(/-(\d+)$/);

    if (match) {
      usedNumbers.add(Number(match[1]));
    }
  }

  const result: string[] = [];
  let index = 1;

  while (result.length < quantity) {
    if (!usedNumbers.has(index)) {
      result.push(`${prefix}-${String(index).padStart(3, "0")}`);
    }

    index += 1;
  }

  return result;
}

export async function updateInventorySupplyHeaderAction(formData: FormData) {
  const supabase = await createClient();

  const supplyId = getString(formData, "supplyId");
  const supplierName = getNullableString(formData, "supplierName");
  const warehouseLocationId = getNullableString(formData, "warehouseLocationId");
  const receivedBy = getNullableString(formData, "receivedBy");
  const currency = getString(formData, "currency") || "USD";
  const supplyDate = getDateString(formData, "supplyDate");
  const notes = getNullableString(formData, "notes");

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
    throw new Error("Only draft supplies can be edited.");
  }

  const { error } = await supabase
    .from("inventory_supplies")
    .update({
      supplier_name: supplierName,
      warehouse_location_id: warehouseLocationId,
      received_by: receivedBy,
      currency,
      supply_date: supplyDate,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplyId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSupply(supplyId);
}

export async function addInventorySupplyLineAction(formData: FormData) {
  const supabase = await createClient();

  const supplyId = getString(formData, "supplyId");
  const inventoryItemId = getString(formData, "inventoryItemId");
  const quantity = getNumber(formData, "quantity", 1);
  const unitCost = getNumber(formData, "unitCost", 0);
  const condition = getString(formData, "condition") || "good";
  const notes = getNullableString(formData, "notes");

  if (!supplyId) {
    throw new Error("Missing supply id.");
  }

  if (!inventoryItemId) {
    throw new Error("Choose inventory item.");
  }

  if (quantity <= 0) {
    throw new Error("Quantity must be greater than 0.");
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
    throw new Error("Only draft supplies can be edited.");
  }

  const { error } = await supabase.from("inventory_supply_lines").insert({
    supply_id: supplyId,
    inventory_item_id: inventoryItemId,
    quantity,
    unit_cost: unitCost,
    total_cost: lineTotal(quantity, unitCost),
    condition,
    notes,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateSupply(supplyId);
}

export async function updateInventorySupplyLineAction(formData: FormData) {
  const supabase = await createClient();

  const supplyId = getString(formData, "supplyId");
  const lineId = getString(formData, "lineId");
  const inventoryItemId = getString(formData, "inventoryItemId");
  const quantity = getNumber(formData, "quantity", 1);
  const unitCost = getNumber(formData, "unitCost", 0);
  const condition = getString(formData, "condition") || "good";
  const notes = getNullableString(formData, "notes");

  if (!supplyId) {
    throw new Error("Missing supply id.");
  }

  if (!lineId) {
    throw new Error("Missing line id.");
  }

  if (!inventoryItemId) {
    throw new Error("Choose inventory item.");
  }

  if (quantity <= 0) {
    throw new Error("Quantity must be greater than 0.");
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
    throw new Error("Only draft supplies can be edited.");
  }

  const { error } = await supabase
    .from("inventory_supply_lines")
    .update({
      inventory_item_id: inventoryItemId,
      quantity,
      unit_cost: unitCost,
      total_cost: lineTotal(quantity, unitCost),
      condition,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lineId)
    .eq("supply_id", supplyId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSupply(supplyId);
}

export async function deleteInventorySupplyLineAction(formData: FormData) {
  const supabase = await createClient();

  const supplyId = getString(formData, "supplyId");
  const lineId = getString(formData, "lineId");

  if (!supplyId) {
    throw new Error("Missing supply id.");
  }

  if (!lineId) {
    throw new Error("Missing line id.");
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
    throw new Error("Only draft supply lines can be deleted.");
  }

  const { error } = await supabase
    .from("inventory_supply_lines")
    .delete()
    .eq("id", lineId)
    .eq("supply_id", supplyId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSupply(supplyId);
}

export async function receiveInventorySupplyAction(formData: FormData) {
  const supabase = await createClient();

  const supplyId = getString(formData, "supplyId");

  if (!supplyId) {
    throw new Error("Missing supply id.");
  }

  const { data: supply, error: supplyError } = await supabase
    .from("inventory_supplies")
    .select(
      `
      id,
      supply_number,
      warehouse_location_id,
      status
    `
    )
    .eq("id", supplyId)
    .single();

  if (supplyError) {
    throw new Error(supplyError.message);
  }

  if (supply.status !== "draft") {
    throw new Error("Only draft supplies can be received.");
  }

  const { data: lines, error: linesError } = await supabase
    .from("inventory_supply_lines")
    .select(
      `
      id,
      inventory_item_id,
      quantity,
      unit_cost,
      total_cost,
      condition,
      notes,
      inventory_items (
        id,
        name,
        sku,
        tracking_type,
        quantity_on_hand,
        quantity_available
      )
    `
    )
    .eq("supply_id", supplyId)
    .order("created_at", { ascending: true });

  if (linesError) {
    throw new Error(linesError.message);
  }

  if (!lines || lines.length === 0) {
    throw new Error("Add at least one supply line before receiving.");
  }

  for (const line of lines as any[]) {
    const item = Array.isArray(line.inventory_items)
      ? line.inventory_items[0]
      : line.inventory_items;

    if (!item) {
      throw new Error("Inventory item not found for one of the lines.");
    }

    const trackingType = String(item.tracking_type || "serialized");
    const quantity = Number(line.quantity || 0);
    const unitCost = Number(line.unit_cost || 0);

    if (quantity <= 0) {
      throw new Error(`Invalid quantity for ${item.name}.`);
    }

    if (trackingType === "quantity" || trackingType === "consumable") {
      const currentOnHand = Number(item.quantity_on_hand || 0);
      const currentAvailable = Number(item.quantity_available || 0);

      const { error: updateItemError } = await supabase
        .from("inventory_items")
        .update({
          quantity_on_hand: currentOnHand + quantity,
          quantity_available: currentAvailable + quantity,
          default_purchase_price: unitCost,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (updateItemError) {
        throw new Error(updateItemError.message);
      }

      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          inventory_item_id: item.id,
          supply_id: supplyId,
          supply_line_id: line.id,
          quantity,
          movement_type: "receive",
          status: "completed",
          to_location_id: supply.warehouse_location_id,
          unit_cost: unitCost,
          total_cost: Number(line.total_cost || 0),
          notes: line.notes || `Received from ${supply.supply_number}`,
        });

      if (movementError) {
        throw new Error(movementError.message);
      }

      const { error: lineUpdateError } = await supabase
        .from("inventory_supply_lines")
        .update({
          created_units_count: 0,
          received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", line.id);

      if (lineUpdateError) {
        throw new Error(lineUpdateError.message);
      }

      continue;
    }

    if (!Number.isInteger(quantity)) {
      throw new Error(`Serialized item "${item.name}" requires whole quantity.`);
    }

    const unitQuantity = Math.floor(quantity);

    const prefix = buildUnitPrefix({
      supplyNumber: supply.supply_number,
      itemName: item.name,
      sku: item.sku,
      lineId: line.id,
    });

    const unitCodes = await getNextUnitCodes({
      prefix,
      quantity: unitQuantity,
    });

    const unitRows = unitCodes.map((unitCode) => ({
      inventory_item_id: item.id,
      supply_id: supplyId,
      supply_line_id: line.id,
      unit_code: unitCode,
      serial_number: unitCode,
      barcode: unitCode,
      status: "available",
      warehouse_location_id: supply.warehouse_location_id,
      condition: line.condition || "good",
      purchase_price: unitCost,
      notes: line.notes,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }));

    const { data: createdUnits, error: unitsError } = await supabase
      .from("inventory_units")
      .insert(unitRows)
      .select("id, unit_code");

    if (unitsError) {
      throw new Error(unitsError.message);
    }

    const movementRows = (createdUnits || []).map((unit: any) => ({
      inventory_item_id: item.id,
      inventory_unit_id: unit.id,
      supply_id: supplyId,
      supply_line_id: line.id,
      quantity: 1,
      movement_type: "receive",
      status: "completed",
      to_location_id: supply.warehouse_location_id,
      unit_cost: unitCost,
      total_cost: unitCost,
      notes: `Received unit ${unit.unit_code} from ${supply.supply_number}`,
    }));

    if (movementRows.length > 0) {
      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert(movementRows);

      if (movementError) {
        throw new Error(movementError.message);
      }
    }

    const { error: lineUpdateError } = await supabase
      .from("inventory_supply_lines")
      .update({
        created_units_count: unitQuantity,
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.id);

    if (lineUpdateError) {
      throw new Error(lineUpdateError.message);
    }
  }

  const { error: updateSupplyError } = await supabase
    .from("inventory_supplies")
    .update({
      status: "received",
      received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplyId);

  if (updateSupplyError) {
    throw new Error(updateSupplyError.message);
  }

  revalidateSupply(supplyId);
}

export async function reverseInventorySupplyAction(formData: FormData) {
  const supabase = await createClient();

  const supplyId = getString(formData, "supplyId");

  if (!supplyId) {
    throw new Error("Missing supply id.");
  }

  const { data: supply, error: supplyError } = await supabase
    .from("inventory_supplies")
    .select(
      `
      id,
      supply_number,
      warehouse_location_id,
      status
    `
    )
    .eq("id", supplyId)
    .single();

  if (supplyError) {
    throw new Error(supplyError.message);
  }

  if (supply.status !== "received") {
    throw new Error("Only received supplies can be reversed.");
  }

  const { data: lines, error: linesError } = await supabase
    .from("inventory_supply_lines")
    .select(
      `
      id,
      inventory_item_id,
      quantity,
      unit_cost,
      total_cost,
      inventory_items (
        id,
        name,
        tracking_type,
        quantity_on_hand,
        quantity_available
      )
    `
    )
    .eq("supply_id", supplyId);

  if (linesError) {
    throw new Error(linesError.message);
  }

  for (const line of lines as any[]) {
    const item = Array.isArray(line.inventory_items)
      ? line.inventory_items[0]
      : line.inventory_items;

    if (!item) {
      throw new Error("Inventory item not found for reverse.");
    }

    const trackingType = String(item.tracking_type || "serialized");
    const quantity = Number(line.quantity || 0);
    const unitCost = Number(line.unit_cost || 0);

    if (trackingType === "quantity" || trackingType === "consumable") {
      const currentOnHand = Number(item.quantity_on_hand || 0);
      const currentAvailable = Number(item.quantity_available || 0);

      if (currentAvailable < quantity) {
        throw new Error(
          `Cannot reverse ${item.name}. Available quantity is lower than supply quantity.`
        );
      }

      const { error: updateItemError } = await supabase
        .from("inventory_items")
        .update({
          quantity_on_hand: Math.max(0, currentOnHand - quantity),
          quantity_available: Math.max(0, currentAvailable - quantity),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (updateItemError) {
        throw new Error(updateItemError.message);
      }

      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          inventory_item_id: item.id,
          supply_id: supplyId,
          supply_line_id: line.id,
          quantity: -quantity,
          movement_type: "reverse_receive",
          status: "completed",
          from_location_id: supply.warehouse_location_id,
          unit_cost: unitCost,
          total_cost: -Math.abs(Number(line.total_cost || 0)),
          notes: `Reverse receipt ${supply.supply_number}`,
        });

      if (movementError) {
        throw new Error(movementError.message);
      }

      await supabase
        .from("inventory_supply_lines")
        .update({
          reversed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", line.id);

      continue;
    }

    const { data: units, error: unitsError } = await supabase
      .from("inventory_units")
      .select("id, unit_code, status, deleted_at")
      .eq("supply_line_id", line.id);

    if (unitsError) {
      throw new Error(unitsError.message);
    }

    const activeUnits = (units || []).filter((unit: any) => !unit.deleted_at);
    const blockedUnits = activeUnits.filter(
      (unit: any) => String(unit.status || "") !== "available"
    );

    if (blockedUnits.length > 0) {
      throw new Error(
        `Cannot reverse ${item.name}. Some units are not available anymore.`
      );
    }

    for (const unit of activeUnits as any[]) {
      const { error: unitUpdateError } = await supabase
        .from("inventory_units")
        .update({
          status: "reversed",
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", unit.id);

      if (unitUpdateError) {
        throw new Error(unitUpdateError.message);
      }

      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          inventory_item_id: item.id,
          inventory_unit_id: unit.id,
          supply_id: supplyId,
          supply_line_id: line.id,
          quantity: -1,
          movement_type: "reverse_receive",
          status: "completed",
          from_location_id: supply.warehouse_location_id,
          unit_cost: unitCost,
          total_cost: -Math.abs(unitCost),
          notes: `Reverse unit ${unit.unit_code} from ${supply.supply_number}`,
        });

      if (movementError) {
        throw new Error(movementError.message);
      }
    }

    await supabase
      .from("inventory_supply_lines")
      .update({
        reversed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", line.id);
  }

  const { error: updateSupplyError } = await supabase
    .from("inventory_supplies")
    .update({
      status: "reversed",
      reversed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplyId);

  if (updateSupplyError) {
    throw new Error(updateSupplyError.message);
  }

  revalidateSupply(supplyId);
}
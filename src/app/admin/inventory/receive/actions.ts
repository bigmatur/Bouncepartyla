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

function getNumber(formData: FormData, key: string, fallback = 0) {
  const value = getString(formData, key);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value.replace(",", "."));

  return Number.isNaN(parsed) ? fallback : parsed;
}

function cleanFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function revalidateReceive(itemId?: string) {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/receive");
  revalidatePath("/admin/inventory/supplies");
  revalidatePath("/admin/inventory/movements");
  revalidatePath("/admin/inventory/returns");
  revalidatePath("/admin/inventory/write-offs");
  revalidatePath("/admin/bookings/new");

  if (itemId) {
    revalidatePath(`/admin/inventory/items/${itemId}`);
  }
}

async function uploadInventoryImage({
  file,
  folder,
}: {
  file: File | null;
  folder: string;
}) {
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  const supabase = await createClient();

  const fileExt = file.name.split(".").pop() || "jpg";
  const fileName = `${Date.now()}-${cleanFileName(
    file.name || `photo.${fileExt}`
  )}`;

  const filePath = `${folder}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("inventory-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage
    .from("inventory-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

function buildUnitPrefix({
  itemId,
  itemName,
  sku,
  prefix,
}: {
  itemId: string;
  itemName: string | null;
  sku: string | null;
  prefix: string | null;
}) {
  const manualPrefix = cleanCode(prefix || "");

  if (manualPrefix) {
    return manualPrefix;
  }

  const skuPrefix = cleanCode(sku || "");

  if (skuPrefix) {
    return skuPrefix;
  }

  const namePrefix = cleanCode(itemName || "UNIT").slice(0, 18);
  const idPrefix = itemId.slice(0, 6).toUpperCase();

  return `${namePrefix || "UNIT"}-${idPrefix}`;
}

async function getNextUnitCodes({
  itemId,
  itemName,
  sku,
  prefix,
  quantity,
}: {
  itemId: string;
  itemName: string | null;
  sku: string | null;
  prefix: string | null;
  quantity: number;
}) {
  const supabase = await createClient();

  const unitPrefix = buildUnitPrefix({
    itemId,
    itemName,
    sku,
    prefix,
  });

  const { data: existingCodes, error } = await supabase
    .from("inventory_units")
    .select("unit_code")
    .ilike("unit_code", `${unitPrefix}-%`);

  if (error) {
    throw new Error(error.message);
  }

  const usedNumbers = new Set<number>();

  for (const row of existingCodes || []) {
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
      result.push(`${unitPrefix}-${String(index).padStart(3, "0")}`);
    }

    index += 1;
  }

  return result;
}

export async function createInventoryItemFromReceiveAction(formData: FormData) {
  const supabase = await createClient();

  const name = getString(formData, "name");
  const sku = getNullableString(formData, "sku");
  const categoryId = getNullableString(formData, "categoryId");
  const trackingType = getString(formData, "trackingType") || "serialized";
  const description = getNullableString(formData, "description");
  const unitLabel = getString(formData, "unitLabel") || "unit";
  const defaultPurchasePrice = getNumber(formData, "defaultPurchasePrice", 0);
  const minimumStock = getNumber(formData, "minimumStock", 0);
  const reorderPoint = getNumber(formData, "reorderPoint", 0);
  const sortOrder = getNumber(formData, "sortOrder", 100);
  const photo = formData.get("photo");

  if (!name) {
    throw new Error("Item name is required.");
  }

  const imageUrl = await uploadInventoryImage({
    file: photo instanceof File ? photo : null,
    folder: "inventory-items/new",
  });

  const { data: createdItem, error } = await supabase
    .from("inventory_items")
    .insert({
      name,
      sku,
      category_id: categoryId,
      tracking_type: trackingType,
      description,
      unit_label: unitLabel,
      quantity_on_hand: 0,
      quantity_available: 0,
      minimum_stock: minimumStock,
      reorder_point: reorderPoint,
      default_purchase_price: defaultPurchasePrice,
      image_url: imageUrl,
      sort_order: sortOrder,
      active: true,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidateReceive(createdItem.id);

  /**
   * ВАЖНО:
   * Раньше был redirect на карточку товара.
   * Из-за этого ты создавал товар, но не видел его сразу в списке приема.
   * Теперь возвращаем обратно на Receive, чтобы новый item появился в списке.
   */
  redirect(`/admin/inventory/receive?createdItemId=${createdItem.id}`);
}

/**
 * Алиас для старой страницы, если page.tsx импортирует createInventoryItemAction.
 */
export const createInventoryItemAction = createInventoryItemFromReceiveAction;

export async function receiveInventoryStockAction(formData: FormData) {
  const supabase = await createClient();

  /**
   * Поддерживаем оба варианта имен:
   * старый page.tsx: itemId / locationId
   * новый компонент: inventoryItemId / warehouseLocationId
   */
  const itemId =
    getString(formData, "inventoryItemId") || getString(formData, "itemId");

  const locationId =
    getNullableString(formData, "warehouseLocationId") ||
    getNullableString(formData, "locationId");

  const quantityInput = getString(formData, "quantity");
  const purchasePrice = Math.max(0, getNumber(formData, "purchasePrice", 0));
  const serialPrefix = getNullableString(formData, "serialPrefix");
  const condition = getString(formData, "condition") || "good";
  const notes = getNullableString(formData, "notes");

  if (!itemId) {
    throw new Error("Choose inventory item.");
  }

  const { data: item, error: itemError } = await supabase
    .from("inventory_items")
    .select(
      `
      id,
      name,
      sku,
      tracking_type,
      quantity_on_hand,
      quantity_available,
      image_url
    `
    )
    .eq("id", itemId)
    .is("deleted_at", null)
    .neq("active", false)
    .single();

  if (itemError) {
    throw new Error(itemError.message);
  }

  const trackingType = String(item.tracking_type || "serialized");

  const parsedSerializedQuantity = quantityInput
    ? Number(quantityInput.replace(",", "."))
    : Number.NaN;

  if (
    trackingType !== "quantity" &&
    trackingType !== "consumable" &&
    (!Number.isFinite(parsedSerializedQuantity) ||
      !Number.isInteger(parsedSerializedQuantity) ||
      parsedSerializedQuantity < 1)
  ) {
    throw new Error("Serialized and kit items require a whole quantity of at least 1.");
  }

  const quantity =
    trackingType === "quantity" || trackingType === "consumable"
      ? Math.max(1, getNumber(formData, "quantity", 1))
      : parsedSerializedQuantity;

  if (trackingType === "quantity" || trackingType === "consumable") {
    const currentOnHand = Number(item.quantity_on_hand || 0);
    const currentAvailable = Number(item.quantity_available || 0);

    const nextOnHand = currentOnHand + quantity;
    const nextAvailable = currentAvailable + quantity;

    const { error: updateError } = await supabase
      .from("inventory_items")
      .update({
        quantity_on_hand: nextOnHand,
        quantity_available: nextAvailable,
        default_purchase_price: purchasePrice,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const { error: movementError } = await supabase
      .from("inventory_movements")
      .insert({
        inventory_item_id: itemId,
        quantity,
        movement_type: "receive",
        status: "completed",
        to_location_id: locationId,
        unit_cost: purchasePrice,
        total_cost: Number((purchasePrice * quantity).toFixed(2)),
        notes: notes || "Received quantity stock.",
      });

    if (movementError) {
      throw new Error(movementError.message);
    }

    revalidateReceive(itemId);

    redirect(`/admin/inventory/items/${itemId}`);
  }

  const unitCodes = await getNextUnitCodes({
    itemId,
    itemName: item.name,
    sku: item.sku,
    prefix: serialPrefix,
    quantity,
  });

  const unitRows = unitCodes.map((unitCode) => {
    return {
      inventory_item_id: itemId,
      unit_code: unitCode,
      serial_number: unitCode,
      barcode: unitCode,
      status: "available",
      warehouse_location_id: locationId,
      condition,
      purchase_price: purchasePrice,
      image_url: item.image_url || null,
      notes,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    };
  });

  const { data: createdUnits, error: unitsError } = await supabase
    .from("inventory_units")
    .insert(unitRows)
    .select("id, unit_code, serial_number");

  if (unitsError) {
    throw new Error(unitsError.message);
  }

  const movementRows = (createdUnits || []).map((unit: any) => ({
    inventory_item_id: itemId,
    inventory_unit_id: unit.id,
    quantity: 1,
    movement_type: "receive",
    status: "completed",
    to_location_id: locationId,
    unit_cost: purchasePrice,
    total_cost: purchasePrice,
    notes:
      notes ||
      `Received unit ${unit.serial_number || unit.unit_code || ""}`.trim(),
  }));

  if (movementRows.length > 0) {
    const { error: movementError } = await supabase
      .from("inventory_movements")
      .insert(movementRows);

    if (movementError) {
      throw new Error(movementError.message);
    }
  }

  revalidateReceive(itemId);

  redirect(`/admin/inventory/items/${itemId}`);
}
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
  if (!value) return fallback;

  const parsed = Number(value.replace(",", "."));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function cleanFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function revalidateInventoryItem(itemId: string) {
  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/inventory/items/${itemId}`);
  revalidatePath("/admin/inventory/receive");
  revalidatePath("/admin/inventory/movements");
  revalidatePath("/admin/inventory/returns");
  revalidatePath("/admin/inventory/write-offs");
}

async function archiveItemById(itemId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("inventory_items")
    .update({
      active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/receive");
  revalidatePath(`/admin/inventory/items/${itemId}`);
}

export async function updateInventoryItemAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");
  const name = getString(formData, "name");
  const sku = getNullableString(formData, "sku");
  const categoryId = getNullableString(formData, "categoryId");
  const trackingType = getString(formData, "trackingType") || "serialized";
  const description = getNullableString(formData, "description");
  const unitLabel = getString(formData, "unitLabel") || "unit";
  const quantityOnHand = getNumber(formData, "quantityOnHand", 0);
  const quantityAvailable = getNumber(formData, "quantityAvailable", 0);
  const minimumStock = getNumber(formData, "minimumStock", 0);
  const reorderPoint = getNumber(formData, "reorderPoint", 0);
  const defaultPurchasePrice = getNumber(formData, "defaultPurchasePrice", 0);
  const sortOrder = getNumber(formData, "sortOrder", 100);
  const notes = getNullableString(formData, "notes");
  const active = getBoolean(formData, "active");
  const needsCleaning = getBoolean(formData, "needsCleaning");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  if (!name) {
    throw new Error("Inventory item name is required.");
  }

  const { error } = await supabase
    .from("inventory_items")
    .update({
      name,
      sku,
      category_id: categoryId,
      tracking_type: trackingType,
      description,
      unit_label: unitLabel,
      quantity_on_hand: quantityOnHand,
      quantity_available: quantityAvailable,
      minimum_stock: minimumStock,
      reorder_point: reorderPoint,
      default_purchase_price: defaultPurchasePrice,
      sort_order: sortOrder,
      notes,
      needs_cleaning: needsCleaning,
      active,
      deleted_at: active ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryItem(itemId);
}

export async function uploadInventoryItemPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");
  const file = formData.get("photo");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose image file.");
  }

  const fileExt = file.name.split(".").pop() || "jpg";
  const fileName = `${Date.now()}-${cleanFileName(
    file.name || `photo.${fileExt}`
  )}`;
  const filePath = `inventory-items/${itemId}/${fileName}`;

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

  const { data: publicUrlData } = supabase.storage
    .from("inventory-images")
    .getPublicUrl(filePath);

  const imageUrl = publicUrlData.publicUrl;

  const { error: updateError } = await supabase
    .from("inventory_items")
    .update({
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidateInventoryItem(itemId);
}

export async function removeInventoryItemPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  const { error } = await supabase
    .from("inventory_items")
    .update({
      image_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryItem(itemId);
}

export async function updateInventoryUnitAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");
  const unitId = getString(formData, "unitId");
  const status = getString(formData, "status") || "available";
  const locationId = getNullableString(formData, "locationId");
  const condition = getString(formData, "condition") || "good";
  const reason = getNullableString(formData, "reason");
  const notes = getNullableString(formData, "notes");
  const purchasePrice = getNumber(formData, "purchasePrice", 0);
  const serialNumber = getNullableString(formData, "serialNumber");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  if (!unitId) {
    throw new Error("Missing inventory unit id.");
  }

  const { data: oldUnit, error: oldUnitError } = await supabase
    .from("inventory_units")
    .select("id, status, warehouse_location_id")
    .eq("id", unitId)
    .single();

  if (oldUnitError) {
    throw new Error(oldUnitError.message);
  }

  const deletedAt =
    status === "retired" || status === "lost" ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("inventory_units")
    .update({
      serial_number: serialNumber,
      barcode: serialNumber,
      status,
      warehouse_location_id: locationId,
      condition,
      notes,
      purchase_price: purchasePrice,
      deleted_at: deletedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", unitId);

  if (error) {
    throw new Error(error.message);
  }

  const statusChanged = oldUnit.status !== status;
  const locationChanged = oldUnit.warehouse_location_id !== locationId;

  if (statusChanged || locationChanged || reason || notes) {
    const movementType = statusChanged ? "status_change" : "location_transfer";

    const { error: movementError } = await supabase
      .from("inventory_movements")
      .insert({
        inventory_item_id: itemId,
        inventory_unit_id: unitId,
        quantity: 1,
        movement_type: movementType,
        status: "completed",
        from_location_id: oldUnit.warehouse_location_id,
        to_location_id: locationId,
        unit_cost: purchasePrice,
        total_cost: purchasePrice,
        notes:
          reason ||
          notes ||
          `Unit updated. Status: ${oldUnit.status || "—"} → ${status}.`,
      });

    if (movementError) {
      throw new Error(movementError.message);
    }
  }

  revalidateInventoryItem(itemId);
}

export async function uploadInventoryUnitPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");
  const unitId = getString(formData, "unitId");
  const file = formData.get("photo");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  if (!unitId) {
    throw new Error("Missing inventory unit id.");
  }

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose image file.");
  }

  const fileExt = file.name.split(".").pop() || "jpg";
  const fileName = `${Date.now()}-${cleanFileName(
    file.name || `photo.${fileExt}`
  )}`;
  const filePath = `inventory-units/${unitId}/${fileName}`;

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

  const { data: publicUrlData } = supabase.storage
    .from("inventory-images")
    .getPublicUrl(filePath);

  const imageUrl = publicUrlData.publicUrl;

  const { error: updateError } = await supabase
    .from("inventory_units")
    .update({
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", unitId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidateInventoryItem(itemId);
}

export async function archiveInventoryItemAction(formData: FormData) {
  const itemId = getString(formData, "itemId");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  await archiveItemById(itemId);
}

export async function restoreInventoryItemAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  const { error } = await supabase
    .from("inventory_items")
    .update({
      active: true,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryItem(itemId);
}

export async function deleteInventoryItemAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  const { count: unitsCount, error: unitsError } = await supabase
    .from("inventory_units")
    .select("id", { count: "exact", head: true })
    .eq("inventory_item_id", itemId);

  if (unitsError) {
    throw new Error(unitsError.message);
  }

  const { count: reservationsCount, error: reservationsError } = await supabase
    .from("inventory_reservations")
    .select("id", { count: "exact", head: true })
    .eq("inventory_item_id", itemId);

  if (reservationsError) {
    throw new Error(reservationsError.message);
  }

  const { count: movementsCount, error: movementsError } = await supabase
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("inventory_item_id", itemId);

  if (movementsError) {
    throw new Error(movementsError.message);
  }

  let recipesCount = 0;

  const recipeCheck = await supabase
    .from("inventory_recipes")
    .select("id", { count: "exact", head: true })
    .eq("inventory_item_id", itemId);

  if (!recipeCheck.error) {
    recipesCount += recipeCheck.count || 0;
  }

  const hasHistory =
    (unitsCount || 0) > 0 ||
    (reservationsCount || 0) > 0 ||
    (movementsCount || 0) > 0 ||
    recipesCount > 0;

  if (hasHistory) {
    await archiveItemById(itemId);
    redirect("/admin/inventory");
  }

  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", itemId);

  if (error) {
    const message = String(error.message || "").toLowerCase();

    const shouldArchiveInstead =
      message.includes("foreign key") ||
      message.includes("violates foreign key constraint") ||
      message.includes("is still referenced");

    if (shouldArchiveInstead) {
      await archiveItemById(itemId);
      redirect("/admin/inventory");
    }

    throw new Error(error.message);
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/receive");

  redirect("/admin/inventory");
}

export async function archiveInventoryUnitAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");
  const unitId = getString(formData, "unitId");
  const reason = getNullableString(formData, "reason");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  if (!unitId) {
    throw new Error("Missing inventory unit id.");
  }

  const { data: unit, error: unitError } = await supabase
    .from("inventory_units")
    .select("id, status, warehouse_location_id")
    .eq("id", unitId)
    .single();

  if (unitError) {
    throw new Error(unitError.message);
  }

  const { error } = await supabase
    .from("inventory_units")
    .update({
      status: "retired",
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", unitId);

  if (error) {
    throw new Error(error.message);
  }

  const { error: movementError } = await supabase
    .from("inventory_movements")
    .insert({
      inventory_item_id: itemId,
      inventory_unit_id: unitId,
      quantity: 1,
      movement_type: "write_off",
      status: "completed",
      from_location_id: unit.warehouse_location_id,
      notes: reason || `Unit archived. Previous status: ${unit.status || "—"}.`,
    });

  if (movementError) {
    throw new Error(movementError.message);
  }

  revalidateInventoryItem(itemId);
}

export async function restoreInventoryUnitAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");
  const unitId = getString(formData, "unitId");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  if (!unitId) {
    throw new Error("Missing inventory unit id.");
  }

  const { error } = await supabase
    .from("inventory_units")
    .update({
      status: "available",
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", unitId);

  if (error) {
    throw new Error(error.message);
  }

  const { error: movementError } = await supabase
    .from("inventory_movements")
    .insert({
      inventory_item_id: itemId,
      inventory_unit_id: unitId,
      quantity: 1,
      movement_type: "status_change",
      status: "completed",
      notes: "Unit restored from archive.",
    });

  if (movementError) {
    throw new Error(movementError.message);
  }

  revalidateInventoryItem(itemId);
}

export async function deleteInventoryUnitAction(formData: FormData) {
  const supabase = await createClient();

  const itemId = getString(formData, "itemId");
  const unitId = getString(formData, "unitId");

  if (!itemId) {
    throw new Error("Missing inventory item id.");
  }

  if (!unitId) {
    throw new Error("Missing inventory unit id.");
  }

  const { count: reservationsCount, error: reservationsError } = await supabase
    .from("inventory_reservations")
    .select("id", { count: "exact", head: true })
    .eq("inventory_unit_id", unitId);

  if (reservationsError) {
    throw new Error(reservationsError.message);
  }

  const { count: movementsCount, error: movementsError } = await supabase
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("inventory_unit_id", unitId);

  if (movementsError) {
    throw new Error(movementsError.message);
  }

  const hasHistory = (reservationsCount || 0) > 0 || (movementsCount || 0) > 0;

  if (hasHistory) {
    const { data: unit, error: unitError } = await supabase
      .from("inventory_units")
      .select("id, status, warehouse_location_id")
      .eq("id", unitId)
      .single();

    if (unitError) {
      throw new Error(unitError.message);
    }

    const { error: archiveError } = await supabase
      .from("inventory_units")
      .update({
        status: "retired",
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", unitId);

    if (archiveError) {
      throw new Error(archiveError.message);
    }

    const { error: movementError } = await supabase
      .from("inventory_movements")
      .insert({
        inventory_item_id: itemId,
        inventory_unit_id: unitId,
        quantity: 1,
        movement_type: "write_off",
        status: "completed",
        from_location_id: unit.warehouse_location_id,
        notes: `Unit removed from active inventory. Previous status: ${
          unit.status || "—"
        }.`,
      });

    if (movementError) {
      throw new Error(movementError.message);
    }

    revalidateInventoryItem(itemId);
    return;
  }

  const { error } = await supabase
    .from("inventory_units")
    .delete()
    .eq("id", unitId);

  if (error) {
    const message = String(error.message || "").toLowerCase();

    const shouldArchiveInstead =
      message.includes("foreign key") ||
      message.includes("violates foreign key constraint") ||
      message.includes("is still referenced");

    if (shouldArchiveInstead) {
      const { data: unit, error: unitError } = await supabase
        .from("inventory_units")
        .select("id, status, warehouse_location_id")
        .eq("id", unitId)
        .single();

      if (unitError) {
        throw new Error(unitError.message);
      }

      const { error: archiveError } = await supabase
        .from("inventory_units")
        .update({
          status: "retired",
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", unitId);

      if (archiveError) {
        throw new Error(archiveError.message);
      }

      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          inventory_item_id: itemId,
          inventory_unit_id: unitId,
          quantity: 1,
          movement_type: "write_off",
          status: "completed",
          from_location_id: unit.warehouse_location_id,
          notes: `Unit removed from active inventory. Previous status: ${
            unit.status || "—"
          }.`,
        });

      if (movementError) {
        throw new Error(movementError.message);
      }

      revalidateInventoryItem(itemId);
      return;
    }

    throw new Error(error.message);
  }

  revalidateInventoryItem(itemId);
}
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

function revalidateChecklist(bookingId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/checklist`);
  revalidatePath(`/admin/bookings/${bookingId}/inventory`);
  revalidatePath("/admin/routes");
  revalidatePath("/admin/routes/driver");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/cleaning");
  revalidatePath("/admin/inventory/damages");
  revalidatePath("/admin/inventory/operations");
  revalidatePath("/admin/inventory/movements");
}

const allowedItemTypes = [
  "equipment",
  "component",
  "addon",
  "supply",
  "document",
  "other",
];

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
      ? `Marked damaged from booking checklist: ${title}\n\n${notes}`
      : `Marked damaged from booking checklist: ${title}`;

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

          damage_title: `Checklist damage: ${title}`,
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
      ? `Marked missing from booking checklist: ${title}\n\n${notes}`
      : `Marked missing from booking checklist: ${title}`;

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
      ? `Needs cleaning from booking checklist: ${title}\n\n${notes}`
      : `Needs cleaning from booking checklist: ${title}`;

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

export async function addChecklistItemAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const title = getString(formData, "title");
  const itemType = getString(formData, "itemType") || "equipment";
  const quantity = getNumber(formData, "quantity", 1);
  const checkedBy = getNullableString(formData, "checkedBy");
  const notes = getNullableString(formData, "notes");
  const sortOrder = getNumber(formData, "sortOrder", 100);

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  if (!title) {
    throw new Error("Checklist item title is required.");
  }

  if (!allowedItemTypes.includes(itemType)) {
    throw new Error("Invalid checklist item type.");
  }

  const { error } = await supabase.from("booking_checklist_items").insert({
    booking_id: bookingId,
    title,
    item_type: itemType,
    source: "manual",
    quantity,
    checked_by: checkedBy,
    notes,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateChecklist(bookingId);
}

export async function updateChecklistItemAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const checklistItemId = getString(formData, "checklistItemId");

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  if (!checklistItemId) {
    throw new Error("Missing checklist item id.");
  }

  const title = getString(formData, "title");
  const itemType = getString(formData, "itemType") || "equipment";
  const quantity = getNumber(formData, "quantity", 1);
  const checkedBy = getNullableString(formData, "checkedBy");
  const notes = getNullableString(formData, "notes");
  const sortOrder = getNumber(formData, "sortOrder", 100);

  const loaded = getBoolean(formData, "loaded");
  const installed = getBoolean(formData, "installed");
  const pickedUp = getBoolean(formData, "pickedUp");
  const returned = getBoolean(formData, "returned");
  const needsCleaning = getBoolean(formData, "needsCleaning");
  const damaged = getBoolean(formData, "damaged");
  const missing = getBoolean(formData, "missing");

  if (!title) {
    throw new Error("Checklist item title is required.");
  }

  if (!allowedItemTypes.includes(itemType)) {
    throw new Error("Invalid checklist item type.");
  }

  const now = new Date().toISOString();

  const updateData: Record<string, any> = {
    title,
    item_type: itemType,
    quantity,
    checked_by: checkedBy,
    notes,
    sort_order: sortOrder,

    loaded,
    installed,
    picked_up: pickedUp,
    returned,
    needs_cleaning: needsCleaning,
    damaged,
    missing,

    updated_at: now,
  };

  if (loaded) {
    updateData.loaded_at = now;
  }

  if (installed) {
    updateData.installed_at = now;
  }

  if (pickedUp) {
    updateData.picked_up_at = now;
  }

  if (returned) {
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

  revalidateChecklist(bookingId);
}

export async function quickToggleChecklistItemAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const checklistItemId = getString(formData, "checklistItemId");
  const field = getString(formData, "field");
  const value = getBoolean(formData, "value");

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

  revalidateChecklist(bookingId);
}

export async function deleteChecklistItemAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const checklistItemId = getString(formData, "checklistItemId");

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  if (!checklistItemId) {
    throw new Error("Missing checklist item id.");
  }

  const { error } = await supabase
    .from("booking_checklist_items")
    .delete()
    .eq("id", checklistItemId)
    .eq("booking_id", bookingId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateChecklist(bookingId);
}

export async function generateChecklistFromBookingAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  const [itemsResult, reservationsResult, existingResult] = await Promise.all([
    supabase
      .from("booking_items")
      .select(
        `
        id,
        quantity,
        products (
          id,
          name
        )
      `
      )
      .eq("booking_id", bookingId),

    supabase
      .from("inventory_reservations")
      .select(
        `
        id,
        quantity,
        inventory_item_id,
        inventory_unit_id,
        inventory_items (
          id,
          name,
          sku
        ),
        inventory_units (
          id,
          unit_code,
          serial_number
        )
      `
      )
      .eq("booking_id", bookingId),

    supabase
      .from("booking_checklist_items")
      .select("id, title, booking_item_id, inventory_item_id, inventory_unit_id, source")
      .eq("booking_id", bookingId),
  ]);

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message);
  }

  if (reservationsResult.error) {
    throw new Error(reservationsResult.error.message);
  }

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  const existingKeys = new Set<string>();

  for (const row of existingResult.data || []) {
    const key = [
      String((row as any).source || ""),
      String((row as any).booking_item_id || ""),
      String((row as any).inventory_item_id || ""),
      String((row as any).inventory_unit_id || ""),
      String((row as any).title || ""),
    ].join("|");

    existingKeys.add(key);
  }

  const rows: any[] = [];
  let sortOrder = 100;

  for (const item of itemsResult.data || []) {
    const product = Array.isArray((item as any).products)
      ? (item as any).products[0]
      : (item as any).products;

    const title = String(product?.name || "Booking item");
    const key = [
      "booking_item",
      String((item as any).id || ""),
      "",
      "",
      title,
    ].join("|");

    if (!existingKeys.has(key)) {
      rows.push({
        booking_id: bookingId,
        booking_item_id: (item as any).id,
        title,
        item_type: "equipment",
        source: "booking_item",
        quantity: Number((item as any).quantity || 1),
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
      });

      sortOrder += 10;
    }
  }

  for (const reservation of reservationsResult.data || []) {
    const inventoryItem = Array.isArray((reservation as any).inventory_items)
      ? (reservation as any).inventory_items[0]
      : (reservation as any).inventory_items;

    const inventoryUnit = Array.isArray((reservation as any).inventory_units)
      ? (reservation as any).inventory_units[0]
      : (reservation as any).inventory_units;

    const itemName = String(inventoryItem?.name || "Inventory item");
    const unitCode = String(
      inventoryUnit?.unit_code || inventoryUnit?.serial_number || ""
    );

    const title = unitCode ? `${itemName} — ${unitCode}` : itemName;

    const key = [
      "inventory_reservation",
      "",
      String((reservation as any).inventory_item_id || inventoryItem?.id || ""),
      String((reservation as any).inventory_unit_id || inventoryUnit?.id || ""),
      title,
    ].join("|");

    if (!existingKeys.has(key)) {
      rows.push({
        booking_id: bookingId,
        inventory_item_id:
          (reservation as any).inventory_item_id || inventoryItem?.id || null,
        inventory_unit_id:
          (reservation as any).inventory_unit_id || inventoryUnit?.id || null,
        title,
        item_type: "component",
        source: "inventory_reservation",
        quantity: Number((reservation as any).quantity || 1),
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
      });

      sortOrder += 10;
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("booking_checklist_items").insert(rows);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidateChecklist(bookingId);
}
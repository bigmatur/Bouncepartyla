"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(formData: FormData, key: string, fallback = 1) {
  const value = getString(formData, key);
  if (!value) return fallback;

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? fallback : numberValue;
}

function getNullableUuid(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getTransitionConfig(targetStatus: string) {
  if (targetStatus === "picked") {
    return {
      reservationStatus: "picked",
      unitStatus: "picked",
      timestampColumn: "picked_at",
      movementType: "pick_for_order",
      reason: "Picked for booking",
    };
  }

  if (targetStatus === "loaded") {
    return {
      reservationStatus: "loaded",
      unitStatus: "loaded",
      timestampColumn: "loaded_at",
      movementType: "load_to_vehicle",
      reason: "Loaded to vehicle",
    };
  }

  if (targetStatus === "installed") {
    return {
      reservationStatus: "installed",
      unitStatus: "installed",
      timestampColumn: "installed_at",
      movementType: "install_at_event",
      reason: "Installed at event",
    };
  }

  if (targetStatus === "picked_up") {
    return {
      reservationStatus: "installed",
      unitStatus: "returned",
      timestampColumn: "picked_up_at",
      movementType: "pickup_from_event",
      reason: "Picked up from event",
    };
  }

  throw new Error("Invalid inventory transition.");
}

async function getBookingWindow(bookingId: string) {
  const supabase = await createClient();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, event_date, event_start_time, event_end_time")
    .eq("id", bookingId)
    .single();

  if (error || !booking) {
    throw new Error(error?.message || "Booking not found.");
  }

  const eventDate = booking.event_date;
  const startTime = booking.event_start_time || "08:00";
  const endTime = booking.event_end_time || "21:00";

  return {
    reservedFrom: `${eventDate}T${startTime}`,
    reservedUntil: `${eventDate}T${endTime}`,
  };
}

export async function autoReserveBookingItemsAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const defaultLocationId = getNullableUuid(formData, "locationId");
  const notes = getNullableString(formData, "notes");

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  const { reservedFrom, reservedUntil } = await getBookingWindow(bookingId);

  const { data: bookingItems, error: bookingItemsError } = await supabase
    .from("booking_items")
    .select(
      `
      id,
      quantity,
      products (
        id,
        name,
        inventory_item_id,
        inventory_items (
          id,
          name,
          tracking_type,
          quantity_available
        )
      )
    `
    )
    .eq("booking_id", bookingId);

  if (bookingItemsError) {
    throw new Error(bookingItemsError.message);
  }

  if (!bookingItems || bookingItems.length === 0) {
    throw new Error("This booking has no booking items.");
  }

  let createdCount = 0;
  const problems: string[] = [];

  for (const bookingItem of bookingItems as any[]) {
    const product = getOne(bookingItem.products);
    const inventoryItem = getOne(product?.inventory_items);
    const inventoryItemId = product?.inventory_item_id;

    if (!product || !inventoryItemId || !inventoryItem) {
      problems.push(`${product?.name || "Product"} is not linked to inventory.`);
      continue;
    }

    const requestedQuantity = Number(bookingItem.quantity || 1);
    const trackingType = inventoryItem.tracking_type;

    const { data: existingReservations, error: existingError } = await supabase
      .from("inventory_reservations")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("inventory_item_id", inventoryItemId)
      .is("returned_at", null);

    if (existingError) {
      throw new Error(existingError.message);
    }

    if ((existingReservations || []).length > 0) {
      problems.push(`${product.name} already has active reservation.`);
      continue;
    }

    if (trackingType === "quantity" || trackingType === "consumable") {
      const available = Number(inventoryItem.quantity_available || 0);

      if (available < requestedQuantity) {
        problems.push(
          `${inventoryItem.name}: not enough stock. Available ${available}, needed ${requestedQuantity}.`
        );
        continue;
      }

      const { error: reservationError } = await supabase
        .from("inventory_reservations")
        .insert({
          booking_id: bookingId,
          inventory_item_id: inventoryItemId,
          inventory_unit_id: null,
          quantity: requestedQuantity,
          status: "reserved",
          reserved_from: reservedFrom,
          reserved_until: reservedUntil,
          warehouse_location_id: defaultLocationId,
          notes: notes || "Auto reserved from booking item",
        });

      if (reservationError) {
        throw new Error(reservationError.message);
      }

      const { error: updateItemError } = await supabase
        .from("inventory_items")
        .update({
          quantity_available: available - requestedQuantity,
        })
        .eq("id", inventoryItemId);

      if (updateItemError) {
        throw new Error(updateItemError.message);
      }

      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          movement_type: "reservation_hold",
          inventory_item_id: inventoryItemId,
          booking_id: bookingId,
          quantity: requestedQuantity,
          to_status: "reserved",
          to_location_id: defaultLocationId,
          reason: "Auto reserved from booking item",
          notes,
        });

      if (movementError) {
        throw new Error(movementError.message);
      }

      createdCount += 1;
      continue;
    }

    const { data: availableUnits, error: unitsError } = await supabase
      .from("inventory_units")
      .select("id, status, warehouse_location_id")
      .eq("inventory_item_id", inventoryItemId)
      .in("status", ["available", "returned"])
      .limit(requestedQuantity);

    if (unitsError) {
      throw new Error(unitsError.message);
    }

    if (!availableUnits || availableUnits.length < requestedQuantity) {
      problems.push(
        `${inventoryItem.name}: not enough available units. Available ${
          availableUnits?.length || 0
        }, needed ${requestedQuantity}.`
      );
      continue;
    }

    for (const unit of availableUnits) {
      const locationId = defaultLocationId || unit.warehouse_location_id;

      const { error: reservationError } = await supabase
        .from("inventory_reservations")
        .insert({
          booking_id: bookingId,
          inventory_item_id: inventoryItemId,
          inventory_unit_id: unit.id,
          quantity: 1,
          status: "reserved",
          reserved_from: reservedFrom,
          reserved_until: reservedUntil,
          warehouse_location_id: locationId,
          notes: notes || "Auto reserved from booking item",
        });

      if (reservationError) {
        throw new Error(reservationError.message);
      }

      const { error: unitUpdateError } = await supabase
        .from("inventory_units")
        .update({
          status: "reserved",
          warehouse_location_id: locationId,
        })
        .eq("id", unit.id);

      if (unitUpdateError) {
        throw new Error(unitUpdateError.message);
      }

      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          movement_type: "reservation_hold",
          inventory_item_id: inventoryItemId,
          inventory_unit_id: unit.id,
          booking_id: bookingId,
          quantity: 1,
          from_status: unit.status,
          to_status: "reserved",
          from_location_id: unit.warehouse_location_id,
          to_location_id: locationId,
          reason: "Auto reserved from booking item",
          notes,
        });

      if (movementError) {
        throw new Error(movementError.message);
      }

      createdCount += 1;
    }
  }

  await supabase.from("inventory_movements").insert({
    movement_type: "other",
    booking_id: bookingId,
    quantity: createdCount,
    reason: "Auto reserve completed",
    notes:
      problems.length > 0
        ? `Created: ${createdCount}. Problems: ${problems.join(" | ")}`
        : `Created: ${createdCount}`,
  });

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/inventory`);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/movements");
}

export async function reserveSerializedUnitAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const itemId = getString(formData, "itemId");
  const unitId = getString(formData, "unitId");
  const locationId = getNullableUuid(formData, "locationId");
  const notes = getNullableString(formData, "notes");

  if (!bookingId || !itemId || !unitId) {
    throw new Error("Choose booking, item and unit.");
  }

  const { reservedFrom, reservedUntil } = await getBookingWindow(bookingId);

  const { data: unit, error: unitError } = await supabase
    .from("inventory_units")
    .select("id, status, warehouse_location_id")
    .eq("id", unitId)
    .single();

  if (unitError || !unit) {
    throw new Error(unitError?.message || "Unit not found.");
  }

  if (!["available", "returned"].includes(unit.status)) {
    throw new Error("This unit is not available for reservation.");
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("inventory_reservations")
    .insert({
      booking_id: bookingId,
      inventory_item_id: itemId,
      inventory_unit_id: unitId,
      quantity: 1,
      status: "reserved",
      reserved_from: reservedFrom,
      reserved_until: reservedUntil,
      warehouse_location_id: locationId || unit.warehouse_location_id,
      notes,
    })
    .select("id")
    .single();

  if (reservationError || !reservation) {
    throw new Error(reservationError?.message || "Could not reserve unit.");
  }

  const { error: unitUpdateError } = await supabase
    .from("inventory_units")
    .update({
      status: "reserved",
      warehouse_location_id: locationId || unit.warehouse_location_id,
    })
    .eq("id", unitId);

  if (unitUpdateError) {
    throw new Error(unitUpdateError.message);
  }

  const { error: movementError } = await supabase
    .from("inventory_movements")
    .insert({
      movement_type: "reservation_hold",
      inventory_item_id: itemId,
      inventory_unit_id: unitId,
      booking_id: bookingId,
      quantity: 1,
      from_status: unit.status,
      to_status: "reserved",
      from_location_id: unit.warehouse_location_id,
      to_location_id: locationId || unit.warehouse_location_id,
      reason: "Reserved for booking",
      notes,
    });

  if (movementError) {
    throw new Error(movementError.message);
  }

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/inventory`);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/movements");
}

export async function reserveQuantityItemAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const itemId = getString(formData, "itemId");
  const quantity = getNumber(formData, "quantity", 1);
  const locationId = getNullableUuid(formData, "locationId");
  const notes = getNullableString(formData, "notes");

  if (!bookingId || !itemId || quantity <= 0) {
    throw new Error("Choose item and quantity.");
  }

  const { reservedFrom, reservedUntil } = await getBookingWindow(bookingId);

  const { data: item, error: itemError } = await supabase
    .from("inventory_items")
    .select("id, quantity_available")
    .eq("id", itemId)
    .single();

  if (itemError || !item) {
    throw new Error(itemError?.message || "Inventory item not found.");
  }

  const available = Number(item.quantity_available || 0);

  if (available < quantity) {
    throw new Error(`Not enough stock. Available: ${available}.`);
  }

  const { error: reservationError } = await supabase
    .from("inventory_reservations")
    .insert({
      booking_id: bookingId,
      inventory_item_id: itemId,
      inventory_unit_id: null,
      quantity,
      status: "reserved",
      reserved_from: reservedFrom,
      reserved_until: reservedUntil,
      warehouse_location_id: locationId,
      notes,
    });

  if (reservationError) {
    throw new Error(reservationError.message);
  }

  const { error: updateItemError } = await supabase
    .from("inventory_items")
    .update({
      quantity_available: available - quantity,
    })
    .eq("id", itemId);

  if (updateItemError) {
    throw new Error(updateItemError.message);
  }

  const { error: movementError } = await supabase
    .from("inventory_movements")
    .insert({
      movement_type: "reservation_hold",
      inventory_item_id: itemId,
      booking_id: bookingId,
      quantity,
      to_status: "reserved",
      to_location_id: locationId,
      reason: "Quantity item reserved for booking",
      notes,
    });

  if (movementError) {
    throw new Error(movementError.message);
  }

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/inventory`);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/movements");
}

async function transitionReservation({
  reservationId,
  bookingId,
  targetStatus,
  locationId,
  notes,
}: {
  reservationId: string;
  bookingId: string;
  targetStatus: string;
  locationId: string | null;
  notes: string | null;
}) {
  const supabase = await createClient();
  const config = getTransitionConfig(targetStatus);

  const { data: reservation, error: reservationError } = await supabase
    .from("inventory_reservations")
    .select(
      `
      id,
      booking_id,
      inventory_item_id,
      inventory_unit_id,
      status,
      inventory_behavior,
      quantity,
      inventory_units (
        id,
        status,
        warehouse_location_id
      )
    `
    )
    .eq("id", reservationId)
    .single();

  if (reservationError || !reservation) {
    throw new Error(reservationError?.message || "Inventory reservation not found.");
  }

  const unit = getOne(reservation.inventory_units);

  if (
    targetStatus === "picked_up" &&
    !reservation.inventory_unit_id &&
    (reservation as any).inventory_behavior === "consumable"
  ) {
    const { error: returnError } = await supabase.rpc("process_inventory_return", {
      p_reservation_id: reservationId,
      p_item_id: reservation.inventory_item_id,
      p_unit_id: null,
      p_booking_id: bookingId,
      p_current_status: reservation.status,
      p_result_status: "returned",
      p_location_id: locationId,
      p_damage_reported: false,
      p_damage_notes: null,
      p_notes: notes,
    });

    if (returnError) {
      throw new Error(returnError.message);
    }

    return;
  }

  const reservationUpdate: Record<string, any> = {
    status: config.reservationStatus,
    warehouse_location_id: locationId,
    [config.timestampColumn]: new Date().toISOString(),
  };

  const { error: updateReservationError } = await supabase
    .from("inventory_reservations")
    .update(reservationUpdate)
    .eq("id", reservationId);

  if (updateReservationError) {
    throw new Error(updateReservationError.message);
  }

  if (reservation.inventory_unit_id) {
    const unitUpdate: Record<string, any> = {
      status: config.unitStatus,
      warehouse_location_id: locationId,
    };

    if (config.unitStatus === "returned") {
      unitUpdate.last_inspected_at = null;
    }

    const { error: unitUpdateError } = await supabase
      .from("inventory_units")
      .update(unitUpdate)
      .eq("id", reservation.inventory_unit_id);

    if (unitUpdateError) {
      throw new Error(unitUpdateError.message);
    }
  }

  const { error: movementError } = await supabase
    .from("inventory_movements")
    .insert({
      movement_type: config.movementType,
      inventory_item_id: reservation.inventory_item_id,
      inventory_unit_id: reservation.inventory_unit_id,
      booking_id: bookingId,
      quantity: reservation.quantity || 1,
      from_status: unit?.status || reservation.status,
      to_status: config.unitStatus,
      from_location_id: unit?.warehouse_location_id || null,
      to_location_id: locationId,
      reason: config.reason,
      notes,
    });

  if (movementError) {
    throw new Error(movementError.message);
  }
}

export async function transitionSingleReservationAction(formData: FormData) {
  const bookingId = getString(formData, "bookingId");
  const reservationId = getString(formData, "reservationId");
  const targetStatus = getString(formData, "targetStatus");
  const locationId = getNullableUuid(formData, "locationId");
  const notes = getNullableString(formData, "notes");

  if (!bookingId || !reservationId || !targetStatus) {
    throw new Error("Missing inventory transition data.");
  }

  await transitionReservation({
    reservationId,
    bookingId,
    targetStatus,
    locationId,
    notes,
  });

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/inventory`);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/returns");
  revalidatePath("/admin/inventory/movements");
}

export async function transitionAllReservationsAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const targetStatus = getString(formData, "targetStatus");
  const locationId = getNullableUuid(formData, "locationId");
  const notes = getNullableString(formData, "notes");

  if (!bookingId || !targetStatus) {
    throw new Error("Missing inventory transition data.");
  }

  const { data: reservations, error } = await supabase
    .from("inventory_reservations")
    .select("id")
    .eq("booking_id", bookingId)
    .is("returned_at", null);

  if (error) {
    throw new Error(error.message);
  }

  for (const reservation of reservations || []) {
    await transitionReservation({
      reservationId: reservation.id,
      bookingId,
      targetStatus,
      locationId,
      notes,
    });
  }

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/inventory`);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/returns");
  revalidatePath("/admin/inventory/movements");
}
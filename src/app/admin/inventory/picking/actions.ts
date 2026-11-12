"use server";

import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/lib/auth/require-admin";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(formData: FormData, key: string) {
  const value = getString(formData, key).toLowerCase();
  return value === "true" || value === "1" || value === "on";
}

function revalidatePicking(date: string) {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/picking");
  if (date) revalidatePath(`/admin/inventory/picking?date=${date}`);
}

async function setChecklistItemLoaded(params: {
  supabase: any;
  checklistItemId: string;
  loaded: boolean;
  bookingId?: string | null;
}) {
  const { data: checklistItem, error } = await params.supabase
    .from("booking_checklist_items")
    .select("id, booking_id, booking_item_id, inventory_item_id, inventory_unit_id, loaded, loaded_at")
    .eq("id", params.checklistItemId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!checklistItem || Boolean(checklistItem.loaded) === params.loaded) return;

  const now = new Date().toISOString();
  const checklistBookingId = String(checklistItem.booking_id || "");
  const { error: updateError } = await params.supabase
    .from("booking_checklist_items")
    .update({
      loaded: params.loaded,
      loaded_at: params.loaded ? (checklistItem.loaded_at || now) : null,
      updated_at: now,
    })
    .eq("id", params.checklistItemId);

  if (updateError) throw new Error(updateError.message);

  // Inventory-backed checklist rows keep the existing warehouse reservation
  // workflow in sync. Product/option rows do not have a reservation to move.
  let reservations = params.supabase
    .from("inventory_reservations")
    .select("id")
    .eq("booking_id", checklistBookingId)
    .in("status", ["reserved", "picked"]);

  // The same component can belong to more than one product in a booking
  // (for example, separate sandbags for two inflatables). Keep the warehouse
  // check tied to its product instead of moving every matching component.
  if (checklistItem.booking_item_id) {
    reservations = reservations.eq("booking_item_id", checklistItem.booking_item_id);
  }

  if (checklistItem.inventory_unit_id) {
    reservations = reservations.eq("inventory_unit_id", checklistItem.inventory_unit_id);
  } else if (checklistItem.inventory_item_id) {
    reservations = reservations
      .eq("inventory_item_id", checklistItem.inventory_item_id)
      .is("inventory_unit_id", null);
  } else {
    return;
  }

  const { data: reservationRows, error: reservationError } = await reservations;
  if (reservationError) throw new Error(reservationError.message);

  for (const reservation of reservationRows || []) {
    await setReservationPicked({
      supabase: params.supabase,
      reservationId: String(reservation.id),
      picked: params.loaded,
      bookingId: checklistBookingId,
    });
  }
}

async function setReservationPicked(params: {
  supabase: any;
  reservationId: string;
  picked: boolean;
  bookingId?: string | null;
}) {
  const { data: reservation, error } = await params.supabase
    .from("inventory_reservations")
    .select("id, booking_id, inventory_item_id, inventory_unit_id, quantity, status, picked_at, inventory_units ( id, status )")
    .eq("id", params.reservationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!reservation) return;

  const currentStatus = String(reservation.status || "reserved");
  const nextStatus = params.picked ? "picked" : "reserved";

  if (currentStatus === nextStatus) return;
  if (!["reserved", "picked"].includes(currentStatus)) return;

  const now = new Date().toISOString();

  const { error: updateError } = await params.supabase
    .from("inventory_reservations")
    .update({
      status: nextStatus,
      picked_at: params.picked ? (reservation.picked_at || now) : null,
      updated_at: now,
    })
    .eq("id", params.reservationId);

  if (updateError) throw new Error(updateError.message);

  if (reservation.inventory_unit_id) {
    const { error: unitError } = await params.supabase
      .from("inventory_units")
      .update({ status: nextStatus, updated_at: now })
      .eq("id", reservation.inventory_unit_id);

    if (unitError) throw new Error(unitError.message);
  }

  const { error: movementError } = await params.supabase
    .from("inventory_movements")
    .insert({
      movement_type: params.picked ? "pick_for_order" : "reservation_hold",
      inventory_item_id: reservation.inventory_item_id,
      inventory_unit_id: reservation.inventory_unit_id,
      // Never trust a booking id submitted by the browser for inventory
      // history. The reservation itself is the authoritative relationship.
      booking_id: reservation.booking_id,
      quantity: reservation.quantity || 1,
      from_status: currentStatus,
      to_status: nextStatus,
      reference_type: "inventory_reservation",
      reference_id: params.reservationId,
      reason: params.picked ? "Picked in warehouse" : "Unpicked in warehouse",
    });

  if (movementError) throw new Error(movementError.message);
}

export async function toggleWarehousePickingItemAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("inventory.edit");
  const reservationId = getString(formData, "reservationId");
  const bookingId = getString(formData, "bookingId");
  const date = getString(formData, "date");
  const picked = getBoolean(formData, "picked");

  if (!reservationId) throw new Error("Missing reservation id.");

  await setReservationPicked({ supabase, reservationId, bookingId, picked });
  revalidatePicking(date);
}

export async function setAllWarehousePickingItemsAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("inventory.edit");
  const bookingId = getString(formData, "bookingId");
  const date = getString(formData, "date");
  const picked = getBoolean(formData, "picked");

  if (!bookingId) throw new Error("Missing booking id.");

  const { data, error } = await supabase
    .from("inventory_reservations")
    .select("id")
    .eq("booking_id", bookingId)
    .in("status", ["reserved", "picked"]);

  if (error) throw new Error(error.message);

  for (const reservation of data || []) {
    await setReservationPicked({
      supabase,
      reservationId: String(reservation.id),
      bookingId,
      picked,
    });
  }

  revalidatePicking(date);
}

export async function toggleWarehouseChecklistItemAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("inventory.edit");
  const checklistItemId = getString(formData, "checklistItemId");
  const bookingId = getString(formData, "bookingId");
  const date = getString(formData, "date");
  const loaded = getBoolean(formData, "loaded");

  if (!checklistItemId) throw new Error("Missing checklist item id.");

  await setChecklistItemLoaded({
    supabase,
    checklistItemId,
    bookingId,
    loaded,
  });
  revalidatePicking(date);
}

export async function setAllWarehouseChecklistItemsAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("inventory.edit");
  const bookingId = getString(formData, "bookingId");
  const date = getString(formData, "date");
  const loaded = getBoolean(formData, "loaded");

  if (!bookingId) throw new Error("Missing booking id.");

  const { data, error } = await supabase
    .from("booking_checklist_items")
    .select("id")
    .eq("booking_id", bookingId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  for (const item of data || []) {
    await setChecklistItemLoaded({
      supabase,
      checklistItemId: String(item.id),
      bookingId,
      loaded,
    });
  }

  revalidatePicking(date);
}

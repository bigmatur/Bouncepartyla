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
      booking_id: params.bookingId || reservation.booking_id,
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
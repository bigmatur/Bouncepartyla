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

function getBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

export async function processReturnAction(formData: FormData) {
  const supabase = await createClient();

  const reservationId = getString(formData, "reservationId");
  const unitId = getNullableUuid(formData, "unitId");
  const itemId = getString(formData, "itemId");
  const bookingId = getNullableUuid(formData, "bookingId");
  const currentStatus = getNullableString(formData, "currentStatus");
  const resultStatus = getString(formData, "resultStatus") || "returned";
  const locationId = getNullableUuid(formData, "locationId");
  const damageReported = getBoolean(formData, "damageReported");
  const damageNotes = getNullableString(formData, "damageNotes");
  const notes = getNullableString(formData, "notes");

  if (!reservationId || !itemId) {
    throw new Error("Missing return data.");
  }

  const allowedStatuses = ["available", "returned", "cleaning", "maintenance", "damaged"];

  if (!allowedStatuses.includes(resultStatus)) {
    throw new Error("Invalid return status.");
  }

  const { error: returnError } = await supabase.rpc("process_inventory_return", {
    p_reservation_id: reservationId,
    p_item_id: itemId,
    p_unit_id: unitId,
    p_booking_id: bookingId,
    p_current_status: currentStatus,
    p_result_status: resultStatus,
    p_location_id: locationId,
    p_damage_reported: damageReported,
    p_damage_notes: damageNotes,
    p_notes: notes,
  });

  if (returnError) {
    throw new Error(returnError.message);
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/returns");
  revalidatePath("/admin/inventory/movements");

  if (itemId) {
    revalidatePath(`/admin/inventory/items/${itemId}`);
  }

  if (bookingId) {
    revalidatePath(`/admin/bookings/${bookingId}`);
  }
}
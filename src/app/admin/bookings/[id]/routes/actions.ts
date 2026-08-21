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

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function cleanDate(value: string | null) {
  if (!value) return null;

  const cleanValue = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    return null;
  }

  return cleanValue;
}

function cleanTime(value: string | null) {
  if (!value) return null;

  const cleanValue = value.trim();

  if (!/^\d{2}:\d{2}$/.test(cleanValue)) {
    return null;
  }

  return cleanValue;
}

function revalidateBookingRoutes(bookingId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/routes");
  revalidatePath("/admin/routes/driver");
  revalidatePath("/admin/routes/driver/checklists");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/routes`);
  revalidatePath(`/admin/bookings/${bookingId}/checklist`);
  revalidatePath("/admin/calendar");
}

export async function createBookingRouteStopsAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, status, archived_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    throw new Error(bookingError.message);
  }

  if (!booking) {
    throw new Error("Booking not found.");
  }

  const bookingStatus = String(booking.status || "").toLowerCase();

  if (booking.archived_at) {
    throw new Error("Archived bookings cannot be added to routes.");
  }

  if (bookingStatus === "cancelled" || bookingStatus === "canceled") {
    throw new Error("Cancelled bookings cannot be added to routes.");
  }

  const createDelivery = getBoolean(formData, "createDelivery");
  const createPickup = getBoolean(formData, "createPickup");

  if (!createDelivery && !createPickup) {
    throw new Error("Choose delivery, pickup or both.");
  }

  const { data: existingStops, error: existingStopsError } = await supabase
    .from("route_stops")
    .select("id, stop_type, status")
    .eq("booking_id", bookingId)
    .in("stop_type", ["delivery", "pickup"])
    .not("status", "in", '("cancelled","failed")');

  if (existingStopsError) {
    throw new Error(existingStopsError.message);
  }

  const hasDelivery = (existingStops || []).some(
    (stop: any) => stop.stop_type === "delivery"
  );

  const hasPickup = (existingStops || []).some(
    (stop: any) => stop.stop_type === "pickup"
  );

  const shouldCreateDelivery = createDelivery && !hasDelivery;
  const shouldCreatePickup = createPickup && !hasPickup;

  if (!shouldCreateDelivery && !shouldCreatePickup) {
    revalidateBookingRoutes(bookingId);
    redirect(`/admin/bookings/${bookingId}/routes?notice=already-exists`);
  }

  const customerName = getNullableString(formData, "customerName");
  const customerPhone = getNullableString(formData, "customerPhone");

  const address = getNullableString(formData, "address");
  const city = getNullableString(formData, "city");
  const state = getString(formData, "state") || "CA";
  const zip = getNullableString(formData, "zip");

  const driverName = getNullableString(formData, "driverName");
  const truckName = getNullableString(formData, "truckName");

  const itemsSummary = getNullableString(formData, "itemsSummary");
  const surface = getNullableString(formData, "surface");
  const gateCode = getNullableString(formData, "gateCode");
  const parkingNotes = getNullableString(formData, "parkingNotes");
  const setupNotes = getNullableString(formData, "setupNotes");
  const pickupNotes = getNullableString(formData, "pickupNotes");

  const balanceDue = getNumber(formData, "balanceDue", 0);

  const deliveryDate = cleanDate(getNullableString(formData, "deliveryDate"));
  const deliveryStartTime = cleanTime(
    getNullableString(formData, "deliveryStartTime")
  );
  const deliveryEndTime = cleanTime(
    getNullableString(formData, "deliveryEndTime")
  );

  const pickupDate = cleanDate(getNullableString(formData, "pickupDate"));
  const pickupStartTime = cleanTime(
    getNullableString(formData, "pickupStartTime")
  );
  const pickupEndTime = cleanTime(getNullableString(formData, "pickupEndTime"));

  const rows: any[] = [];
  const now = new Date().toISOString();

  if (shouldCreateDelivery) {
    if (!deliveryDate) {
      throw new Error("Delivery date is required.");
    }

    rows.push({
      booking_id: bookingId,
      stop_date: deliveryDate,
      stop_type: "delivery",
      status: "scheduled",

      customer_name: customerName,
      customer_phone: customerPhone,

      address,
      city,
      state,
      zip,

      scheduled_start_time: deliveryStartTime,
      scheduled_end_time: deliveryEndTime,

      driver_name: driverName,
      truck_name: truckName,

      items_summary: itemsSummary,
      surface,
      gate_code: gateCode,
      parking_notes: parkingNotes,
      setup_notes: setupNotes,
      pickup_notes: pickupNotes,

      balance_due: balanceDue,
      sort_order: 100,

      updated_at: now,
    });
  }

  if (shouldCreatePickup) {
    if (!pickupDate) {
      throw new Error("Pickup date is required.");
    }

    rows.push({
      booking_id: bookingId,
      stop_date: pickupDate,
      stop_type: "pickup",
      status: "scheduled",

      customer_name: customerName,
      customer_phone: customerPhone,

      address,
      city,
      state,
      zip,

      scheduled_start_time: pickupStartTime,
      scheduled_end_time: pickupEndTime,

      driver_name: driverName,
      truck_name: truckName,

      items_summary: itemsSummary,
      surface,
      gate_code: gateCode,
      parking_notes: parkingNotes,
      setup_notes: setupNotes,
      pickup_notes: pickupNotes,

      balance_due: 0,
      sort_order: 200,

      updated_at: now,
    });
  }

  const { error } = await supabase.from("route_stops").insert(rows);

  if (error) {
    throw new Error(error.message);
  }

  revalidateBookingRoutes(bookingId);

  redirect(`/admin/bookings/${bookingId}/routes?notice=created`);
}

export async function deleteBookingRouteStopAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const stopId = getString(formData, "stopId");

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  if (!stopId) {
    throw new Error("Missing route stop id.");
  }

  const { error } = await supabase
    .from("route_stops")
    .delete()
    .eq("id", stopId)
    .eq("booking_id", bookingId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateBookingRoutes(bookingId);
}
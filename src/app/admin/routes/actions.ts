"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertStaffPermission } from "@/lib/staff-access";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getBoolean(formData: FormData, key: string) {
  const value = getString(formData, key).toLowerCase();
  return value === "true" || value === "1" || value === "on" || value === "yes";
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const value = getString(formData, key);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value.replace(",", "."));

  return Number.isNaN(parsed) ? fallback : parsed;
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

function cleanJsonWindows(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => ({
        date: cleanDate(typeof item?.date === "string" ? item.date : null),
        start_time: cleanTime(
          typeof item?.start_time === "string" ? item.start_time : null,
        ),
        end_time: cleanTime(
          typeof item?.end_time === "string" ? item.end_time : null,
        ),
      }))
      .filter((item) => item.date && item.start_time && item.end_time);
  } catch {
    return [];
  }
}

function toMinutes(value: string | null | undefined) {
  if (!value) return null;

  const match = String(value).match(/^(\d{2}):(\d{2})/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
}

function toTime(totalMinutes: number) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minutes = String(normalized % 60).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function durationMinutes(
  start: string | null | undefined,
  end: string | null | undefined,
) {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);

  if (startMinutes == null || endMinutes == null) return null;

  if (endMinutes >= startMinutes) return endMinutes - startMinutes;

  return endMinutes + 1440 - startMinutes;
}

function breakMinutesFromStop(stop: any) {
  const setupNotes = String(stop?.setup_notes || "");
  const notesMatch = setupNotes.match(
    /break[_\s-]*minutes\s*[:=]\s*(\d{1,3})/i,
  );

  if (notesMatch) {
    const parsed = Number(notesMatch[1]);

    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const itemsSummary = String(stop?.items_summary || "");
  const summaryMatch = itemsSummary.match(
    /(\d{1,3})\s*(?:min|mins|minutes)\b/i,
  );

  if (summaryMatch) {
    const parsed = Number(summaryMatch[1]);

    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function one(value: any) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function positiveNumber(value: any, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bookingItemsDurationMinutes(stop: any) {
  const booking = one(stop?.bookings);
  const items = Array.isArray(booking?.booking_items)
    ? booking.booking_items
    : [];
  const durationKey = stop?.stop_type === "pickup"
    ? "teardown_duration_min"
    : "setup_duration_min";

  return items.reduce((total: number, item: any) => {
    const product = one(item?.products);
    const quantity = positiveNumber(item?.quantity, 1);
    return total + positiveNumber(product?.[durationKey], 0) * quantity;
  }, 0);
}

function stopServiceDurationMinutes(stop: any) {
  const explicitBreakDuration = breakMinutesFromStop(stop);

  if (explicitBreakDuration) return explicitBreakDuration;

  const productDuration = bookingItemsDurationMinutes(stop);

  if (productDuration > 0) return productDuration;

  const scheduledDuration = durationMinutes(
    stop?.scheduled_start_time,
    stop?.scheduled_end_time,
  );

  if (scheduledDuration != null && scheduledDuration > 0) {
    return scheduledDuration;
  }

  return 60;
}

function isBreakRouteStop(stop: any) {
  return Boolean(
    breakMinutesFromStop(stop) ||
    /\bbreak\b/i.test(String(stop?.customer_name || "")) ||
    /\bbreak\b/i.test(String(stop?.items_summary || "")) ||
    /\bbreak\b/i.test(String(stop?.setup_notes || "")),
  );
}

function stopAddress(stop: any) {
  return [stop?.address, stop?.city, stop?.state, stop?.zip]
    .filter(Boolean)
    .join(", ");
}

function buildDepartureDateTime(
  stopDate: string | null | undefined,
  totalMinutes: number | null | undefined,
) {
  if (!stopDate || totalMinutes == null || !Number.isFinite(totalMinutes)) {
    return null;
  }

  const normalizedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = String(Math.floor(normalizedMinutes / 60)).padStart(2, "0");
  const minutes = String(normalizedMinutes % 60).padStart(2, "0");
  const result = new Date(`${stopDate}T${hours}:${minutes}:00`);

  return Number.isNaN(result.getTime()) ? null : result;
}

function fallbackTravelMinutesBetweenStops(previousStop: any, nextStop: any) {
  if (!previousStop || !nextStop) return 0;
  if (isBreakRouteStop(previousStop) || isBreakRouteStop(nextStop)) return 0;

  const originAddress = stopAddress(previousStop).toLowerCase();
  const destinationAddress = stopAddress(nextStop).toLowerCase();

  if (!originAddress || !destinationAddress) return 0;
  if (originAddress === destinationAddress) return 0;

  const prevZip = String(previousStop?.zip || "").trim();
  const nextZip = String(nextStop?.zip || "").trim();

  if (prevZip && nextZip && prevZip === nextZip) return 10;

  const prevCity = String(previousStop?.city || "")
    .trim()
    .toLowerCase();
  const nextCity = String(nextStop?.city || "")
    .trim()
    .toLowerCase();

  if (prevCity && nextCity && prevCity === nextCity) return 18;

  return 45;
}

async function getGoogleTravelMinutes({
  originAddress,
  destinationAddress,
  departureTime,
}: {
  originAddress: string;
  destinationAddress: string;
  departureTime?: Date | null;
}) {
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    "";

  if (!apiKey) {
    return null;
  }

  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json",
  );

  url.searchParams.set("origins", originAddress);
  url.searchParams.set("destinations", destinationAddress);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "imperial");
  url.searchParams.set("key", apiKey);

  if (departureTime && !Number.isNaN(departureTime.getTime())) {
    url.searchParams.set(
      "departure_time",
      String(
        Math.max(
          Math.floor(departureTime.getTime() / 1000),
          Math.floor(Date.now() / 1000),
        ),
      ),
    );
    url.searchParams.set("traffic_model", "best_guess");
  } else {
    url.searchParams.set("departure_time", "now");
    url.searchParams.set("traffic_model", "best_guess");
  }

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    const element = json?.rows?.[0]?.elements?.[0];

    if (!element || element.status !== "OK") {
      return null;
    }

    const durationSeconds = Number(
      element?.duration_in_traffic?.value || element?.duration?.value || 0,
    );

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return null;
    }

    return Math.max(1, Math.round(durationSeconds / 60));
  } catch {
    return null;
  }
}

async function travelMinutesBetweenStops(
  previousStop: any,
  nextStop: any,
  departureTime?: Date | null,
) {
  if (!previousStop || !nextStop) return 0;

  if (isBreakRouteStop(nextStop)) {
    return 0;
  }

  const originStop = isBreakRouteStop(previousStop) ? null : previousStop;

  if (!originStop) return 0;

  const originAddress = stopAddress(originStop);
  const destinationAddress = stopAddress(nextStop);

  if (!originAddress || !destinationAddress) {
    return 0;
  }

  if (originAddress.toLowerCase() === destinationAddress.toLowerCase()) {
    return 0;
  }

  const googleMinutes = await getGoogleTravelMinutes({
    originAddress,
    destinationAddress,
    departureTime: departureTime || null,
  });

  if (googleMinutes != null) {
    return googleMinutes;
  }

  return fallbackTravelMinutesBetweenStops(originStop, nextStop);
}

function dateTimeMs(date: string | null, time: string | null) {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}:00`).getTime();
  return Number.isFinite(value) ? value : null;
}

async function validateBookingRouteBoundaries(
  supabase: any,
  params: {
    deliveryStopId: string;
    deliveryDate: string;
    deliveryEndTime: string | null;
    pickupStopId?: string | null;
    pickupDate?: string | null;
    pickupStartTime?: string | null;
  },
) {
  const { data: deliveryStop, error } = await supabase
    .from("route_stops")
    .select(`booking_id, bookings (event_date, event_start_time, event_end_time)`)
    .eq("id", params.deliveryStopId)
    .single();

  if (error) throw new Error(error.message);
  const booking = one(deliveryStop?.bookings);
  if (!booking) return;

  const eventDate = String(booking.event_date || "").slice(0, 10) || null;
  const deliveryEnd = dateTimeMs(params.deliveryDate, params.deliveryEndTime);
  const eventStart = dateTimeMs(eventDate, cleanTime(booking.event_start_time));

  if (deliveryEnd != null && eventStart != null && deliveryEnd > eventStart) {
    throw new Error("Delivery setup must finish before the event starts.");
  }

  if (params.pickupStopId && params.pickupDate && params.pickupStartTime) {
    const pickupStart = dateTimeMs(params.pickupDate, params.pickupStartTime);
    const eventEnd = dateTimeMs(eventDate, cleanTime(booking.event_end_time));
    if (pickupStart != null && eventEnd != null && pickupStart < eventEnd) {
      throw new Error("Pickup cannot start before the event ends.");
    }
  }
}

async function cascadeRouteTimesForChain(
  supabase: any,
  params: {
    stopDate: string;
    driverName: string | null;
    stopType: string;
    anchorStopId?: string | null;
  },
) {
  const { stopDate, driverName, stopType, anchorStopId } = params;

  let query = supabase
    .from("route_stops")
    .select(
      `
      id,
      stop_date,
      stop_type,
      status,
      driver_name,
      address,
      city,
      state,
      zip,
      scheduled_start_time,
      scheduled_end_time,
      time_locked,
      setup_notes,
      items_summary,
      sort_order,
      created_at,
      bookings (
        event_date,
        event_start_time,
        event_end_time,
        booking_items (
          quantity,
          products (setup_duration_min, teardown_duration_min)
        )
      )
    `,
    )
    .eq("stop_date", stopDate)
    .eq("stop_type", stopType)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  query = driverName
    ? query.eq("driver_name", driverName)
    : query.is("driver_name", null);

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const stops = Array.isArray(data) ? data : [];

  if (stops.length < 1) return;

  // Load all delivery/pickup stops for this driver+date (any type) so we can
  // detect cross-type stops interleaved between same-type stops in sort order.
  let allStopsQuery = supabase
    .from("route_stops")
    .select("id, stop_type, sort_order, scheduled_end_time, address, city, state, zip, setup_notes, items_summary, customer_name, created_at")
    .eq("stop_date", stopDate)
    .in("stop_type", ["delivery", "pickup"])
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  allStopsQuery = driverName
    ? allStopsQuery.eq("driver_name", driverName)
    : allStopsQuery.is("driver_name", null);

  const { data: allStopsData } = await allStopsQuery;
  const allStops: any[] = Array.isArray(allStopsData) ? allStopsData : [];

  // Build a position map by id for the combined list.
  const globalPosById = new Map<string, number>(
    allStops.map((s: any, i: number) => [String(s.id), i]),
  );

  const foundAnchorIndex = anchorStopId
    ? stops.findIndex((stop: any) => stop.id === anchorStopId)
    : 0;

  const anchorIndex = foundAnchorIndex >= 0 ? foundAnchorIndex : 0;
  const anchorStop = stops[anchorIndex] || stops[0];

  if (!anchorStop) return;

  function minimumPickupStartMinutes(stop: any) {
    if (stopType !== "pickup" || isBreakRouteStop(stop)) return null;

    const booking = one(stop?.bookings);
    const eventDate = String(booking?.event_date || "").slice(0, 10);
    const eventEndTime = cleanTime(booking?.event_end_time);

    if (!eventDate || !eventEndTime) return null;

    const routeDayStart = dateTimeMs(stopDate, "00:00");
    const eventEnd = dateTimeMs(eventDate, eventEndTime);

    if (routeDayStart == null || eventEnd == null) return null;

    const routeDayEnd = routeDayStart + 24 * 60 * 60 * 1000;

    if (eventEnd >= routeDayEnd) {
      throw new Error(
        `Pickup for booking ${String(stop?.booking_id || "")} cannot be scheduled on ${stopDate} because the event ends later.`,
      );
    }

    if (eventEnd <= routeDayStart) return null;

    return Math.ceil((eventEnd - routeDayStart) / 60000);
  }

  let previousStop = anchorStop;
  let previousGeoStop = isBreakRouteStop(anchorStop) ? null : anchorStop;
  let previousEndMinutes = toMinutes(anchorStop.scheduled_end_time);

  {
  const originalStartMinutes = toMinutes(anchorStop.scheduled_start_time);
  const currentEndMinutes = toMinutes(anchorStop.scheduled_end_time);
  const minimumStart = minimumPickupStartMinutes(anchorStop);

  const startMinutes =
    originalStartMinutes == null
      ? minimumStart
      : minimumStart == null
        ? originalStartMinutes
        : Math.max(originalStartMinutes, minimumStart);

  const savedLockedDuration =
    anchorStop.time_locked &&
    originalStartMinutes != null &&
    currentEndMinutes != null &&
    currentEndMinutes >= originalStartMinutes
      ? currentEndMinutes - originalStartMinutes
      : null;

  const serviceDuration =
    savedLockedDuration ?? stopServiceDurationMinutes(anchorStop);

  const expectedEndMinutes =
    startMinutes == null ? null : startMinutes + serviceDuration;

  if (startMinutes == null || expectedEndMinutes == null) return;

  const startChanged = originalStartMinutes !== startMinutes;

  if (startChanged || currentEndMinutes !== expectedEndMinutes) {
    previousEndMinutes = expectedEndMinutes;

    const { error: anchorUpdateError } = await supabase
      .from("route_stops")
      .update({
        scheduled_start_time: toTime(startMinutes),
        scheduled_end_time: toTime(expectedEndMinutes),
        updated_at: new Date().toISOString(),
      })
      .eq("id", anchorStop.id);

    if (anchorUpdateError) {
      throw new Error(anchorUpdateError.message);
    }
  } else {
    previousEndMinutes = currentEndMinutes;
  }
}

  if (!previousGeoStop) {

  const anchorGlobalPos =

    globalPosById.get(String(anchorStop.id)) ?? -1;

  for (let index = anchorGlobalPos - 1; index >= 0; index -= 1) {

    const candidate = allStops[index];

    if (!candidate || isBreakRouteStop(candidate)) {

      continue;

    }

    previousGeoStop = candidate;

    break;

  }

}

  for (let index = anchorIndex + 1; index < stops.length; index += 1) {
    const currentStop = stops[index];
    const lockedStart = toMinutes(currentStop.scheduled_start_time);
    const lockedEnd = toMinutes(currentStop.scheduled_end_time);

    // Cross-type interleave: if a stop of a different type falls between the
    // previous same-type stop and currentStop in global sort order, use its
    // end time as the cascade base (so delivery→pickup timing flows correctly).
    if (!currentStop.time_locked) {
      const prevSameTypeStop = stops[index - 1] || anchorStop;
      const prevGlobalPos = globalPosById.get(String(prevSameTypeStop.id)) ?? -1;
      const curGlobalPos = globalPosById.get(String(currentStop.id)) ?? -1;
     for (let gPos = curGlobalPos - 1; gPos > prevGlobalPos; gPos--) {
  const between = allStops[gPos];

  if (!between || String(between.stop_type) === stopType) {
    continue;
  }

  const betweenEndMinutes = toMinutes(between.scheduled_end_time);

  if (
    betweenEndMinutes != null &&
    betweenEndMinutes > (previousEndMinutes ?? -1)
  ) {
    previousEndMinutes = betweenEndMinutes;
  }

  if (isBreakRouteStop(between)) {
    continue;
  }

  previousStop = between;
  previousGeoStop = between;
  break;
}
    }

   if (currentStop.time_locked && lockedStart != null) {
  const savedLockedDuration =
    lockedEnd != null && lockedEnd >= lockedStart
      ? lockedEnd - lockedStart
      : null;

  const lockedDuration =
    savedLockedDuration ?? stopServiceDurationMinutes(currentStop);

  const minimumStart = minimumPickupStartMinutes(currentStop);

  const safeLockedStart =
    minimumStart == null
      ? lockedStart
      : Math.max(lockedStart, minimumStart);

  const nextEndMinutes = safeLockedStart + lockedDuration;

  if (safeLockedStart !== lockedStart || lockedEnd !== nextEndMinutes) {
    const { error: lockedUpdateError } = await supabase
      .from("route_stops")
      .update({
        scheduled_start_time: toTime(safeLockedStart),
        scheduled_end_time: toTime(nextEndMinutes),
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentStop.id);

    if (lockedUpdateError) {
      throw new Error(lockedUpdateError.message);
    }
  }

  previousStop = currentStop;

  if (!isBreakRouteStop(currentStop)) {
    previousGeoStop = currentStop;
  }

  previousEndMinutes = nextEndMinutes;
  continue;
}

    const departureTime = buildDepartureDateTime(stopDate, previousEndMinutes);
    const driveMinutes = await travelMinutesBetweenStops(
      previousGeoStop || previousStop,
      currentStop,
      departureTime,
    );
    const currentDuration = stopServiceDurationMinutes(currentStop);
    const calculatedStartMinutes = previousEndMinutes + driveMinutes;
    const minimumStart = minimumPickupStartMinutes(currentStop);
    const nextStartMinutes =
      minimumStart == null
        ? calculatedStartMinutes
        : Math.max(calculatedStartMinutes, minimumStart);
    const nextEndMinutes = nextStartMinutes + currentDuration;

    const { error: updateError } = await supabase
      .from("route_stops")
      .update({
        scheduled_start_time: toTime(nextStartMinutes),
        scheduled_end_time: toTime(nextEndMinutes),
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentStop.id);

    if (updateError) throw new Error(updateError.message);
    previousStop = currentStop;
    if (!isBreakRouteStop(currentStop)) previousGeoStop = currentStop;
    previousEndMinutes = nextEndMinutes;
  }
}

function revalidateRoutes() {
  revalidatePath("/admin");
  revalidatePath("/admin/routes");
  revalidatePath("/admin/routes/driver");
  revalidatePath("/admin/routes/live");
  revalidatePath("/driver");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
}

const allowedStopTypes = [
  "delivery",
  "pickup",
  "service",
  "warehouse",
  "other",
];


async function placeBreakStopInDriverTimeline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    stopId: string;
    stopDate: string;
    driverName: string | null;
    scheduledStartTime: string | null;
  },
) {
  const targetStartMinutes = toMinutes(params.scheduledStartTime);

  if (targetStartMinutes == null) return;

  let query = supabase
    .from("route_stops")
    .select(
      "id, customer_name, items_summary, setup_notes, scheduled_start_time, sort_order, created_at",
    )
    .eq("stop_date", params.stopDate)
    .order("sort_order", { ascending: true })
    .order("scheduled_start_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  query = params.driverName
    ? query.eq("driver_name", params.driverName)
    : query.is("driver_name", null);

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const timeline = Array.isArray(data) ? data : [];
  const breakStop = timeline.find((stop: any) => stop.id === params.stopId);

  if (!breakStop) return;

  const otherStops = timeline.filter((stop: any) => stop.id !== params.stopId);
  let insertIndex = otherStops.findIndex((stop: any) => {
    const stopStartMinutes = toMinutes(stop.scheduled_start_time);
    return stopStartMinutes != null && stopStartMinutes >= targetStartMinutes;
  });

  if (insertIndex < 0) insertIndex = otherStops.length;

  const reordered = [...otherStops];
  reordered.splice(insertIndex, 0, breakStop);

  const updates = reordered
    .map((stop: any, index: number) => ({
      id: String(stop.id),
      nextSortOrder: (index + 1) * 10,
      currentSortOrder: Number(stop.sort_order || 0),
    }))
    .filter((item) => item.currentSortOrder !== item.nextSortOrder);

  for (const item of updates) {
    const { error: updateError } = await supabase
      .from("route_stops")
      .update({
        sort_order: item.nextSortOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (updateError) throw new Error(updateError.message);
  }
}

const allowedStatuses = [
  "scheduled",
  "on_the_way",
  "arrived",
  "installed",
  "picked_up",
  "completed",
  "failed",
  "cancelled",
];

export async function createRouteStopAction(formData: FormData) {
  const supabase = await createClient();

  const stopDate = cleanDate(getNullableString(formData, "stopDate"));
  const stopType = getString(formData, "stopType") || "delivery";
  const status = getString(formData, "status") || "scheduled";

  const customerName = getNullableString(formData, "customerName");
  const customerPhone = getNullableString(formData, "customerPhone");

  const address = getNullableString(formData, "address");
  const city = getNullableString(formData, "city");
  const state = getString(formData, "state") || "CA";
  const zip = getNullableString(formData, "zip");

  const scheduledStartTime = cleanTime(
    getNullableString(formData, "scheduledStartTime"),
  );
  const scheduledEndTime = cleanTime(
    getNullableString(formData, "scheduledEndTime"),
  );

  const driverName = getNullableString(formData, "driverName");
  const truckName = getNullableString(formData, "truckName");

  const itemsSummary = getNullableString(formData, "itemsSummary");
  const surface = getNullableString(formData, "surface");
  const gateCode = getNullableString(formData, "gateCode");
  const parkingNotes = getNullableString(formData, "parkingNotes");
  const setupNotes = getNullableString(formData, "setupNotes");
  const pickupNotes = getNullableString(formData, "pickupNotes");

  const balanceDue = getNumber(formData, "balanceDue", 0);
  const sortOrder = getNumber(formData, "sortOrder", 100);

  if (!stopDate) {
    throw new Error("Stop date is required.");
  }

  if (!allowedStopTypes.includes(stopType)) {
    throw new Error("Invalid stop type.");
  }

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid route stop status.");
  }

  if (!customerName && !address && !itemsSummary) {
    throw new Error("Add customer, address or items summary.");
  }

  const { data, error } = await supabase
    .from("route_stops")
    .insert({
      stop_date: stopDate,
      stop_type: stopType,
      status,

      customer_name: customerName,
      customer_phone: customerPhone,

      address,
      city,
      state,
      zip,

      scheduled_start_time: scheduledStartTime,
      scheduled_end_time: scheduledEndTime,

      driver_name: driverName,
      truck_name: truckName,

      items_summary: itemsSummary,
      surface,
      gate_code: gateCode,
      parking_notes: parkingNotes,
      setup_notes: setupNotes,
      pickup_notes: pickupNotes,

      balance_due: balanceDue,
      sort_order: sortOrder,

      updated_at: new Date().toISOString(),
    })
    .select("id, stop_date, stop_type, driver_name")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const createdIsBreak = isBreakRouteStop({
    customer_name: customerName,
    items_summary: itemsSummary,
    setup_notes: setupNotes,
  });

  if (data && createdIsBreak) {
    await placeBreakStopInDriverTimeline(supabase, {
      stopId: String(data.id),
      stopDate: String(data.stop_date || stopDate),
      driverName: (data.driver_name as string | null) || null,
      scheduledStartTime,
    });
  }

  if (data && ["delivery", "pickup"].includes(String(data.stop_type || ""))) {
    await cascadeRouteTimesForChain(supabase, {
      stopDate: String(data.stop_date || stopDate),
      driverName: (data.driver_name as string | null) || null,
      stopType: String(data.stop_type),
      anchorStopId: String(data.id),
    });
  }

  revalidateRoutes();
}

export async function updateRouteStopAction(formData: FormData) {
  const supabase = await createClient();

  const stopId = getString(formData, "stopId");

  if (!stopId) {
    throw new Error("Missing route stop id.");
  }

  const stopDate = cleanDate(getNullableString(formData, "stopDate"));
  const stopType = getString(formData, "stopType") || "delivery";
  const status = getString(formData, "status") || "scheduled";

  const customerName = getNullableString(formData, "customerName");
  const customerPhone = getNullableString(formData, "customerPhone");

  const address = getNullableString(formData, "address");
  const city = getNullableString(formData, "city");
  const state = getString(formData, "state") || "CA";
  const zip = getNullableString(formData, "zip");

  const scheduledStartTime = cleanTime(
    getNullableString(formData, "scheduledStartTime"),
  );
  const scheduledEndTime = cleanTime(
    getNullableString(formData, "scheduledEndTime"),
  );

  const driverName = getNullableString(formData, "driverName");
  const truckName = getNullableString(formData, "truckName");

  const itemsSummary = getNullableString(formData, "itemsSummary");
  const surface = getNullableString(formData, "surface");
  const gateCode = getNullableString(formData, "gateCode");
  const parkingNotes = getNullableString(formData, "parkingNotes");
  const setupNotes = getNullableString(formData, "setupNotes");
  const pickupNotes = getNullableString(formData, "pickupNotes");

  const balanceDue = getNumber(formData, "balanceDue", 0);
  const sortOrder = getNumber(formData, "sortOrder", 100);

  if (!stopDate) {
    throw new Error("Stop date is required.");
  }

  if (!allowedStopTypes.includes(stopType)) {
    throw new Error("Invalid stop type.");
  }

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid route stop status.");
  }

  const updateData: Record<string, any> = {
    status,

    customer_name: customerName,
    customer_phone: customerPhone,

    address,
    city,
    state,
    zip,

    scheduled_start_time: scheduledStartTime,
    scheduled_end_time: scheduledEndTime,

    driver_name: driverName,
    truck_name: truckName,

    items_summary: itemsSummary,
    surface,
    gate_code: gateCode,
    parking_notes: parkingNotes,
    setup_notes: setupNotes,
    pickup_notes: pickupNotes,

    balance_due: balanceDue,
    sort_order: sortOrder,

    updated_at: new Date().toISOString(),
  };

  if (status === "arrived") {
    updateData.arrived_at = new Date().toISOString();
  }

  if (
    ["installed", "picked_up", "completed", "failed", "cancelled"].includes(
      status,
    )
  ) {
    updateData.completed_at = new Date().toISOString();
  }

  if (formData.has("clientDeliveryWindows")) {
    updateData.client_delivery_windows = cleanJsonWindows(
      formData.get("clientDeliveryWindows"),
    );
  }

  if (formData.has("clientPickupWindows")) {
    updateData.client_pickup_windows = cleanJsonWindows(
      formData.get("clientPickupWindows"),
    );
  }

  const { error } = await supabase
    .from("route_stops")
    .update(updateData)
    .eq("id", stopId);

  if (error) {
    throw new Error(error.message);
  }

  if (["delivery", "pickup"].includes(stopType)) {
    await cascadeRouteTimesForChain(supabase, {
      stopDate,
      driverName,
      stopType,
      anchorStopId: stopId,
    });
  }

  revalidateRoutes();
}

export async function quickUpdateRouteStopStatusAction(formData: FormData) {
  const supabase = await createClient();

  const stopId = getString(formData, "stopId");
  const status = getString(formData, "status") || "scheduled";

  if (!stopId) {
    throw new Error("Missing route stop id.");
  }

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid route stop status.");
  }

  const updateData: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "arrived") {
    updateData.arrived_at = new Date().toISOString();
  }

  if (
    ["installed", "picked_up", "completed", "failed", "cancelled"].includes(
      status,
    )
  ) {
    updateData.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("route_stops")
    .update(updateData)
    .eq("id", stopId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateRoutes();
}

export async function deleteRouteStopAction(formData: FormData) {
  const supabase = await createClient();
  const stopId = getString(formData, "stopId");

  if (!stopId) {
    throw new Error("Missing route stop id.");
  }

  // Read the stop before deleting it so a removed route break can be
  // taken back out of the driver's timeline immediately.  This keeps
  // subsequent calculated times from retaining a gap for a break that
  // no longer exists.
  const { data: existingStop, error: existingStopError } = await supabase
    .from("route_stops")
    .select(
      "id, stop_date, stop_type, driver_name, customer_name, items_summary, setup_notes",
    )
    .eq("id", stopId)
    .maybeSingle();

  if (existingStopError) {
    throw new Error(existingStopError.message);
  }

  const { error } = await supabase
    .from("route_stops")
    .delete()
    .eq("id", stopId);

  if (error) {
    throw new Error(error.message);
  }

  if (existingStop && isBreakRouteStop(existingStop)) {
    const stopDate = String(existingStop.stop_date || "");
    const stopType = String(existingStop.stop_type || "delivery");
    const driverName = (existingStop.driver_name as string | null) || null;

    if (stopDate && ["delivery", "pickup"].includes(stopType)) {
      let remainingQuery = supabase
        .from("route_stops")
        .select("id")
        .eq("stop_date", stopDate)
        .eq("stop_type", stopType)
        .order("sort_order", { ascending: true })
        .order("scheduled_start_time", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(1);

      remainingQuery = driverName
        ? remainingQuery.eq("driver_name", driverName)
        : remainingQuery.is("driver_name", null);

      const { data: firstRemaining, error: firstRemainingError } =
        await remainingQuery.maybeSingle();

      if (firstRemainingError) {
        throw new Error(firstRemainingError.message);
      }

      if (firstRemaining?.id) {
        await cascadeRouteTimesForChain(supabase, {
          stopDate,
          driverName,
          stopType,
          anchorStopId: String(firstRemaining.id),
        });
      }
    }
  }

  revalidateRoutes();
}


async function updateCanonicalBookingStop(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stopId: string,
  updateData: Record<string, unknown>,
) {
  const { data: sourceStop, error: sourceError } = await supabase
    .from("route_stops")
    .select("id, booking_id, stop_type")
    .eq("id", stopId)
    .maybeSingle();

  if (sourceError) {
    throw new Error(sourceError.message);
  }

  if (!sourceStop) {
    throw new Error("Route stop was not found.");
  }

  let query = supabase.from("route_stops").update(updateData);

  if (sourceStop.booking_id && sourceStop.stop_type) {
    query = query
      .eq("booking_id", sourceStop.booking_id)
      .eq("stop_type", sourceStop.stop_type);
  } else {
    query = query.eq("id", stopId);
  }

  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return sourceStop;
}

export async function updateRouteStopDriverAction(formData: FormData) {
  const supabase = await createClient();
  const stopId = getNullableString(formData, "stopId");
  const driverName = getNullableString(formData, "driverName");

  if (!stopId) {
    throw new Error("Missing route stop id.");
  }

  await updateCanonicalBookingStop(supabase, stopId, {
    driver_name: driverName,
    updated_at: new Date().toISOString(),
  });

  revalidateRoutes();
}

export async function updateRouteStopCompactAction(formData: FormData) {
  const supabase = await createClient();

  const deliveryStopId =
    getNullableString(formData, "deliveryStopId") ||
    getNullableString(formData, "stopId");
  const pickupStopId = getNullableString(formData, "pickupStopId");
  const deliveryDriverName =
    getNullableString(formData, "deliveryDriverName") ||
    getNullableString(formData, "driverName");
  const pickupDriverName = formData.has("pickupDriverName")
    ? getNullableString(formData, "pickupDriverName")
    : deliveryDriverName;

  const deliveryStopDate = cleanDate(
    getNullableString(formData, "deliveryStopDate"),
  );
  const deliveryScheduledStartTime = cleanTime(
    getNullableString(formData, "deliveryScheduledStartTime"),
  );
  const deliveryScheduledEndTime = cleanTime(
    getNullableString(formData, "deliveryScheduledEndTime"),
  );

  const breakStopTypeRaw = getString(formData, "breakStopType");
  const breakStopType =
    breakStopTypeRaw === "pickup"
      ? "pickup"
      : breakStopTypeRaw === "delivery"
        ? "delivery"
        : null;
  const rawBreakMinutes = Math.round(getNumber(formData, "breakMinutes", 0));
  const breakMinutes = Number.isFinite(rawBreakMinutes)
    ? Math.max(0, Math.min(720, rawBreakMinutes))
    : 0;

  const pickupStopDate = cleanDate(
    getNullableString(formData, "pickupStopDate"),
  );
  const pickupScheduledStartTime = cleanTime(
    getNullableString(formData, "pickupScheduledStartTime"),
  );
  const pickupScheduledEndTime = cleanTime(
    getNullableString(formData, "pickupScheduledEndTime"),
  );

  if (!deliveryStopId) throw new Error("Missing route stop id.");
  if (!deliveryStopDate) throw new Error("Delivery date is required.");

  const { data: deliverySourceStop, error: deliverySourceStopError } = await supabase
    .from("route_stops")
    .select("id, stop_type, customer_name, items_summary, setup_notes")
    .eq("id", deliveryStopId)
    .maybeSingle();

  if (deliverySourceStopError) {
    throw new Error(deliverySourceStopError.message);
  }

  if (!deliverySourceStop) {
    throw new Error("Route stop was not found.");
  }

  const isBreakCard = isBreakRouteStop(deliverySourceStop);
  const deliveryStopType =
    String(deliverySourceStop.stop_type || "") === "pickup" ? "pickup" : "delivery";
  const effectiveStopType =
    isBreakCard && breakStopType ? breakStopType : deliveryStopType;

  const deliveryTimeLocked = getBoolean(formData, "deliveryTimeLocked");
  const pickupTimeLocked = getBoolean(formData, "pickupTimeLocked");

  await validateBookingRouteBoundaries(supabase, {
    deliveryStopId,
    deliveryDate: deliveryStopDate,
    deliveryEndTime: deliveryScheduledEndTime,
    pickupStopId,
    pickupDate: pickupStopDate,
    pickupStartTime: pickupScheduledStartTime,
  });

  const now = new Date().toISOString();

  const deliveryUpdate: Record<string, any> = {
    stop_date: deliveryStopDate,
    scheduled_start_time: deliveryScheduledStartTime,
    scheduled_end_time: deliveryScheduledEndTime,
    time_locked: deliveryTimeLocked,
    driver_name: deliveryDriverName,
    updated_at: now,
  };

  if (isBreakCard) {
    if (breakStopType) {
      deliveryUpdate.stop_type = breakStopType;
    }

    if (breakMinutes > 0) {
      deliveryUpdate.setup_notes = `break_minutes:${breakMinutes}`;
      deliveryUpdate.items_summary = `Break (${breakMinutes} min)`;
      deliveryUpdate.customer_name = "Break";

      const startMinutes = toMinutes(deliveryScheduledStartTime);
      if (startMinutes != null) {
        deliveryUpdate.scheduled_end_time = toTime(startMinutes + breakMinutes);
      }
    }
  }

  if (formData.has("clientDeliveryWindows")) {
    deliveryUpdate.client_delivery_windows = cleanJsonWindows(
      formData.get("clientDeliveryWindows"),
    );
  }

  await updateCanonicalBookingStop(
    supabase,
    deliveryStopId,
    deliveryUpdate,
  );

  if (isBreakCard) {
    await placeBreakStopInDriverTimeline(supabase, {
      stopId: deliveryStopId,
      stopDate: deliveryStopDate,
      driverName: deliveryDriverName,
      scheduledStartTime: deliveryScheduledStartTime,
    });

    await cascadeRouteTimesForChain(supabase, {
      stopDate: deliveryStopDate,
      driverName: deliveryDriverName,
      stopType: effectiveStopType,
      anchorStopId: deliveryStopId,
    });
  }

  if (pickupStopId) {
    const pickupUpdate: Record<string, any> = {
      stop_date: pickupStopDate,
      scheduled_start_time: pickupScheduledStartTime,
      scheduled_end_time: pickupScheduledEndTime,
      time_locked: pickupTimeLocked,
      driver_name: pickupDriverName,
      updated_at: now,
    };

    if (formData.has("clientPickupWindows")) {
      pickupUpdate.client_pickup_windows = cleanJsonWindows(
        formData.get("clientPickupWindows"),
      );
    }

    await updateCanonicalBookingStop(
      supabase,
      pickupStopId,
      pickupUpdate,
    );
  }

  if (!isBreakCard && deliveryTimeLocked) {
    await cascadeRouteTimesForChain(supabase, {
      stopDate: deliveryStopDate,
      driverName: deliveryDriverName,
      stopType: effectiveStopType,
      anchorStopId: deliveryStopId,
    });
  }

  if (pickupStopId && pickupStopDate && pickupTimeLocked) {
    await cascadeRouteTimesForChain(supabase, {
      stopDate: pickupStopDate,
      driverName: pickupDriverName,
      stopType: "pickup",
      anchorStopId: pickupStopId,
    });
  }

  revalidateRoutes();
}

export async function saveRouteOrderAction(formData: FormData) {
  const supabase = await createClient();

  const orderedIdsRaw = getString(formData, "orderedIds");
  const persistRouteTiming = getBoolean(formData, "persistRouteTiming");
  const routeTimingPayloadRaw = persistRouteTiming
    ? getString(formData, "routeTimingPayload")
    : "";

  if (!orderedIdsRaw) {
    throw new Error("Missing route order.");
  }

  let orderedIds: string[] = [];

  try {
    const parsed = JSON.parse(orderedIdsRaw);

    if (!Array.isArray(parsed)) {
      throw new Error("Invalid route order.");
    }

    orderedIds = parsed
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  } catch {
    throw new Error("Invalid route order.");
  }

  if (orderedIds.length === 0) {
    throw new Error("No stops to save.");
  }

  let routeTimingPayload: Array<{
    id: string;
    stop_date: string | null;
    scheduled_start_time: string | null;
    scheduled_end_time: string | null;
  }> = [];

  if (routeTimingPayloadRaw) {
    try {
      const parsed = JSON.parse(routeTimingPayloadRaw);

      if (Array.isArray(parsed)) {
        routeTimingPayload = parsed
          .map((item: any) => ({
            id: String(item?.id || "").trim(),
            stop_date: cleanDate(
              typeof item?.stop_date === "string" ? item.stop_date : null,
            ),
            scheduled_start_time: cleanTime(
              typeof item?.scheduled_start_time === "string"
                ? item.scheduled_start_time
                : null,
            ),
            scheduled_end_time: cleanTime(
              typeof item?.scheduled_end_time === "string"
                ? item.scheduled_end_time
                : null,
            ),
          }))
          .filter((item) => item.id);
      }
    } catch {
      throw new Error("Invalid route timing payload.");
    }
  }

  const routeTimingById = new Map(
    routeTimingPayload.map((item) => [item.id, item]),
  );

  const { data: lockedStops, error: lockedStopsError } = await supabase
  .from("route_stops")
  .select(
    `
    id,
    time_locked,
    stop_type,
    booking_id,
    bookings (event_date, event_start_time, event_end_time)
    `,
  )
  .in("id", orderedIds);
  if (lockedStopsError) throw new Error(lockedStopsError.message);
 const lockedIds = new Set(
  (lockedStops || [])
    .filter((stop: any) => Boolean(stop.time_locked))
    .map((stop: any) => String(stop.id)),
);

for (const stop of lockedStops || []) {
  const id = String((stop as any)?.id || "");

  if (!id || lockedIds.has(id)) {
    continue;
  }

  const stopType = String((stop as any)?.stop_type || "");

  if (stopType !== "delivery" && stopType !== "pickup") {
    continue;
  }

  const timing = routeTimingById.get(id);

  if (!timing?.stop_date) {
    continue;
  }

  const booking = one((stop as any)?.bookings);

  if (!booking) {
    continue;
  }

  const eventDate =
    String(booking.event_date || "").slice(0, 10) || null;

  if (stopType === "delivery") {
    const deliveryEnd = dateTimeMs(
      timing.stop_date,
      timing.scheduled_end_time,
    );

    const eventStart = dateTimeMs(
      eventDate,
      cleanTime(booking.event_start_time),
    );

    if (
      deliveryEnd != null &&
      eventStart != null &&
      deliveryEnd > eventStart
    ) {
      throw new Error(
        "Delivery setup must finish before the event starts.",
      );
    }
  }

  if (stopType === "pickup") {
    const pickupStart = dateTimeMs(
      timing.stop_date,
      timing.scheduled_start_time,
    );

    const eventEnd = dateTimeMs(
      eventDate,
      cleanTime(booking.event_end_time),
    );

    if (
      pickupStart != null &&
      eventEnd != null &&
      pickupStart < eventEnd
    ) {
      throw new Error(
        "Pickup cannot start before the event ends.",
      );
    }
  }
}

const now = new Date().toISOString();

  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    const timing = routeTimingById.get(id);

    const updateData: Record<string, any> = {
      sort_order: (index + 1) * 10,
      updated_at: now,
    };

    if (persistRouteTiming && !lockedIds.has(id)) {
      if (timing?.stop_date) updateData.stop_date = timing.stop_date;
      if (timing?.scheduled_start_time) {
        updateData.scheduled_start_time = timing.scheduled_start_time;
      }
      if (timing?.scheduled_end_time) {
        updateData.scheduled_end_time = timing.scheduled_end_time;
      }
    }

    const { error } = await supabase
      .from("route_stops")
      .update(updateData)
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidateRoutes();
}

export async function createOrUpdateRouteDriverAction(formData: FormData) {
  const supabase = await createClient();
  await assertStaffPermission(supabase, "settings");

  const driverId = getString(formData, "driverId");
  const name = getString(formData, "name");
  const color = getString(formData, "color") || "#23313f";
  const phone = getNullableString(formData, "phone");
  const notes = getNullableString(formData, "notes");
  const sortOrder = getNumber(formData, "sortOrder", 100);

  if (!name) throw new Error("Driver name is required.");

  const payload = {
    name,
    color,
    phone,
    notes,
    active: true,
    deleted_at: null,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };

  if (driverId) {
    const response = await supabase
      .from("route_drivers")
      .update(payload)
      .eq("id", driverId);

    if (response.error) throw new Error(response.error.message);
  } else {
    const response = await supabase.from("route_drivers").insert(payload);

    if (response.error) throw new Error(response.error.message);
  }

  revalidateRoutes();
}

export async function deleteRouteDriverAction(formData: FormData) {
  const supabase = await createClient();
  await assertStaffPermission(supabase, "settings");

  const driverId = getString(formData, "driverId");

  if (!driverId) {
    throw new Error("Missing driver id.");
  }

  const { error } = await supabase
    .from("route_drivers")
    .update({
      active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", driverId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateRoutes();
}

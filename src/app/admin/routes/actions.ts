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

  const match = cleanValue.match(
    /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/,
  );

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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

  const match = String(value).match(/^(\d{1,2}):(\d{2})/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

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

async function cascadeRouteTimesForTimeline(
  supabase: any,
  params: {
    stopDate: string;
    driverName: string | null;
    anchorStopId?: string | null;
  },
) {
  const { stopDate, driverName, anchorStopId } = params;

  let query = supabase
    .from("route_stops")
    .select(
      `
      id,
      booking_id,
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
    .in("stop_type", allowedStopTypes)
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

  function minimumPickupStartMinutes(stop: any) {
    if (String(stop?.stop_type || "") !== "pickup" || isBreakRouteStop(stop)) {
      return null;
    }

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
        `Pickup for booking ${String(
          stop?.booking_id || "",
        )} cannot be scheduled on ${stopDate} because the event ends later.`,
      );
    }

    if (eventEnd <= routeDayStart) return null;

    return Math.ceil((eventEnd - routeDayStart) / 60000);
  }

  function initialDeliveryStartMinutes(stop: any, duration: number) {
    if (
      String(stop?.stop_type || "") !== "delivery" ||
      isBreakRouteStop(stop)
    ) {
      return null;
    }

    const booking = one(stop?.bookings);
    const eventDate = String(booking?.event_date || "").slice(0, 10);
    const eventStartTime = cleanTime(booking?.event_start_time);

    if (!eventDate || !eventStartTime) return null;

    const routeDayStart = dateTimeMs(stopDate, "00:00");
    const eventStart = dateTimeMs(eventDate, eventStartTime);

    if (routeDayStart == null || eventStart == null) return null;

    const eventStartMinutes = Math.ceil(
      (eventStart - routeDayStart) / 60000,
    );

    if (eventStartMinutes < 0 || eventStartMinutes >= 24 * 60) {
      return null;
    }

    return Math.max(0, eventStartMinutes - duration);
  }

  const foundAnchorIndex = anchorStopId
    ? stops.findIndex(
        (stop: any) => String(stop?.id || "") === String(anchorStopId),
      )
    : 0;

  const anchorIndex = foundAnchorIndex >= 0 ? foundAnchorIndex : 0;

  let previousStop: any = null;
  let previousGeoStop: any = null;
  let previousEndMinutes: number | null = null;

  if (anchorIndex > 0) {
    previousStop = stops[anchorIndex - 1] || null;
    previousEndMinutes = previousStop
      ? toMinutes(previousStop.scheduled_end_time)
      : null;

    for (let index = anchorIndex - 1; index >= 0; index -= 1) {
      const candidate = stops[index];

      if (!candidate || isBreakRouteStop(candidate)) {
        continue;
      }

      previousGeoStop = candidate;
      break;
    }
  }

  for (let index = anchorIndex; index < stops.length; index += 1) {
    const currentStop = stops[index];
    const savedStart = toMinutes(currentStop.scheduled_start_time);
    const savedEnd = toMinutes(currentStop.scheduled_end_time);

    /*
     * Fixed time is authoritative.
     *
     * Never move a locked stop during route cascading. A route conflict is a
     * validation/UI concern; silently changing the dispatcher-selected fixed
     * time would destroy the meaning of the lock.
     */
    if (currentStop.time_locked && savedStart != null) {
      let fixedEnd = savedEnd;

      /*
       * A locked stop preserves the dispatcher-selected interval exactly.
       * Only synthesize an end time when the locked stop does not have one.
       */
      if (fixedEnd == null) {
        fixedEnd = savedStart + stopServiceDurationMinutes(currentStop);

        const { error: lockedUpdateError } = await supabase
          .from("route_stops")
          .update({
            scheduled_end_time: toTime(fixedEnd),
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentStop.id);

        if (lockedUpdateError) {
          throw new Error(lockedUpdateError.message);
        }
      } else if (fixedEnd < savedStart) {
        fixedEnd += 24 * 60;
      }

      previousStop = currentStop;

      if (!isBreakRouteStop(currentStop)) {
        previousGeoStop = currentStop;
      }

      previousEndMinutes = fixedEnd;
      continue;
    }

    const minimumStart = minimumPickupStartMinutes(currentStop);
    const duration = stopServiceDurationMinutes(currentStop);

    let nextStartMinutes: number | null = null;

    if (previousStop && previousEndMinutes != null) {
      const departureTime = buildDepartureDateTime(
        stopDate,
        previousEndMinutes,
      );

      const driveMinutes = await travelMinutesBetweenStops(
        previousGeoStop || previousStop,
        currentStop,
        departureTime,
      );

      const calculatedStart = previousEndMinutes + driveMinutes;

      nextStartMinutes =
        minimumStart == null
          ? calculatedStart
          : Math.max(calculatedStart, minimumStart);
    } else {
      /*
       * There is no predecessor in this timeline. Keep the existing start as
       * the initial route anchor, while still respecting the event-end floor
       * for an unlocked pickup.
       */
      const initialDeliveryStart = initialDeliveryStartMinutes(
        currentStop,
        duration,
      );

      nextStartMinutes =
        initialDeliveryStart != null
          ? initialDeliveryStart
          : savedStart == null
            ? minimumStart
            : minimumStart == null
              ? savedStart
              : Math.max(savedStart, minimumStart);
    }

    if (nextStartMinutes == null) {
      /*
       * No usable anchor exists yet. Leave this stop untouched rather than
       * inventing a start time.
       */
      previousStop = currentStop;

      if (!isBreakRouteStop(currentStop)) {
        previousGeoStop = currentStop;
      }

      previousEndMinutes = savedEnd;
      continue;
    }

    const nextEndMinutes = nextStartMinutes + duration;

    if (
      savedStart !== nextStartMinutes ||
      savedEnd !== nextEndMinutes
    ) {
      const { error: updateError } = await supabase
        .from("route_stops")
        .update({
          scheduled_start_time: toTime(nextStartMinutes),
          scheduled_end_time: toTime(nextEndMinutes),
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentStop.id);

      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    previousStop = currentStop;

    if (!isBreakRouteStop(currentStop)) {
      previousGeoStop = currentStop;
    }

    previousEndMinutes = nextEndMinutes;
  }
}

function routeTimelineKey(
  stopDate: string,
  driverName: string | null,
) {
  return `${stopDate}::${driverName || ""}`;
}

async function cascadeRouteTimelineFromFirstStop(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    stopDate: string;
    driverName: string | null;
  },
) {
  if (!params.stopDate) return;

  let query = supabase
    .from("route_stops")
    .select("id")
    .eq("stop_date", params.stopDate)
    .in("stop_type", allowedStopTypes)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);

  query = params.driverName
    ? query.eq("driver_name", params.driverName)
    : query.is("driver_name", null);

  const { data: firstStop, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!firstStop?.id) {
    return;
  }

  await cascadeRouteTimesForTimeline(supabase, {
    stopDate: params.stopDate,
    driverName: params.driverName,
    anchorStopId: String(firstStop.id),
  });
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

  if (data && allowedStopTypes.includes(String(data.stop_type || ""))) {
    await cascadeRouteTimesForTimeline(supabase, {
      stopDate: String(data.stop_date || stopDate),
      driverName: (data.driver_name as string | null) || null,
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

  const { data: existingStop, error: existingStopError } = await supabase
    .from("route_stops")
    .select("id, stop_date, stop_type, driver_name")
    .eq("id", stopId)
    .maybeSingle();

  if (existingStopError) {
    throw new Error(existingStopError.message);
  }

  if (!existingStop) {
    throw new Error("Route stop was not found.");
  }

  const oldStopDate = String(existingStop.stop_date || "");
  const oldDriverName =
    (existingStop.driver_name as string | null) || null;
  const oldStopType = String(existingStop.stop_type || "");

  const updateData: Record<string, any> = {
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

  const oldWasRouteStop = allowedStopTypes.includes(oldStopType);
  const newIsRouteStop = allowedStopTypes.includes(stopType);

  const oldTimelineKey = oldStopDate
    ? routeTimelineKey(oldStopDate, oldDriverName)
    : "";
  const newTimelineKey = routeTimelineKey(stopDate, driverName);

  if (
    oldWasRouteStop &&
    oldStopDate &&
    (!newIsRouteStop || oldTimelineKey !== newTimelineKey)
  ) {
    await cascadeRouteTimelineFromFirstStop(supabase, {
      stopDate: oldStopDate,
      driverName: oldDriverName,
    });
  }

  if (newIsRouteStop) {
    await cascadeRouteTimelineFromFirstStop(supabase, {
      stopDate,
      driverName,
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

  if (
    existingStop &&
    allowedStopTypes.includes(String(existingStop.stop_type || ""))
  ) {
    const stopDate = String(existingStop.stop_date || "");
    const driverName =
      (existingStop.driver_name as string | null) || null;

    if (stopDate) {
      await cascadeRouteTimelineFromFirstStop(supabase, {
        stopDate,
        driverName,
      });
    }
  }

  revalidateRoutes();
}


async function updateCanonicalBookingStop(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stopId: string,
  updateData: Record<string, unknown>,
  options?: {
    scopeToSourceStopDate?: boolean;
  },
) {
  const { data: sourceStop, error: sourceError } = await supabase
    .from("route_stops")
    .select("id, booking_id, stop_type, stop_date, driver_name")
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

    if (options?.scopeToSourceStopDate) {
      query = query.eq("stop_date", sourceStop.stop_date || null);
    }
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

  const sourceStop = await updateCanonicalBookingStop(
    supabase,
    stopId,
    {
      driver_name: driverName,
      updated_at: new Date().toISOString(),
    },
    {
      scopeToSourceStopDate: true,
    },
  );

  const stopDate = String(sourceStop.stop_date || "");
  const oldDriverName =
    (sourceStop.driver_name as string | null) || null;

  if (
    stopDate &&
    routeTimelineKey(stopDate, oldDriverName) !==
      routeTimelineKey(stopDate, driverName)
  ) {
    await cascadeRouteTimelineFromFirstStop(supabase, {
      stopDate,
      driverName: oldDriverName,
    });
  }

  if (stopDate) {
    await cascadeRouteTimelineFromFirstStop(supabase, {
      stopDate,
      driverName,
    });
  }

  revalidateRoutes();
}

export async function updateRouteStopCompactAction(formData: FormData) {
  const supabase = await createClient();
  const orderedIdsRaw = getString(formData, "orderedIds");

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
    .select(
      "id, stop_type, stop_date, driver_name, customer_name, items_summary, setup_notes",
    )
    .eq("id", deliveryStopId)
    .maybeSingle();

  if (deliverySourceStopError) {
    throw new Error(deliverySourceStopError.message);
  }

  if (!deliverySourceStop) {
    throw new Error("Route stop was not found.");
  }

  const oldDeliveryStopDate = String(deliverySourceStop.stop_date || "");
  const oldDeliveryDriverName =
    (deliverySourceStop.driver_name as string | null) || null;

  let pickupSourceStop: {
    id: string;
    stop_date: string | null;
    driver_name: string | null;
    stop_type: string | null;
  } | null = null;

  if (pickupStopId) {
    const { data, error } = await supabase
      .from("route_stops")
      .select("id, stop_date, driver_name, stop_type")
      .eq("id", pickupStopId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Pickup route stop was not found.");
    }

    pickupSourceStop = data;
  }

  const isBreakCard = isBreakRouteStop(deliverySourceStop);
  const deliveryStopType =
    String(deliverySourceStop.stop_type || "") === "pickup" ? "pickup" : "delivery";
  const effectiveStopType =
    isBreakCard && breakStopType ? breakStopType : deliveryStopType;

  const deliveryTimeLocked = getBoolean(formData, "deliveryTimeLocked");
  const pickupTimeLocked = getBoolean(formData, "pickupTimeLocked");


  const now = new Date().toISOString();

  const deliveryUpdate: Record<string, any> = {
    stop_date: deliveryStopDate,
    time_locked: deliveryTimeLocked,
    driver_name: deliveryDriverName,
    updated_at: now,
  };

  if (deliveryTimeLocked || isBreakCard) {
    deliveryUpdate.scheduled_start_time = deliveryScheduledStartTime;
    deliveryUpdate.scheduled_end_time = deliveryScheduledEndTime;
  }

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
    {
      scopeToSourceStopDate: true,
    },
  );

  if (isBreakCard) {
    await placeBreakStopInDriverTimeline(supabase, {
      stopId: deliveryStopId,
      stopDate: deliveryStopDate,
      driverName: deliveryDriverName,
      scheduledStartTime: deliveryScheduledStartTime,
    });

  }

  if (pickupStopId) {
    const pickupUpdate: Record<string, any> = {
      stop_date: pickupStopDate,
      time_locked: pickupTimeLocked,
      driver_name: pickupDriverName,
      updated_at: now,
    };

    if (pickupTimeLocked) {
      pickupUpdate.scheduled_start_time = pickupScheduledStartTime;
      pickupUpdate.scheduled_end_time = pickupScheduledEndTime;
    }

    if (formData.has("clientPickupWindows")) {
      pickupUpdate.client_pickup_windows = cleanJsonWindows(
        formData.get("clientPickupWindows"),
      );
    }

    await updateCanonicalBookingStop(
      supabase,
      pickupStopId,
      pickupUpdate,
      {
        scopeToSourceStopDate: true,
      },
    );
  }

  if (orderedIdsRaw) {
    let orderedIds: string[] = [];

    try {
      const parsed = JSON.parse(orderedIdsRaw);

      if (Array.isArray(parsed)) {
        orderedIds = Array.from(
          new Set(parsed.map((value) => String(value || "").trim()).filter(Boolean)),
        );
      }
    } catch {
      orderedIds = [];
    }

    for (let index = 0; index < orderedIds.length; index += 1) {
      const id = orderedIds[index];
      const sortOrder = (index + 1) * 10;

      await updateCanonicalBookingStop(supabase, id, {
        sort_order: sortOrder,
        updated_at: now,
      }, {
        scopeToSourceStopDate: true,
      });
    }
  }

  const affectedTimelines = new Map<
    string,
    { stopDate: string; driverName: string | null }
  >();

  const addAffectedTimeline = (
    stopDate: string | null | undefined,
    driverName: string | null,
  ) => {
    const normalizedDate = String(stopDate || "").trim();
    if (!normalizedDate) return;

    affectedTimelines.set(
      routeTimelineKey(normalizedDate, driverName),
      {
        stopDate: normalizedDate,
        driverName,
      },
    );
  };

  addAffectedTimeline(oldDeliveryStopDate, oldDeliveryDriverName);
  addAffectedTimeline(deliveryStopDate, deliveryDriverName);

  if (pickupSourceStop) {
    addAffectedTimeline(
      pickupSourceStop.stop_date,
      pickupSourceStop.driver_name || null,
    );
  }

  if (pickupStopId && pickupStopDate) {
    addAffectedTimeline(pickupStopDate, pickupDriverName);
  }

  for (const timeline of affectedTimelines.values()) {
    await cascadeRouteTimelineFromFirstStop(supabase, timeline);
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
    stop_date,
    driver_name,
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

    await updateCanonicalBookingStop(supabase, id, updateData, {
      scopeToSourceStopDate: true,
    });
  }

  const affectedTimelines = new Map<
    string,
    { stopDate: string; driverName: string | null }
  >();

  const addAffectedTimeline = (
    stopDate: string | null | undefined,
    driverName: string | null,
  ) => {
    const normalizedDate = String(stopDate || "").slice(0, 10).trim();
    if (!normalizedDate) return;

    affectedTimelines.set(
      routeTimelineKey(normalizedDate, driverName),
      {
        stopDate: normalizedDate,
        driverName,
      },
    );
  };

  for (const stop of lockedStops || []) {
    const stopType = String((stop as any)?.stop_type || "");

    if (!allowedStopTypes.includes(stopType)) {
      continue;
    }

    const id = String((stop as any)?.id || "").trim();

    if (!id) {
      continue;
    }

    const driverName =
      typeof (stop as any)?.driver_name === "string" &&
      String((stop as any).driver_name).trim()
        ? String((stop as any).driver_name)
        : null;

    const oldStopDate =
      String((stop as any)?.stop_date || "").slice(0, 10) || null;

    addAffectedTimeline(oldStopDate, driverName);

    if (persistRouteTiming && !lockedIds.has(id)) {
      const timing = routeTimingById.get(id);

      if (timing?.stop_date) {
        addAffectedTimeline(timing.stop_date, driverName);
      }
    }
  }

  for (const timeline of affectedTimelines.values()) {
    await cascadeRouteTimelineFromFirstStop(supabase, timeline);
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

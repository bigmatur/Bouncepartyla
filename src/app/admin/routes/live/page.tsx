import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getGoogleDrivingDistanceMiles } from "@/lib/maps/google-distance";
import DriverLiveDashboard from "./DriverLiveDashboard";

import { bookingItemsProductSummary } from "@/lib/booking/booking-items-summary";
function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isCompletedStatus(status: string | null | undefined) {
  return ["installed", "picked_up", "completed"].includes(String(status || ""));
}

function isBreakStop(stop: any) {
  return (
    /\bbreak\b/i.test(String(stop?.customer_name || "")) ||
    /\bbreak\b/i.test(String(stop?.items_summary || "")) ||
    /\bbreak\b/i.test(String(stop?.setup_notes || ""))
  );
}

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function mainProductName(stop: any) {
  const booking = getOne(stop?.bookings);
  const bookingItems = booking?.booking_items || [];

  return bookingItemsProductSummary(
    bookingItems,
    stop?.items_summary?.split("\n")[0] || "Route stop",
  );
}

function stopAddress(stop: any) {
  return [stop?.address, stop?.city, stop?.state, stop?.zip]
    .filter(Boolean)
    .join(", ");
}

function toMinutes(value: string | null | undefined) {
  if (!value) return null;

  const match = String(value).match(/^(\d{2}):(\d{2})/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function minutesFromDate(value: Date) {
  return value.getHours() * 60 + value.getMinutes();
}

function plannedDateTime(routeDate: string, time: string | null | undefined) {
  if (!time) return null;

  const cleanTime = String(time).slice(0, 5);

  if (!/^\d{2}:\d{2}$/.test(cleanTime)) {
    return null;
  }

  const date = new Date(`${routeDate}T${cleanTime}:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function etaStatus({
  selectedDate,
  arrivalAt,
  scheduledStartTime,
  scheduledEndTime,
}: {
  selectedDate: string;
  arrivalAt: string | null;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
}) {
  if (!arrivalAt) {
    return {
      state: "unknown",
      label: "No ETA",
      minutesLate: 0,
    };
  }

  const arrival = new Date(arrivalAt);
  const start = plannedDateTime(selectedDate, scheduledStartTime);
  const end = plannedDateTime(selectedDate, scheduledEndTime);

  if (Number.isNaN(arrival.getTime())) {
    return {
      state: "unknown",
      label: "No ETA",
      minutesLate: 0,
    };
  }

  if (end && arrival.getTime() > end.getTime()) {
    const minutesLate = Math.max(
      1,
      Math.round((arrival.getTime() - end.getTime()) / 60000)
    );

    return {
      state: "late",
      label: `Late ${minutesLate}m`,
      minutesLate,
    };
  }

  if (start && arrival.getTime() > start.getTime()) {
    const minutesLate = Math.max(
      1,
      Math.round((arrival.getTime() - start.getTime()) / 60000)
    );

    return {
      state: "risk",
      label: `At risk +${minutesLate}m`,
      minutesLate,
    };
  }

  return {
    state: "ok",
    label: "On time",
    minutesLate: 0,
  };
}

async function getEtaWithCache({
  supabase,
  driverName,
  selectedDate,
  latestPing,
  currentStop,
}: {
  supabase: any;
  driverName: string;
  selectedDate: string;
  latestPing: any;
  currentStop: any;
}) {
  if (!driverName || !latestPing || !currentStop) {
    return null;
  }

  const destinationAddress = stopAddress(currentStop);

  if (!destinationAddress) {
    return null;
  }

  const originLatitude = Number(latestPing.latitude);
  const originLongitude = Number(latestPing.longitude);

  if (!Number.isFinite(originLatitude) || !Number.isFinite(originLongitude)) {
    return null;
  }

  const staleBefore = new Date(Date.now() - 1000 * 60 * 3).toISOString();

  const cachedResult = await supabase
    .from("driver_eta_cache")
    .select(
      `
      id,
      driver_name,
      route_date,
      stop_id,
      origin_latitude,
      origin_longitude,
      destination_address,
      distance_text,
      duration_text,
      duration_seconds,
      arrival_at,
      fetched_at
    `
    )
    .eq("driver_name", driverName)
    .eq("route_date", selectedDate)
    .eq("stop_id", currentStop.id)
    .gte("fetched_at", staleBefore)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cachedResult.error && cachedResult.data) {
    return {
      ...cachedResult.data,
      status: etaStatus({
        selectedDate,
        arrivalAt: cachedResult.data.arrival_at,
        scheduledStartTime: currentStop.scheduled_start_time,
        scheduledEndTime: currentStop.scheduled_end_time,
      }),
      source: "cache",
    };
  }

  try {
    const originAddress = `${originLatitude},${originLongitude}`;
    const departureTime = new Date();

    const distanceResult = await getGoogleDrivingDistanceMiles({
      originAddress,
      destinationAddress,
      departureTime,
    });

    const element = distanceResult.raw?.rows?.[0]?.elements?.[0];

    const durationSeconds = Number(
      element?.duration_in_traffic?.value || element?.duration?.value || 0
    );

    const distanceText = String(element?.distance?.text || "");
    const durationText = String(
      element?.duration_in_traffic?.text || element?.duration?.text || ""
    );

    const arrivalAt =
      Number.isFinite(durationSeconds) && durationSeconds > 0
        ? new Date(Date.now() + durationSeconds * 1000).toISOString()
        : null;

    const insertPayload = {
      driver_name: driverName,
      route_date: selectedDate,
      stop_id: currentStop.id,
      origin_latitude: originLatitude,
      origin_longitude: originLongitude,
      destination_address: destinationAddress,
      distance_text: distanceText || null,
      duration_text: durationText || null,
      duration_seconds: Number.isFinite(durationSeconds)
        ? Math.round(durationSeconds)
        : null,
      arrival_at: arrivalAt,
      raw_payload: distanceResult.raw || null,
      fetched_at: new Date().toISOString(),
    };

    await supabase.from("driver_eta_cache").insert(insertPayload);

    return {
      ...insertPayload,
      status: etaStatus({
        selectedDate,
        arrivalAt,
        scheduledStartTime: currentStop.scheduled_start_time,
        scheduledEndTime: currentStop.scheduled_end_time,
      }),
      source: "fresh",
    };
  } catch {
    return null;
  }
}

export default async function AdminRoutesLivePage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedDate = String(resolvedSearchParams?.date || todayISO());

  const { supabase } = await requireAdminPermission("routes.view");

  const googleMapsApiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    "";

  const driversResult = await supabase
    .from("route_drivers")
    .select(
      `
      id,
      name,
      color,
      phone,
      account_email,
      active,
      sort_order
    `
    )
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const drivers = driversResult.data || [];

  const pingsResult = await supabase
    .from("driver_location_pings")
    .select(
      `
      id,
      driver_name,
      route_date,
      latitude,
      longitude,
      accuracy,
      heading,
      speed,
      created_at
    `
    )
    .gte("created_at", new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  const pings = pingsResult.data || [];
  const latestPingByDriver = new Map<string, any>();

  for (const ping of pings) {
    const name = String((ping as any).driver_name || "").trim();

    if (!name) continue;

    if (!latestPingByDriver.has(name.toLowerCase())) {
      latestPingByDriver.set(name.toLowerCase(), ping);
    }
  }

  const stopsResult = await supabase
    .from("route_stops")
    .select(
      `
      id,
      booking_id,
      stop_date,
      stop_type,
      status,
      customer_name,
      customer_phone,
      address,
      city,
      state,
      zip,
      scheduled_start_time,
      scheduled_end_time,
      driver_name,
      truck_name,
      items_summary,
      setup_notes,
      balance_due,
      payment_collected,
      sort_order,
      created_at,
      bookings (
        id,
        booking_number,
        event_date,
        event_start_time,
        event_end_time,
        customers (
          id,
          full_name,
          phone,
          email
        ),
        booking_items (
          id,
          quantity,
          products (
            id,
            name,
            image_url
          )
        )
      )
    `
    )
    .eq("stop_date", selectedDate)
    .in("stop_type", ["delivery", "pickup"])
    .order("sort_order", { ascending: true })
    .order("scheduled_start_time", { ascending: true })
    .order("created_at", { ascending: true });

  const allStops = stopsResult.data || [];
  const routeStops = allStops.filter((stop: any) => !isBreakStop(stop));

  const dashboardDrivers = await Promise.all(
    drivers
      .filter(
        (driver: any) =>
          String(driver.name || "").toLowerCase() !== "unassigned"
      )
      .map(async (driver: any) => {
        const driverName = String(driver.name || "");
        const driverStops = routeStops.filter(
          (stop: any) =>
            String(stop.driver_name || "").toLowerCase() ===
            driverName.toLowerCase()
        );

        const stopsWithSequence = driverStops.map((stop: any, index: number) => ({
          id: stop.id,
          sequence_number: index + 1,
          title: mainProductName(stop),
          stop_type: stop.stop_type,
          status: stop.status,
          address: stopAddress(stop),
          scheduled_start_time: stop.scheduled_start_time,
          scheduled_end_time: stop.scheduled_end_time,
          balance_due: stop.balance_due,
          payment_collected: stop.payment_collected,
        }));

        const completedStops = driverStops.filter((stop: any) =>
          isCompletedStatus(stop.status)
        );

        const currentStop =
          driverStops.find(
            (stop: any) =>
              ["on_the_way", "arrived"].includes(String(stop.status || "")) &&
              !isCompletedStatus(stop.status)
          ) ||
          driverStops.find((stop: any) => !isCompletedStatus(stop.status)) ||
          null;

        const collectTotal = driverStops.reduce((sum: number, stop: any) => {
          if (Boolean(stop.payment_collected)) return sum;
          return sum + Number(stop.balance_due || 0);
        }, 0);

        const latestPing = latestPingByDriver.get(driverName.toLowerCase()) || null;

        const eta = await getEtaWithCache({
          supabase,
          driverName,
          selectedDate,
          latestPing,
          currentStop,
        });

        return {
          id: driver.id,
          name: driver.name,
          color: driver.color || "#23313f",
          phone: driver.phone || null,
          account_email: driver.account_email || null,
          latestPing,
          eta,
          stats: {
            totalStops: driverStops.length,
            completedStops: completedStops.length,
            openStops: driverStops.length - completedStops.length,
            collectTotal,
          },
          stops: stopsWithSequence,
          currentStop: currentStop
            ? {
                id: currentStop.id,
                sequence_number:
                  stopsWithSequence.find((item: any) => item.id === currentStop.id)
                    ?.sequence_number || null,
                title: mainProductName(currentStop),
                stop_type: currentStop.stop_type,
                status: currentStop.status,
                address: stopAddress(currentStop),
                scheduled_start_time: currentStop.scheduled_start_time,
                scheduled_end_time: currentStop.scheduled_end_time,
                balance_due: currentStop.balance_due,
              }
            : null,
        };
      })
  );

  return (
    <DriverLiveDashboard
      selectedDate={selectedDate}
      googleMapsApiKey={googleMapsApiKey}
      drivers={dashboardDrivers}
    />
  );
}

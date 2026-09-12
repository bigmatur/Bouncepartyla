import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";
import {
  getRouteWeatherForecast,
  routeLocalDateTimeToDate,
} from "@/lib/maps/google-weather";

export const dynamic = "force-dynamic";

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function forbidden(message = "Access denied") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

function fullAddress(stop: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  return [stop.address, stop.city, stop.state, stop.zip]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
}

async function authenticate(request: Request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return { response: unauthorized() } as const;

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  ).trim();

  if (!url || !anonKey) {
    return {
      response: NextResponse.json(
        { success: false, error: "Server Supabase configuration is missing." },
        { status: 500 },
      ),
    } as const;
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    return { response: unauthorized("Invalid or expired session.") } as const;
  }

  const access = await getUnifiedAccess(supabase);
  if (
    !access.user ||
    !access.isActive ||
    !isStaffRole(access.role) ||
    access.role !== "driver" ||
    !access.can("routes.view") ||
    !access.driverName
  ) {
    return { response: forbidden("Driver route access required.") } as const;
  }

  return { supabase, driverName: access.driverName } as const;
}

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;

  const date = String(new URL(request.url).searchParams.get("date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { success: false, error: "Valid date is required." },
      { status: 400 },
    );
  }

  const stopsResult = await auth.supabase
    .from("route_stops")
    .select("id, booking_id, stop_date, scheduled_start_time, address, city, state, zip")
    .eq("stop_date", date)
    .eq("driver_name", auth.driverName)
    .in("stop_type", ["delivery", "pickup"]);

  if (stopsResult.error) {
    return NextResponse.json(
      { success: false, error: stopsResult.error.message },
      { status: 500 },
    );
  }

  const stops = stopsResult.data || [];
  const bookingIds = Array.from(
    new Set(stops.map((stop) => stop.booking_id).filter(Boolean)),
  );

  const bookingById = new Map<
    string,
    { event_date: string | null; event_start_time: string | null }
  >();

  if (bookingIds.length > 0) {
    const bookingsResult = await auth.supabase
      .from("bookings")
      .select("id, event_date, event_start_time")
      .in("id", bookingIds);

    if (!bookingsResult.error) {
      for (const booking of bookingsResult.data || []) {
        bookingById.set(String(booking.id), {
          event_date: booking.event_date,
          event_start_time: booking.event_start_time,
        });
      }
    }
  }

  const cache = new Map<
    string,
    Promise<Awaited<ReturnType<typeof getRouteWeatherForecast>> | null>
  >();

  const entries = await Promise.all(
    stops.map(async (stop) => {
      const booking = stop.booking_id
        ? bookingById.get(String(stop.booking_id))
        : null;
      const address = fullAddress(stop);

      if (!address) {
        return [String(stop.id), null] as const;
      }

      let targetTime: Date;
      const routeDate = String(stop.stop_date || "").trim();
      const routeTime = String(stop.scheduled_start_time || "").trim();
      if ((!routeDate || !routeTime) && !booking?.event_date) return [String(stop.id), null] as const;
      try {
        targetTime = routeLocalDateTimeToDate(
          routeDate || booking?.event_date || "",
          routeTime || booking?.event_start_time || "",
        );
      } catch {
        return [String(stop.id), null] as const;
      }

      if (targetTime.getTime() < Date.now() - 60 * 60 * 1000) {
        targetTime = new Date();
      }

      const cacheKey = `${address.toLowerCase()}|${targetTime.toISOString()}`;

      if (!cache.has(cacheKey)) {
        cache.set(
          cacheKey,
          getRouteWeatherForecast({ address, targetTime }).catch(
            () => null,
          ),
        );
      }

      const weather = await cache.get(cacheKey)!;

      return [String(stop.id), weather] as const;
    }),
  );

  return NextResponse.json({
    success: true,
    data: Object.fromEntries(entries),
  });
}

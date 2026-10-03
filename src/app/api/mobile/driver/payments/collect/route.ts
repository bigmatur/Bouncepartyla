import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AllowedManualMethod = "cash" | "zelle" | "venmo";

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function forbidden(message = "Access denied") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

function parseManualMethod(value: unknown): AllowedManualMethod | null {
  const method = String(value || "").trim().toLowerCase();

  if (method === "cash" || method === "zelle" || method === "venmo") {
    return method;
  }

  return null;
}

function isBlockedRouteStopStatus(status: unknown) {
  const value = String(status || "").trim().toLowerCase();
  return value === "cancelled" || value === "failed";
}

function isIneligibleBookingStatus(status: unknown) {
  const value = String(status || "").trim().toLowerCase();
  return value === "cancelled" || value === "closed" || value === "refunded";
}

async function authenticate(request: Request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return { response: unauthorized() } as const;

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

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

  const driverResult = await supabase
    .from("route_drivers")
    .select("id, name")
    .eq("auth_user_id", userResult.data.user.id)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (driverResult.error || !driverResult.data?.name) {
    return {
      response: forbidden("An active linked driver account is required."),
    } as const;
  }

  return {
    supabase,
  } as const;
}

export async function POST(request: Request) {
  const auth = await authenticate(request);

  if ("response" in auth) {
    return auth.response;
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const stopId = String(body.stopId || "").trim();
  const method = parseManualMethod(body.method);

  if (!stopId) {
    return NextResponse.json(
      { success: false, error: "Route stop ID is required." },
      { status: 400 },
    );
  }

  if (!method) {
    return NextResponse.json(
      { success: false, error: "Only Cash, Zelle, and Venmo are supported in this step." },
      { status: 400 },
    );
  }

  const assignedStopResult = await auth.supabase.rpc(
    "get_my_assigned_route_stop",
    { p_stop_id: stopId },
  );

  if (assignedStopResult.error) {
    return NextResponse.json(
      {
        success: false,
        error: String(assignedStopResult.error.message || "This route stop is not assigned to your driver account."),
      },
      { status: 403 },
    );
  }

  const stop = Array.isArray(assignedStopResult.data)
    ? (assignedStopResult.data[0] || null)
    : (assignedStopResult.data || null);

  if (!stop) {
    return NextResponse.json(
      { success: false, error: "Route stop was not found." },
      { status: 404 },
    );
  }

  if (isBlockedRouteStopStatus(stop.status)) {
    return NextResponse.json(
      { success: false, error: "This route stop is not eligible for payment collection." },
      { status: 400 },
    );
  }

  const bookingId = String(stop.booking_id || "").trim();

  if (!bookingId) {
    return NextResponse.json(
      { success: false, error: "This route stop is not linked to a booking." },
      { status: 400 },
    );
  }

  const bookingResult = await auth.supabase
    .from("bookings")
    .select("id, status, balance_due")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingResult.error) {
    return NextResponse.json(
      { success: false, error: bookingResult.error.message },
      { status: 400 },
    );
  }

  if (!bookingResult.data) {
    return NextResponse.json(
      { success: false, error: "Booking not found." },
      { status: 404 },
    );
  }

  const booking = bookingResult.data as Record<string, unknown>;

  if (isIneligibleBookingStatus(booking.status)) {
    return NextResponse.json(
      { success: false, error: "This booking is not eligible for payment collection." },
      { status: 400 },
    );
  }

  const authoritativeBalance = Math.max(0, Number(booking.balance_due || 0));

  if (!Number.isFinite(authoritativeBalance)) {
    return NextResponse.json(
      { success: false, error: "Booking balance is invalid." },
      { status: 400 },
    );
  }

  if (Boolean(stop.payment_collected)) {
    return NextResponse.json({
      success: true,
      data: {
        stopId,
        bookingId,
        method,
        amountRecorded: authoritativeBalance,
        amountReported: authoritativeBalance,
        balanceDue: authoritativeBalance,
        alreadyReported: true,
        reportStatus: "already_reported",
      },
    });
  }

  if (authoritativeBalance <= 0) {
    return NextResponse.json({
      success: true,
      data: {
        stopId,
        bookingId,
        method,
        amountRecorded: 0,
        amountReported: 0,
        balanceDue: Number(authoritativeBalance.toFixed(2)),
        alreadyReported: false,
        reportStatus: "no_balance_due",
      },
    });
  }

  try {
    const operationalResult = await auth.supabase.rpc(
      "mark_my_route_stop_payment_collected",
      {
        p_stop_id: stopId,
        p_amount: authoritativeBalance,
        p_method: method,
      },
    );

    if (operationalResult.error) {
      return NextResponse.json(
        {
          success: false,
          error: String(operationalResult.error.message || "Could not report payment collection."),
        },
        { status: 400 },
      );
    }

    const operationalData =
      operationalResult.data && typeof operationalResult.data === "object"
        ? (operationalResult.data as Record<string, unknown>)
        : null;

    const amountReported = Number(
      operationalData?.payment_collected_amount ?? authoritativeBalance,
    );

    const reportedAt = String(
      operationalData?.payment_collected_at || new Date().toISOString(),
    );

    return NextResponse.json({
      success: true,
      data: {
        stopId,
        bookingId,
        method,
        amountRecorded: Number.isFinite(amountReported)
          ? Number(amountReported.toFixed(2))
          : Number(authoritativeBalance.toFixed(2)),
        amountReported: Number.isFinite(amountReported)
          ? Number(amountReported.toFixed(2))
          : Number(authoritativeBalance.toFixed(2)),
        balanceDue: Number(authoritativeBalance.toFixed(2)),
        alreadyReported: false,
        reportStatus: "reported",
        reportedAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Could not collect payment.",
      },
      { status: 400 },
    );
  }
}

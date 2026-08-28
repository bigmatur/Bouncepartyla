import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  getUnifiedAccess,
  isStaffRole,
} from "@/lib/auth/access";
import { cancelBookingWithSupabase } from "@/lib/booking/cancel-booking";

export const dynamic = "force-dynamic";

function unauthorized(message = "Unauthorized") {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 },
  );
}

function forbidden(message = "Access denied") {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authHeader = String(
    request.headers.get("authorization") || "",
  ).trim();

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return unauthorized();
  }

  const url = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  ).trim();
  const anonKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  ).trim();

  if (!url || !anonKey) {
    return NextResponse.json(
      {
        success: false,
        error: "Server Supabase configuration is missing.",
      },
      { status: 500 },
    );
  }

  const supabase = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const userResult = await supabase.auth.getUser(token);

  if (userResult.error || !userResult.data.user) {
    return unauthorized("Invalid or expired session.");
  }

  const access = await getUnifiedAccess(supabase);

  if (
    !access.user ||
    !access.isActive ||
    !isStaffRole(access.role) ||
    !access.can("bookings.cancel")
  ) {
    return forbidden(
      "Access denied. Missing permission: bookings.cancel",
    );
  }

  const { id } = await context.params;
  const bookingId = String(id || "").trim();

  if (!bookingId) {
    return NextResponse.json(
      { success: false, error: "Booking ID is required." },
      { status: 400 },
    );
  }

  let payload: { cancellationReason?: unknown } = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const cancellationReason =
    typeof payload.cancellationReason === "string"
      ? payload.cancellationReason.trim().slice(0, 500)
      : "";

  try {
    const result = await cancelBookingWithSupabase(
      supabase,
      bookingId,
      cancellationReason,
    );

    return NextResponse.json({
      success: true,
      alreadyCancelled: result.alreadyCancelled,
      booking: result.booking,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not cancel booking.";

    const status = message.includes("not found") ? 404 : 400;

    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }
}

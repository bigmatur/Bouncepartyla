import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  getUnifiedAccess,
  isStaffRole,
} from "@/lib/auth/access";
import { getAdminInventorySnapshotCore } from "@/lib/booking/booking-availability-core";

export const dynamic = "force-dynamic";

function unauthorized(message = "Unauthorized") {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status: 401,
    },
  );
}

function forbidden(message = "Access denied") {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status: 403,
    },
  );
}

export async function POST(request: Request) {
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
      {
        status: 500,
      },
    );
  }

  const supabase = createClient(
    url,
    anonKey,
    {
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
    },
  );

  const userResult =
    await supabase.auth.getUser(token);

  if (
    userResult.error ||
    !userResult.data.user
  ) {
    return unauthorized(
      "Invalid or expired session.",
    );
  }

  const access =
    await getUnifiedAccess(supabase);

  if (
    !access.user ||
    !access.isActive ||
    !isStaffRole(access.role) ||
    !access.can("bookings.create")
  ) {
    return forbidden(
      "Access denied. Missing permission: bookings.create",
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const eventDate = String(
    body?.eventDate || "",
  ).trim();

  const eventStartTime = String(
    body?.eventStartTime || "",
  ).trim();

  const eventEndTime = String(
    body?.eventEndTime || "",
  ).trim();

  const productIds = Array.isArray(body?.productIds)
    ? body.productIds
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];

  const formData = new FormData();

  formData.set("eventDate", eventDate);
  formData.set("eventStartTime", eventStartTime);
  formData.set("eventEndTime", eventEndTime);

  // Native Admin New Booking is always a staff/cashier flow.
  // Do not trust a bookingActor supplied by the client.
  formData.set("bookingActor", "cashier");
  formData.set("productIds", JSON.stringify(productIds));

  try {
    const snapshot =
      await getAdminInventorySnapshotCore(
        supabase,
        formData,
      );

    return NextResponse.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not check product availability.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 400,
      },
    );
  }
}

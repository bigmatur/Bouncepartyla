import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  getUnifiedAccess,
  isStaffRole,
} from "@/lib/auth/access";
import { prepareAdminNewBookingSelection } from "@/lib/booking/admin-new-booking-selection";

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

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: message },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const authHeader = String(
    request.headers.get("authorization") || "",
  ).trim();

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return unauthorized();

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
    return badRequest("Invalid request body.");
  }

  try {
    const prepared = await prepareAdminNewBookingSelection({
      supabase,
      setupAddress: String(body.setupAddress || ""),
      setupCity: String(body.setupCity || ""),
      setupState: String(body.setupState || "CA"),
      setupZip: String(body.setupZip || ""),
      products: Array.isArray(body.products)
        ? (body.products as any)
        : [],
      modifiers: Array.isArray(body.modifiers)
        ? (body.modifiers as any)
        : [],
    });

    return NextResponse.json({
      success: true,
      data: prepared.pricing,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not calculate booking pricing.";

    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}

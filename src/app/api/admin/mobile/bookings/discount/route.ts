import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";
import { updateBookingDiscountCore } from "@/lib/booking/admin-booking-discount";

export const dynamic = "force-dynamic";

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function forbidden(message = "Access denied") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

async function authenticate(request: Request) {
  const authHeader = String(
    request.headers.get("authorization") || "",
  ).trim();

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return { response: unauthorized() } as const;
  }

  const url = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  ).trim();

  const anonKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  ).trim();

  if (!url || !anonKey) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: "Server Supabase configuration is missing.",
        },
        { status: 500 },
      ),
    } as const;
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
    return {
      response: unauthorized("Invalid or expired session."),
    } as const;
  }

  const access = await getUnifiedAccess(supabase);

  if (
    !access.user ||
    !access.isActive ||
    !isStaffRole(access.role) ||
    !access.can("bookings.edit")
  ) {
    return {
      response: forbidden(
        "Access denied. Missing permission: bookings.edit",
      ),
    } as const;
  }

  return { supabase } as const;
}

export async function GET(request: Request) {
  const auth = await authenticate(request);

  if ("response" in auth) {
    return auth.response;
  }

  const settingsResult = await auth.supabase
    .from("booking_discount_security_settings")
    .select("discount_password_enabled, discount_password_hint")
    .limit(1)
    .maybeSingle();

  const settings = settingsResult.error
    ? null
    : (settingsResult.data as
        | {
            discount_password_enabled?: boolean | null;
            discount_password_hint?: string | null;
          }
        | null);

  return NextResponse.json({
    success: true,
    data: {
      passwordEnabled:
        settings?.discount_password_enabled === true,
      passwordHint: String(
        settings?.discount_password_hint || "",
      ),
    },
  });
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
      {
        success: false,
        error: "Invalid request body.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await updateBookingDiscountCore({
      supabase: auth.supabase,
      bookingId: String(body.bookingId || ""),
      discountAmount: Number(body.discountAmount),
      discountPassword: String(body.discountPassword || ""),
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not update discount.",
      },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";
import { getQuickCheckInventorySnapshot } from "@/lib/booking/quick-check-inventory-snapshot";
import { normalizeLosAngelesDateInput } from "@/lib/date-time/los-angeles-day-window";

export const dynamic = "force-dynamic";

function response(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

function validTime(value: string, fallback: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

export async function GET(request: Request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return response(401, "Unauthorized");

  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!supabaseUrl || !anonKey) {
    return response(500, "Server Supabase configuration is missing.");
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    return response(401, "Invalid or expired session.");
  }

  const access = await getUnifiedAccess(supabase);
  if (
    !access.user ||
    !access.isActive ||
    !isStaffRole(access.role) ||
    !access.can("bookings.view")
  ) {
    return response(403, "Access denied. Missing permission: bookings.view");
  }

  const requestUrl = new URL(request.url);
  const selectedDate = normalizeLosAngelesDateInput(requestUrl.searchParams.get("date") || undefined);
  const eventStartTime = validTime(String(requestUrl.searchParams.get("start") || ""), "09:00");
  const eventEndTime = validTime(String(requestUrl.searchParams.get("end") || ""), "21:00");

  try {
    const snapshot = await getQuickCheckInventorySnapshot({
      supabase,
      eventDate: selectedDate,
      eventStartTime,
      eventEndTime,
      bookingActor: "cashier",
    });

    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    return response(
      500,
      error instanceof Error
        ? error.message
        : "Could not load inventory availability snapshot.",
    );
  }
}

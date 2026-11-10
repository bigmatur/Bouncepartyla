import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

async function context(request: Request) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { error: fail(401, "Unauthorized") };

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) return { error: fail(500, "Server Supabase configuration is missing.") };

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) return { error: fail(401, "Invalid or expired session.") };

  const access = await getUnifiedAccess(supabase);
  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("inventory.view")) {
    return { error: fail(403, "Your account cannot access returns.") };
  }

  return { supabase, access };
}

export async function GET(request: Request) {
  const result = await context(request);
  if ("error" in result) return result.error;

  const [reservationsResult, locationsResult] = await Promise.all([
    result.supabase
      .from("inventory_reservations")
      .select(`
        id, status, quantity, reserved_until, picked_up_at,
        inventory_items (id, name, sku),
        inventory_units (id, unit_code, status),
        bookings (id, booking_number, event_date, customers (id, full_name))
      `)
      .in("status", ["picked", "loaded", "installed"])
      .is("returned_at", null)
      .order("reserved_until", { ascending: true })
      .limit(150),
    result.supabase
      .from("warehouse_locations")
      .select("id, slug")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (reservationsResult.error) return fail(400, reservationsResult.error.message);
  if (locationsResult.error) return fail(400, locationsResult.error.message);

  const locations = locationsResult.data || [];
  const defaultLocation =
    locations.find((location) => location.slug === "receiving-area") ||
    locations.find((location) => location.slug === "main-warehouse") ||
    locations[0] || null;

  return NextResponse.json(
    {
      success: true,
      data: {
        reservations: reservationsResult.data || [],
        defaultLocationId: defaultLocation?.id || null,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const result = await context(request);
  if ("error" in result) return result.error;
  if (!result.access.can("inventory.edit")) {
    return fail(403, "Your role cannot process returns.");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid request body.");
  }

  const reservationId = String(body.reservationId || "").trim();
  const itemId = String(body.itemId || "").trim();
  const unitId = String(body.unitId || "").trim() || null;
  const bookingId = String(body.bookingId || "").trim() || null;
  const currentStatus = String(body.currentStatus || "").trim() || null;
  const resultStatus = String(body.resultStatus || "returned").trim();
  const locationId = String(body.locationId || "").trim() || null;
  const notes = String(body.notes || "").trim() || null;
  const allowedStatuses = ["available", "returned", "cleaning", "maintenance", "damaged"];

  if (!reservationId || !itemId || !allowedStatuses.includes(resultStatus)) {
    return fail(400, "Choose a valid return and result status.");
  }
  if (resultStatus === "damaged" && !result.access.can("inventory.mark_damaged")) {
    return fail(403, "Your role cannot report damage.");
  }

  const updateResult = await result.supabase.rpc("process_inventory_return", {
    p_reservation_id: reservationId,
    p_item_id: itemId,
    p_unit_id: unitId,
    p_booking_id: bookingId,
    p_current_status: currentStatus,
    p_result_status: resultStatus,
    p_location_id: locationId,
    p_damage_reported: resultStatus === "damaged",
    p_damage_notes: resultStatus === "damaged" ? notes : null,
    p_notes: notes,
  });
  if (updateResult.error) return fail(400, updateResult.error.message);

  return NextResponse.json({ success: true, data: { result: updateResult.data } });
}

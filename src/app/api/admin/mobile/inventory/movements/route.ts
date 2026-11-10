import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

function fail(status: number, error: string) { return NextResponse.json({ success: false, error }, { status }); }

export async function GET(request: Request) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return fail(401, "Unauthorized");
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) return fail(500, "Server Supabase configuration is missing.");
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const user = await supabase.auth.getUser(token);
  if (user.error || !user.data.user) return fail(401, "Invalid or expired session.");
  const access = await getUnifiedAccess(supabase);
  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("inventory.view")) return fail(403, "Your account cannot access inventory movements.");

  const result = await supabase.from("inventory_movements").select(`
    id, movement_type, quantity, from_status, to_status, reason, notes, created_at,
    inventory_items (id, name, sku), inventory_units (id, unit_code, status),
    bookings (id, booking_number, event_date, customers (id, full_name)),
    from_location:from_location_id (id, name, location_type),
    to_location:to_location_id (id, name, location_type)
  `).order("created_at", { ascending: false }).limit(200);
  if (result.error) return fail(400, result.error.message);
  return NextResponse.json({ success: true, data: { movements: result.data || [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

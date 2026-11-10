import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";

export const dynamic = "force-dynamic";
const STATUSES = ["available", "reserved", "picked", "loaded", "installed", "returned", "cleaning", "maintenance", "damaged", "lost", "retired"];

function fail(status: number, error: string) { return NextResponse.json({ success: false, error }, { status }); }
async function context(request: Request) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { error: fail(401, "Unauthorized") };
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) return { error: fail(500, "Server Supabase configuration is missing.") };
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const user = await supabase.auth.getUser(token);
  if (user.error || !user.data.user) return { error: fail(401, "Invalid or expired session.") };
  const access = await getUnifiedAccess(supabase);
  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("inventory.view")) return { error: fail(403, "Your account cannot access inventory counts.") };
  return { supabase, access };
}

export async function GET(request: Request) {
  const result = await context(request); if ("error" in result) return result.error;
  const [locations, counts] = await Promise.all([
    result.supabase.from("warehouse_locations").select("id, name, slug, location_type").eq("active", true).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    result.supabase.from("inventory_counts").select(`
      id, count_number, status, warehouse_location_id, started_at, completed_at, notes,
      warehouse_locations (id, name, location_type),
      inventory_count_lines (
        id, inventory_item_id, inventory_unit_id, expected_quantity, counted_quantity,
        difference_quantity, expected_status, counted_status, notes,
        inventory_items (id, name, sku, tracking_type), inventory_units (id, unit_code, status)
      )
    `).order("started_at", { ascending: false }).limit(20),
  ]);
  if (locations.error) return fail(400, locations.error.message);
  if (counts.error) return fail(400, counts.error.message);
  return NextResponse.json({ success: true, data: { locations: locations.data || [], counts: counts.data || [], statuses: STATUSES } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  const result = await context(request); if ("error" in result) return result.error;
  if (!result.access.can("inventory.edit")) return fail(403, "Your role cannot change inventory counts.");
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return fail(400, "Invalid request body."); }
  const action = String(body.action || "").trim();
  const countId = String(body.countId || "").trim();

  if (action === "start") {
    const locationId = String(body.locationId || "").trim() || null;
    const notes = String(body.notes || "").trim() || null;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const rpc = await result.supabase.rpc("start_inventory_count", { p_count_number: `CNT-${stamp}`, p_warehouse_location_id: locationId, p_notes: notes });
    if (rpc.error) return fail(400, rpc.error.message);
    return NextResponse.json({ success: true, data: rpc.data });
  }
  if (!countId) return fail(400, "Missing inventory count.");

  if (action === "update_line") {
    const lineId = String(body.lineId || "").trim();
    const expectedQuantity = Number(body.expectedQuantity || 0);
    const countedQuantity = Number(body.countedQuantity || 0);
    const countedStatusValue = String(body.countedStatus || "").trim();
    const countedStatus = countedStatusValue && STATUSES.includes(countedStatusValue) ? countedStatusValue : null;
    const notes = String(body.notes || "").trim() || null;
    if (!lineId || !Number.isFinite(countedQuantity) || countedQuantity < 0) return fail(400, "Enter a valid counted quantity.");
    const update = await result.supabase.from("inventory_count_lines").update({ counted_quantity: countedQuantity, difference_quantity: countedQuantity - expectedQuantity, counted_status: countedStatus, notes }).eq("id", lineId).eq("inventory_count_id", countId);
    if (update.error) return fail(400, update.error.message);
    return NextResponse.json({ success: true });
  }
  if (action === "complete") {
    const rpc = await result.supabase.rpc("complete_inventory_count", { p_count_id: countId });
    if (rpc.error) return fail(400, rpc.error.message);
    if (!rpc.data || !["processed", "already_processed"].includes(String(rpc.data.status || ""))) return fail(400, "Inventory count completion did not complete.");
    return NextResponse.json({ success: true, data: rpc.data });
  }
  if (action === "cancel") {
    const update = await result.supabase.from("inventory_counts").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", countId).in("status", ["draft", "in_progress"]);
    if (update.error) return fail(400, update.error.message);
    return NextResponse.json({ success: true });
  }
  return fail(400, "Unknown inventory count action.");
}

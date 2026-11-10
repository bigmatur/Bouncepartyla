import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";

export const dynamic = "force-dynamic";
const WRITE_OFF_STATUSES = ["retired", "lost", "damaged", "maintenance"];

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
  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("inventory.view")) return { error: fail(403, "Your account cannot access warehouse operations.") };
  return { supabase, access };
}

export async function GET(request: Request) {
  const result = await context(request); if ("error" in result) return result.error;
  const [units, locations, adjustments] = await Promise.all([
    result.supabase.from("inventory_units").select(`
      id, unit_code, status, condition, warehouse_location_id,
      inventory_items (id, name, sku, tracking_type), warehouse_locations (id, name, location_type)
    `).not("status", "in", "(retired,lost)").order("unit_code", { ascending: true }).limit(500),
    result.supabase.from("warehouse_locations").select("id, name, slug, location_type").eq("active", true).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    result.supabase.from("inventory_adjustments").select(`
      id, adjustment_type, quantity_change, from_status, to_status, reason, notes, created_at,
      inventory_items (id, name, sku), inventory_units (id, unit_code)
    `).in("adjustment_type", ["write_off", "loss", "damage"]).order("created_at", { ascending: false }).limit(30),
  ]);
  if (units.error) return fail(400, units.error.message); if (locations.error) return fail(400, locations.error.message); if (adjustments.error) return fail(400, adjustments.error.message);
  return NextResponse.json({ success: true, data: { units: units.data || [], locations: locations.data || [], adjustments: adjustments.data || [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  const result = await context(request); if ("error" in result) return result.error;
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return fail(400, "Invalid request body."); }
  const action = String(body.action || "").trim(); const unitId = String(body.unitId || "").trim();
  const reason = String(body.reason || "").trim() || null; const notes = String(body.notes || "").trim() || null;
  if (!unitId) return fail(400, "Choose an inventory unit.");
  const unitResult = await result.supabase.from("inventory_units").select("id, inventory_item_id, status, warehouse_location_id").eq("id", unitId).single();
  if (unitResult.error || !unitResult.data) return fail(400, unitResult.error?.message || "Inventory unit was not found.");
  const unit = unitResult.data;

  if (action === "transfer") {
    if (!result.access.can("inventory.edit")) return fail(403, "Your role cannot transfer inventory.");
    const locationId = String(body.locationId || "").trim() || null;
    if (!locationId || locationId === unit.warehouse_location_id) return fail(400, "Choose a different destination location.");
    const update = await result.supabase.from("inventory_units").update({ warehouse_location_id: locationId, updated_at: new Date().toISOString() }).eq("id", unitId);
    if (update.error) return fail(400, update.error.message);
    const movement = await result.supabase.from("inventory_movements").insert({ inventory_item_id: unit.inventory_item_id, inventory_unit_id: unitId, quantity: 1, movement_type: "location_transfer", status: "completed", from_status: unit.status, to_status: unit.status, from_location_id: unit.warehouse_location_id, to_location_id: locationId, reason, notes: notes || reason || "Warehouse location transfer." });
    if (movement.error) return fail(400, movement.error.message);
    return NextResponse.json({ success: true });
  }

  if (action === "write_off") {
    const toStatus = String(body.toStatus || "retired").trim();
    if (!WRITE_OFF_STATUSES.includes(toStatus)) return fail(400, "Choose a valid write-off action.");
    const damageAction = ["damaged", "maintenance"].includes(toStatus);
    const allowed = damageAction ? result.access.can("inventory.mark_damaged") : result.access.can("inventory.edit");
    if (!allowed) return fail(403, "Your role cannot perform this inventory action.");
    if (!reason) return fail(400, "Enter a reason for this inventory action.");
    const payload: Record<string, unknown> = { status: toStatus, updated_at: new Date().toISOString() };
    if (toStatus === "retired") payload.retired_at = new Date().toISOString();
    const update = await result.supabase.from("inventory_units").update(payload).eq("id", unitId);
    if (update.error) return fail(400, update.error.message);
    const adjustmentType = toStatus === "lost" ? "loss" : damageAction ? "damage" : "write_off";
    const movementType = toStatus === "lost" ? "lost" : damageAction ? "send_to_repair" : "write_off";
    const adjustment = await result.supabase.from("inventory_adjustments").insert({ adjustment_type: adjustmentType, inventory_item_id: unit.inventory_item_id, inventory_unit_id: unitId, quantity_change: toStatus === "maintenance" ? 0 : -1, from_status: unit.status, to_status: toStatus, reason, notes });
    if (adjustment.error) return fail(400, adjustment.error.message);
    const movement = await result.supabase.from("inventory_movements").insert({ movement_type: movementType, inventory_item_id: unit.inventory_item_id, inventory_unit_id: unitId, quantity: 1, from_status: unit.status, to_status: toStatus, from_location_id: unit.warehouse_location_id, reason, notes });
    if (movement.error) return fail(400, movement.error.message);
    return NextResponse.json({ success: true });
  }
  return fail(400, "Unknown warehouse operation.");
}

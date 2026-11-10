import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

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
  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("inventory.view")) return { error: fail(403, "Your account cannot access supplies.") };
  return { supabase, access };
}

export async function GET(request: Request) {
  const result = await context(request); if ("error" in result) return result.error;
  const [supplies, items, locations] = await Promise.all([
    result.supabase.from("inventory_supplies").select(`
      id, supply_number, supplier_name, warehouse_location_id, received_by, currency, status,
      supply_date, received_at, notes, created_at,
      warehouse_locations (id, name, location_type),
      inventory_supply_lines (
        id, inventory_item_id, quantity, unit_cost, total_cost, condition, notes, received_at,
        inventory_items (id, name, sku, tracking_type)
      )
    `).order("supply_date", { ascending: false }).limit(100),
    result.supabase.from("inventory_items").select("id, name, sku, tracking_type, default_purchase_price").is("deleted_at", null).order("name", { ascending: true }).limit(500),
    result.supabase.from("warehouse_locations").select("id, name, slug, location_type").eq("active", true).order("sort_order", { ascending: true }).order("name", { ascending: true }),
  ]);
  if (supplies.error) return fail(400, supplies.error.message);
  if (items.error) return fail(400, items.error.message);
  if (locations.error) return fail(400, locations.error.message);
  return NextResponse.json({ success: true, data: { supplies: supplies.data || [], items: items.data || [], locations: locations.data || [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  const result = await context(request); if ("error" in result) return result.error;
  if (!result.access.can("inventory.edit")) return fail(403, "Your role cannot edit supplies.");
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return fail(400, "Invalid request body."); }
  const action = String(body.action || "").trim();

  if (action === "create") {
    const count = await result.supabase.from("inventory_supplies").select("id", { count: "exact", head: true });
    if (count.error) return fail(400, count.error.message);
    const supplyNumber = `SUP-${String((count.count || 0) + 1).padStart(5, "0")}`;
    const locationId = String(body.locationId || "").trim() || null;
    const inserted = await result.supabase.from("inventory_supplies").insert({
      supply_number: supplyNumber,
      supplier_name: String(body.supplierName || "").trim() || null,
      warehouse_location_id: locationId,
      received_by: String(body.receivedBy || "").trim() || null,
      currency: String(body.currency || "USD").trim() || "USD",
      status: "draft",
      supply_date: new Date().toISOString(),
      notes: String(body.notes || "").trim() || null,
      updated_at: new Date().toISOString(),
    }).select("id").single();
    if (inserted.error || !inserted.data) return fail(400, inserted.error?.message || "Could not create supply draft.");
    return NextResponse.json({ success: true, data: { supplyId: inserted.data.id } });
  }

  const supplyId = String(body.supplyId || "").trim();
  if (!supplyId) return fail(400, "Choose a supply document.");
  const loaded = await result.supabase.from("inventory_supplies").select("id, supply_number, warehouse_location_id, status").eq("id", supplyId).single();
  if (loaded.error || !loaded.data) return fail(400, loaded.error?.message || "Supply document was not found.");
  const supply = loaded.data;

  if (action === "add_line") {
    if (supply.status !== "draft") return fail(400, "Only draft supplies can be edited.");
    const itemId = String(body.itemId || "").trim();
    const quantity = Number(body.quantity || 0); const unitCost = Number(body.unitCost || 0);
    if (!itemId) return fail(400, "Choose an inventory item.");
    if (!Number.isFinite(quantity) || quantity <= 0) return fail(400, "Quantity must be greater than zero.");
    if (!Number.isFinite(unitCost) || unitCost < 0) return fail(400, "Unit cost cannot be negative.");
    const inserted = await result.supabase.from("inventory_supply_lines").insert({
      supply_id: supplyId, inventory_item_id: itemId, quantity, unit_cost: unitCost,
      total_cost: Number((quantity * unitCost).toFixed(2)), condition: String(body.condition || "good").trim() || "good",
      notes: String(body.notes || "").trim() || null, updated_at: new Date().toISOString(),
    });
    if (inserted.error) return fail(400, inserted.error.message);
    return NextResponse.json({ success: true });
  }

  if (action === "cancel") {
    if (supply.status !== "draft") return fail(400, "Only draft supplies can be cancelled.");
    const updated = await result.supabase.from("inventory_supplies").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", supplyId);
    if (updated.error) return fail(400, updated.error.message);
    return NextResponse.json({ success: true });
  }

  if (action === "receive") {
    if (supply.status !== "draft") return fail(400, "Only draft supplies can be received.");
    if (!supply.warehouse_location_id) return fail(400, "Choose a warehouse location before receiving.");
    const linesResult = await result.supabase.from("inventory_supply_lines").select(`
      id, inventory_item_id, quantity, unit_cost, total_cost, condition, notes,
      inventory_items (id, name, sku, tracking_type, quantity_on_hand, quantity_available)
    `).eq("supply_id", supplyId).order("created_at", { ascending: true });
    if (linesResult.error) return fail(400, linesResult.error.message);
    const lines = linesResult.data || [];
    if (lines.length === 0) return fail(400, "Add at least one supply line before receiving.");

    for (const line of lines as Array<Record<string, any>>) {
      const item = Array.isArray(line.inventory_items) ? line.inventory_items[0] : line.inventory_items;
      if (!item) return fail(400, "Inventory item not found for one of the lines.");
      const quantity = Number(line.quantity || 0); const unitCost = Number(line.unit_cost || 0);
      if (quantity <= 0) return fail(400, `Invalid quantity for ${item.name || "inventory item"}.`);
      const trackingType = String(item.tracking_type || "serialized");
      if (trackingType === "quantity" || trackingType === "consumable") {
        const itemUpdate = await result.supabase.from("inventory_items").update({ quantity_on_hand: Number(item.quantity_on_hand || 0) + quantity, quantity_available: Number(item.quantity_available || 0) + quantity, default_purchase_price: unitCost, updated_at: new Date().toISOString() }).eq("id", item.id);
        if (itemUpdate.error) return fail(400, itemUpdate.error.message);
        const movement = await result.supabase.from("inventory_movements").insert({ inventory_item_id: item.id, supply_id: supplyId, supply_line_id: line.id, quantity, movement_type: "receive", status: "completed", to_location_id: supply.warehouse_location_id, unit_cost: unitCost, total_cost: Number(line.total_cost || 0), notes: line.notes || `Received from ${supply.supply_number}` });
        if (movement.error) return fail(400, movement.error.message);
      } else {
        if (!Number.isInteger(quantity)) return fail(400, `Serialized item ${item.name || "item"} requires whole quantity.`);
        const prefix = `${cleanCode(supply.supply_number || "SUP")}-${cleanCode(item.sku || item.name || "UNIT").slice(0, 18)}-${String(line.id).slice(0, 6).toUpperCase()}`;
        const existing = await result.supabase.from("inventory_units").select("unit_code").ilike("unit_code", `${prefix}-%`);
        if (existing.error) return fail(400, existing.error.message);
        const used = new Set((existing.data || []).map((row) => Number(String(row.unit_code || "").match(/-(\d+)$/)?.[1] || 0)));
        const rows: Array<Record<string, unknown>> = []; let index = 1;
        while (rows.length < quantity) { if (!used.has(index)) { const code = `${prefix}-${String(index).padStart(3, "0")}`; rows.push({ inventory_item_id: item.id, supply_id: supplyId, supply_line_id: line.id, unit_code: code, serial_number: code, barcode: code, status: "available", warehouse_location_id: supply.warehouse_location_id, condition: line.condition || "good", purchase_price: unitCost, notes: line.notes, deleted_at: null, updated_at: new Date().toISOString() }); } index += 1; }
        const created = await result.supabase.from("inventory_units").insert(rows).select("id, unit_code");
        if (created.error) return fail(400, created.error.message);
        const movements = (created.data || []).map((unit) => ({ inventory_item_id: item.id, inventory_unit_id: unit.id, supply_id: supplyId, supply_line_id: line.id, quantity: 1, movement_type: "receive", status: "completed", to_location_id: supply.warehouse_location_id, unit_cost: unitCost, total_cost: unitCost, notes: `Received unit ${unit.unit_code} from ${supply.supply_number}` }));
        if (movements.length) { const movement = await result.supabase.from("inventory_movements").insert(movements); if (movement.error) return fail(400, movement.error.message); }
      }
      const lineUpdate = await result.supabase.from("inventory_supply_lines").update({ created_units_count: trackingType === "quantity" || trackingType === "consumable" ? 0 : quantity, received_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", line.id);
      if (lineUpdate.error) return fail(400, lineUpdate.error.message);
    }
    const supplyUpdate = await result.supabase.from("inventory_supplies").update({ status: "received", received_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", supplyId);
    if (supplyUpdate.error) return fail(400, supplyUpdate.error.message);
    return NextResponse.json({ success: true });
  }

  return fail(400, "Unknown supply action.");
}

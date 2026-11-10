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
    return { error: fail(403, "Your account cannot access inventory receiving.") };
  }

  return { supabase, access };
}

function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function unitPrefix(item: { id: string; name: string | null; sku: string | null }, manual: string | null) {
  const selected = cleanCode(manual || "") || cleanCode(item.sku || "");
  if (selected) return selected;
  return `${cleanCode(item.name || "UNIT").slice(0, 18) || "UNIT"}-${item.id.slice(0, 6).toUpperCase()}`;
}

async function nextUnitCodes(
  supabase: any,
  item: { id: string; name: string | null; sku: string | null },
  manualPrefix: string | null,
  quantity: number,
) {
  const prefix = unitPrefix(item, manualPrefix);
  const existing = await supabase.from("inventory_units").select("unit_code").ilike("unit_code", `${prefix}-%`);
  if (existing.error) throw new Error(existing.error.message);
  const used = new Set<number>();
  for (const row of (existing.data || []) as Array<{ unit_code?: string | null }>) {
    const match = String(row.unit_code || "").match(/-(\d+)$/);
    if (match) used.add(Number(match[1]));
  }
  const codes: string[] = [];
  let index = 1;
  while (codes.length < quantity) {
    if (!used.has(index)) codes.push(`${prefix}-${String(index).padStart(3, "0")}`);
    index += 1;
  }
  return codes;
}

export async function GET(request: Request) {
  const result = await context(request);
  if ("error" in result) return result.error;

  const [items, categories, locations] = await Promise.all([
    result.supabase.from("inventory_items")
      .select("id, name, sku, category_id, tracking_type, default_purchase_price, quantity_available, image_url")
      .is("deleted_at", null).neq("active", false).order("name", { ascending: true }),
    result.supabase.from("inventory_categories").select("id, name")
      .eq("active", true).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    result.supabase.from("warehouse_locations").select("id, name, slug, location_type")
      .eq("active", true).order("sort_order", { ascending: true }).order("name", { ascending: true }),
  ]);
  if (items.error) return fail(400, items.error.message);
  if (categories.error) return fail(400, categories.error.message);
  if (locations.error) return fail(400, locations.error.message);

  const locationRows = locations.data || [];
  const defaultLocation = locationRows.find((row) => row.slug === "receiving-area")
    || locationRows.find((row) => row.slug === "main-warehouse") || locationRows[0] || null;

  return NextResponse.json({ success: true, data: {
    items: items.data || [], categories: categories.data || [], locations: locationRows,
    defaultLocationId: defaultLocation?.id || null,
  } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  const result = await context(request);
  if ("error" in result) return result.error;
  if (!result.access.can("inventory.edit")) return fail(403, "Your role cannot receive inventory stock.");

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail(400, "Invalid request body."); }

  const itemId = String(body.itemId || "").trim();
  const locationId = String(body.locationId || "").trim() || null;
  const quantityValue = Number(String(body.quantity || "").replace(",", "."));
  const purchasePrice = Math.max(0, Number(String(body.purchasePrice || 0).replace(",", ".")) || 0);
  const serialPrefix = String(body.serialPrefix || "").trim() || null;
  const condition = String(body.condition || "good").trim() || "good";
  const notes = String(body.notes || "").trim() || null;
  if (!itemId) return fail(400, "Choose an inventory item.");

  const itemResult = await result.supabase.from("inventory_items")
    .select("id, name, sku, tracking_type, quantity_on_hand, quantity_available, image_url")
    .eq("id", itemId).is("deleted_at", null).neq("active", false).single();
  if (itemResult.error || !itemResult.data) return fail(400, itemResult.error?.message || "Inventory item was not found.");
  const item = itemResult.data;
  const trackingType = String(item.tracking_type || "serialized");
  const isBulk = trackingType === "quantity" || trackingType === "consumable";
  if (!Number.isFinite(quantityValue) || quantityValue < 1 || (!isBulk && !Number.isInteger(quantityValue))) {
    return fail(400, isBulk ? "Quantity must be at least 1." : "Serialized and kit items require a whole quantity of at least 1.");
  }
  const quantity = quantityValue;

  if (isBulk) {
    const update = await result.supabase.from("inventory_items").update({
      quantity_on_hand: Number(item.quantity_on_hand || 0) + quantity,
      quantity_available: Number(item.quantity_available || 0) + quantity,
      default_purchase_price: purchasePrice,
      updated_at: new Date().toISOString(),
    }).eq("id", itemId);
    if (update.error) return fail(400, update.error.message);
    const movement = await result.supabase.from("inventory_movements").insert({
      inventory_item_id: itemId, quantity, movement_type: "receive", status: "completed",
      to_location_id: locationId, unit_cost: purchasePrice,
      total_cost: Number((purchasePrice * quantity).toFixed(2)), notes: notes || "Received quantity stock.",
    });
    if (movement.error) return fail(400, movement.error.message);
    return NextResponse.json({ success: true, data: { itemId, received: quantity, unitCodes: [] } });
  }

  let codes: string[];
  try { codes = await nextUnitCodes(result.supabase, item, serialPrefix, quantity); }
  catch (error) { return fail(400, error instanceof Error ? error.message : "Could not create unit codes."); }
  const now = new Date().toISOString();
  const units = await result.supabase.from("inventory_units").insert(codes.map((code) => ({
    inventory_item_id: itemId, unit_code: code, serial_number: code, barcode: code,
    status: "available", warehouse_location_id: locationId, condition,
    purchase_price: purchasePrice, image_url: item.image_url || null, notes,
    deleted_at: null, updated_at: now,
  }))).select("id, unit_code, serial_number");
  if (units.error) return fail(400, units.error.message);
  const movements = (units.data || []).map((unit) => ({
    inventory_item_id: itemId, inventory_unit_id: unit.id, quantity: 1,
    movement_type: "receive", status: "completed", to_location_id: locationId,
    unit_cost: purchasePrice, total_cost: purchasePrice,
    notes: notes || `Received unit ${unit.serial_number || unit.unit_code || ""}`.trim(),
  }));
  if (movements.length) {
    const movement = await result.supabase.from("inventory_movements").insert(movements);
    if (movement.error) return fail(400, movement.error.message);
  }
  return NextResponse.json({ success: true, data: { itemId, received: quantity, unitCodes: codes } });
}

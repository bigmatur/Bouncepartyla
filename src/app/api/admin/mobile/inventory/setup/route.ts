import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

function fail(status: number, error: string) { return NextResponse.json({ success: false, error }, { status }); }
function slug(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }

async function context(request: Request) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { error: fail(401, "Unauthorized") };
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(); const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) return { error: fail(500, "Server Supabase configuration is missing.") };
  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const user = await supabase.auth.getUser(token); if (user.error || !user.data.user) return { error: fail(401, "Invalid or expired session.") };
  const access = await getUnifiedAccess(supabase);
  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("inventory.view")) return { error: fail(403, "Your account cannot access warehouse setup.") };
  return { supabase, access };
}

export async function GET(request: Request) {
  const result = await context(request); if ("error" in result) return result.error;
  const [categories, locations, items, units] = await Promise.all([
    result.supabase.from("inventory_categories").select("id, name, slug, parent_id, description, sort_order, active").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    result.supabase.from("warehouse_locations").select("id, name, slug, parent_id, location_type, description, sort_order, active").order("sort_order", { ascending: true }).order("name", { ascending: true }),
    result.supabase.from("inventory_items").select("id, category_id").is("deleted_at", null),
    result.supabase.from("inventory_units").select("id, warehouse_location_id").is("deleted_at", null),
  ]);
  if (categories.error) return fail(400, categories.error.message); if (locations.error) return fail(400, locations.error.message); if (items.error) return fail(400, items.error.message); if (units.error) return fail(400, units.error.message);
  const categoryCounts: Record<string, number> = {}; const locationCounts: Record<string, number> = {};
  for (const item of items.data || []) if (item.category_id) categoryCounts[item.category_id] = (categoryCounts[item.category_id] || 0) + 1;
  for (const unit of units.data || []) if (unit.warehouse_location_id) locationCounts[unit.warehouse_location_id] = (locationCounts[unit.warehouse_location_id] || 0) + 1;
  return NextResponse.json({ success: true, data: { categories: categories.data || [], locations: locations.data || [], categoryCounts, locationCounts } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  const result = await context(request); if ("error" in result) return result.error;
  if (!result.access.can("inventory.edit")) return fail(403, "Your role cannot edit warehouse setup.");
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return fail(400, "Invalid request body."); }
  const action = String(body.action || "").trim(); const kind = String(body.kind || "").trim();
  if (!['category', 'location'].includes(kind)) return fail(400, "Choose categories or locations.");
  const table = kind === "category" ? "inventory_categories" : "warehouse_locations";
  if (action === "toggle") {
    const id = String(body.id || "").trim(); if (!id) return fail(400, "Choose a record.");
    const updated = await result.supabase.from(table).update({ active: Boolean(body.active), updated_at: new Date().toISOString() }).eq("id", id);
    if (updated.error) return fail(400, updated.error.message); return NextResponse.json({ success: true });
  }
  if (action === "create") {
    const name = String(body.name || "").trim(); if (!name) return fail(400, `${kind === "category" ? "Category" : "Location"} name is required.`);
    const base = slug(name) || `${kind}-${Date.now()}`;
    const exists = await result.supabase.from(table).select("id").eq("slug", base).maybeSingle(); if (exists.error) return fail(400, exists.error.message);
    const uniqueSlug = exists.data ? `${base}-${Date.now()}` : base;
    const common = { name, slug: uniqueSlug, parent_id: String(body.parentId || "").trim() || null, description: String(body.description || "").trim() || null, sort_order: Number(body.sortOrder || 100), active: true };
    const payload = kind === "location" ? { ...common, location_type: String(body.locationType || "zone").trim() || "zone" } : common;
    const inserted = await result.supabase.from(table).insert(payload); if (inserted.error) return fail(400, inserted.error.message);
    return NextResponse.json({ success: true });
  }
  return fail(400, "Unknown setup action.");
}

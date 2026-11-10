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
    return { error: fail(403, "Your account cannot access damage reports.") };
  }

  return { supabase, access };
}

export async function GET(request: Request) {
  const result = await context(request);
  if ("error" in result) return result.error;

  const reportsResult = await result.supabase
    .from("damage_reports")
    .select(`
      id, title, severity, status, repair_cost, description, reported_at, resolved_at,
      inventory_items (id, name, sku),
      inventory_units (id, unit_code, serial_number, status),
      bookings (id, booking_number, event_date, customers (id, full_name))
    `)
    .order("reported_at", { ascending: false })
    .limit(150);

  if (reportsResult.error) return fail(400, reportsResult.error.message);
  return NextResponse.json(
    { success: true, data: { reports: reportsResult.data || [] } },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const result = await context(request);
  if ("error" in result) return result.error;
  if (!result.access.can("inventory.mark_damaged")) {
    return fail(403, "Your role cannot update damage reports.");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid request body.");
  }

  const reportId = String(body.reportId || "").trim();
  const status = String(body.status || "").trim();
  const unitStatus = String(body.unitStatus || "").trim() || null;
  const notes = String(body.notes || "").trim() || null;
  if (!reportId || !["open", "in_repair", "resolved", "closed"].includes(status)) {
    return fail(400, "Choose a valid damage report status.");
  }
  if (unitStatus && !["maintenance", "damaged", "available", "retired"].includes(unitStatus)) {
    return fail(400, "Choose a valid inventory unit status.");
  }

  const reportResult = await result.supabase
    .from("damage_reports")
    .select("id, inventory_item_id, inventory_unit_id, description")
    .eq("id", reportId)
    .single();
  if (reportResult.error) return fail(400, reportResult.error.message);

  const report = reportResult.data;
  const nextDescription = notes
    ? `${report.description || ""}\n\nUpdate: ${notes}`.trim()
    : report.description;
  const resolvedAt = ["resolved", "closed"].includes(status)
    ? new Date().toISOString()
    : null;

  const updateResult = await result.supabase
    .from("damage_reports")
    .update({
      status,
      description: nextDescription,
      resolved_at: resolvedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (updateResult.error) return fail(400, updateResult.error.message);

  if (report.inventory_unit_id && unitStatus) {
    const unitResult = await result.supabase
      .from("inventory_units")
      .update({
        status: unitStatus,
        condition: unitStatus === "available" ? "good" : unitStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", report.inventory_unit_id);
    if (unitResult.error) return fail(400, unitResult.error.message);
  }

  return NextResponse.json({ success: true });
}

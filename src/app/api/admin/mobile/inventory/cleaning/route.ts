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
    return { error: fail(403, "Your account cannot access the cleaning queue.") };
  }

  return { supabase, access };
}

export async function GET(request: Request) {
  const result = await context(request);
  if ("error" in result) return result.error;

  const tasksResult = await result.supabase
    .from("inventory_cleaning_tasks")
    .select(`
      id, status, quantity, notes, created_at, started_at, completed_at, problem_at,
      inventory_items (id, name, sku, inventory_categories (id, name)),
      inventory_units (id, unit_code),
      bookings (id, booking_number, event_date, customers (id, full_name))
    `)
    .in("status", ["waiting", "in_progress", "problem"])
    .order("created_at", { ascending: false })
    .limit(150);

  if (tasksResult.error) return fail(400, tasksResult.error.message);
  return NextResponse.json({ success: true, data: { tasks: tasksResult.data || [] } }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  const result = await context(request);
  if ("error" in result) return result.error;

  let body: { taskId?: unknown; action?: unknown; notes?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid request body.");
  }

  const taskId = String(body.taskId || "").trim();
  const action = String(body.action || "").trim();
  const notes = String(body.notes || "").trim() || null;
  if (!taskId || !["start", "complete", "problem"].includes(action)) {
    return fail(400, "Choose a valid cleaning task action.");
  }

  const requiredPermission = action === "problem" ? "inventory.mark_damaged" : "inventory.edit";
  if (!result.access.can(requiredPermission)) {
    return fail(403, "Your role cannot update this cleaning task.");
  }

  if (action === "start") {
    const timeResult = await result.supabase.rpc("start_my_staff_time", { p_source: "cleaning" });
    if (timeResult.error) return fail(400, timeResult.error.message);
  }

  const rpcName = action === "start"
    ? "start_inventory_cleaning_task"
    : action === "complete"
      ? "complete_inventory_cleaning_task"
      : "problem_inventory_cleaning_task";
  const args = action === "problem"
    ? { p_task_id: taskId, p_notes: notes }
    : { p_task_id: taskId };
  const updateResult = await result.supabase.rpc(rpcName, args);
  if (updateResult.error) return fail(400, updateResult.error.message);

  return NextResponse.json({ success: true, data: { task: updateResult.data } });
}

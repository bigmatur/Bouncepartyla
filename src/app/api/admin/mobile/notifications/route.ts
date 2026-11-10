import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

function errorResponse(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

async function getMobileStaffAccess(request: Request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return { error: errorResponse(401, "Unauthorized") };

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) {
    return { error: errorResponse(500, "Server Supabase configuration is missing.") };
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    return { error: errorResponse(401, "Invalid or expired session.") };
  }

  const access = await getUnifiedAccess(supabase);
  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("dashboard.view")) {
    return { error: errorResponse(403, "Your account cannot access notifications.") };
  }

  return { supabase, access };
}

export async function GET(request: Request) {
  const context = await getMobileStaffAccess(request);
  if ("error" in context) return context.error;

  const authUserId = String(context.access.user.id || "").trim();
  const result = await context.supabase
    .from("notification_deliveries")
    .select("id,event_code,subject,rendered_body,booking_id,status,created_at,delivered_at,read_at")
    .eq("auth_user_id", authUserId)
    .eq("channel", "in_app")
    .in("status", ["sent", "delivered"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) return errorResponse(400, result.error.message);

  const deliveries = result.data || [];
  return NextResponse.json({
    success: true,
    data: {
      unreadCount: deliveries.filter((delivery) => !delivery.read_at).length,
      deliveries,
    },
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  const context = await getMobileStaffAccess(request);
  if ("error" in context) return context.error;

  let body: { deliveryId?: unknown; markAll?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Invalid request body.");
  }

  const markAll = body.markAll === true;
  const deliveryId = String(body.deliveryId || "").trim();
  if (!markAll && !deliveryId) return errorResponse(400, "Choose a notification to mark as read.");

  const result = markAll
    ? await context.supabase.rpc("mark_all_my_notifications_read")
    : await context.supabase.rpc("mark_my_notification_read", { p_delivery_id: deliveryId });

  if (result.error) return errorResponse(400, result.error.message);
  return NextResponse.json({ success: true });
}

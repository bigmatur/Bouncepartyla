import { NextResponse } from "next/server";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const access = await getUnifiedAccess(supabase);
    const authUserId = String(access.user?.id || "").trim();

    if (!authUserId || !access.isActive || !isStaffRole(access.role)) {
      return NextResponse.json({ unreadCount: 0 }, { status: 401 });
    }

    const unreadResult = await supabase
      .from("notification_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("auth_user_id", authUserId)
      .eq("channel", "in_app")
      .in("status", ["sent", "delivered"])
      .is("read_at", null);

    if (unreadResult.error) throw unreadResult.error;

    return NextResponse.json(
      { unreadCount: Math.max(0, Number(unreadResult.count || 0)) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { unreadCount: 0 },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

import { NextResponse } from "next/server";

import { requireCustomerAccess } from "@/lib/auth/require-customer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, access } = await requireCustomerAccess();

    if (access.role !== "customer") {
      return NextResponse.json({ unreadCount: 0 });
    }

    const customerResult = await supabase
      .from("customers")
      .select("id")
      .eq("auth_user_id", access.user?.id || "")
      .limit(1)
      .maybeSingle();

    if (customerResult.error) {
      throw customerResult.error;
    }

    const customerId = String(customerResult.data?.id || "").trim();
    if (!customerId) {
      return NextResponse.json({ unreadCount: 0 });
    }

    const unreadResult = await supabase
      .from("notification_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("channel", "in_app")
      .in("status", ["sent", "delivered"])
      .is("read_at", null);

    if (unreadResult.error) {
      throw unreadResult.error;
    }

    return NextResponse.json({
      unreadCount: Math.max(0, Number(unreadResult.count || 0)),
    });
  } catch {
    return NextResponse.json({ unreadCount: 0 });
  }
}

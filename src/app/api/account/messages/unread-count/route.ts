import { NextResponse } from "next/server";

import { requireCustomerAccess } from "@/lib/auth/require-customer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

    if (canPreviewCustomer || access.role !== "customer") {
      return NextResponse.json({ unreadCount: 0 });
    }

    const unreadResult = await supabase.rpc("get_my_internal_unread_count");
    if (unreadResult.error) {
      throw unreadResult.error;
    }

    return NextResponse.json({
      unreadCount: Math.max(0, Number(unreadResult.data || 0)),
    });
  } catch {
    return NextResponse.json({ unreadCount: 0 });
  }
}

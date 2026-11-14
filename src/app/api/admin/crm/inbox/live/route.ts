import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { supabase } = await requireAdminPermission("customers.view");

  const result = await supabase.rpc("get_crm_inbox_live_state");

  if (result.error) {
    // Keep live refresh working during a staggered deploy where the web code
    // reaches production before migration 162. Once the function exists, the
    // compact RPC path above remains the normal path.
    const fallback = await supabase
      .from("crm_conversations")
      .select("id, last_message_at, unread_count, needs_reply, status")
      .order("id", { ascending: true })
      .limit(250);

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    const revision = (fallback.data || [])
      .map((conversation) =>
        [
          conversation.id,
          conversation.last_message_at || "",
          conversation.unread_count || 0,
          conversation.needs_reply ? "1" : "0",
          conversation.status || "",
        ].join(":"),
      )
      .join("|");
    const unreadCount = (fallback.data || []).reduce(
      (total, conversation) =>
        total + Math.max(0, Number(conversation.unread_count || 0)),
      0,
    );

    return NextResponse.json(
      { revision, unreadCount },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const state = Array.isArray(result.data) ? result.data[0] : result.data;
  const revision = String(state?.revision || "");
  const unreadCount = Math.max(0, Number(state?.unread_count || 0));

  return NextResponse.json(
    { revision, unreadCount },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

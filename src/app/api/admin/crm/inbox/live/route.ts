import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { supabase } = await requireAdminPermission("customers.view");

  const result = await supabase
    .from("crm_conversations")
    .select("id, last_message_at, unread_count, needs_reply, status")
    .order("id", { ascending: true })
    .limit(250);

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const revision = (result.data || [])
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
  const unreadCount = (result.data || []).reduce(
    (total, conversation) =>
      total + Math.max(0, Number(conversation.unread_count || 0)),
    0,
  );

  return NextResponse.json(
    { revision, unreadCount },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

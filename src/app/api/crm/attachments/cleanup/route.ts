import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  parseCrmAttachments,
  removeInternalCrmAttachmentsSafely,
} from "@/lib/communication/attachments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase } = await requireAdminPermission("customers.edit");

    const body = await request.json().catch(() => ({}));
    const conversationId = String(body?.conversationId || "").trim();
    const replyChannel = String(body?.replyChannel || "").trim().toLowerCase();
    const attachments = parseCrmAttachments(body?.attachments);

    if (!conversationId) {
      return NextResponse.json(
        { error: "Missing conversation id." },
        { status: 400 },
      );
    }

    if (replyChannel !== "internal" || attachments.length === 0) {
      return NextResponse.json({ success: true });
    }

    const conversationResult = await supabase
      .from("crm_conversations")
      .select("id, conversation_scope")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationResult.error) {
      throw new Error(conversationResult.error.message);
    }

    if (!conversationResult.data?.id) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    const scope = String(conversationResult.data.conversation_scope || "").trim().toLowerCase();

    if (scope !== "internal") {
      return NextResponse.json({ success: true });
    }

    await removeInternalCrmAttachmentsSafely({
      supabase,
      conversationId,
      attachments,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin internal attachment cleanup failed.", error);
    return NextResponse.json(
      {
        error: "Could not cleanup attachments.",
      },
      { status: 500 },
    );
  }
}

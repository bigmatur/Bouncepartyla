import { NextResponse } from "next/server";

import { requireCustomerAccess } from "@/lib/auth/require-customer";
import {
  parseCrmAttachments,
  removeInternalCrmAttachmentsSafely,
} from "@/lib/communication/attachments";

export const runtime = "nodejs";

function isInternalMessengerRpcMissing(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("could not find the function public.") &&
    text.includes("get_my_internal_conversation")
  );
}

export async function POST(request: Request) {
  try {
    const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

    if (canPreviewCustomer || access.role !== "customer") {
      return NextResponse.json(
        { error: "Messages are unavailable in preview mode." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const conversationId = String(body?.conversationId || "").trim();
    const attachments = parseCrmAttachments(body?.attachments);

    if (!conversationId) {
      return NextResponse.json(
        { error: "Missing conversation id." },
        { status: 400 },
      );
    }

    if (attachments.length === 0) {
      return NextResponse.json({ success: true });
    }

    const conversationResult = await supabase.rpc("get_my_internal_conversation");
    if (conversationResult.error) {
      if (isInternalMessengerRpcMissing(conversationResult.error.message)) {
        return NextResponse.json(
          {
            error:
              "Internal messaging is temporarily unavailable. Required database functions are missing from the API schema cache.",
          },
          { status: 503 },
        );
      }
      throw new Error(conversationResult.error.message);
    }

    const conversation = Array.isArray(conversationResult.data)
      ? conversationResult.data[0]
      : null;

    if (!conversation?.id || String(conversation.id) !== conversationId) {
      return NextResponse.json(
        { error: "Conversation ownership check failed." },
        { status: 403 },
      );
    }

    if (String(conversation.conversation_scope || "") !== "internal") {
      return NextResponse.json(
        { error: "Only internal conversations support this cleanup." },
        { status: 403 },
      );
    }

    await removeInternalCrmAttachmentsSafely({
      supabase,
      conversationId,
      attachments,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Customer internal attachment cleanup failed.", error);
    return NextResponse.json(
      {
        error: "Could not cleanup attachments.",
      },
      { status: 500 },
    );
  }
}

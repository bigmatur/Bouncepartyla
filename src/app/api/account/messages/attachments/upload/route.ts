import { NextResponse } from "next/server";

import { requireCustomerAccess } from "@/lib/auth/require-customer";
import {
  removeCrmAttachments,
  uploadCrmAttachment,
} from "@/lib/communication/attachments";
import { createServiceClient } from "@/lib/supabase/service";

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

    const formData = await request.formData();
    const conversationId = String(formData.get("conversationId") || "").trim();
    const file = formData.get("file");

    if (!conversationId) {
      return NextResponse.json(
        { error: "Missing conversation id." },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing attachment file." },
        { status: 400 },
      );
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
        { error: "Only internal conversations accept this upload." },
        { status: 403 },
      );
    }

    const attachment = await uploadCrmAttachment({
      conversationId,
      file,
    });

    const uploadNonce = crypto.randomUUID();
    const serviceSupabase = createServiceClient();

    const registerResult = await serviceSupabase.rpc(
      "register_internal_attachment_upload",
      {
        p_conversation_id: conversationId,
        p_storage_path: attachment.storagePath,
        p_uploaded_as: "customer",
        p_upload_nonce: uploadNonce,
        p_uploaded_by: access.user.id,
      },
    );

    if (registerResult.error) {
      await removeCrmAttachments({
        conversationId,
        attachments: [attachment],
      }).catch(() => undefined);
      throw new Error(registerResult.error.message);
    }

    return NextResponse.json({ success: true, attachment });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Attachment upload failed.",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  removeCrmAttachments,
  uploadCrmAttachment,
} from "@/lib/communication/attachments";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAdminPermission("customers.edit");

    const formData = await request.formData();
    const conversationId = String(
      formData.get("conversationId") || "",
    ).trim();
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

    const attachment = await uploadCrmAttachment({
      conversationId,
      file,
    });

    const scope = String(conversationResult.data.conversation_scope || "").trim();

    if (scope === "internal") {
      const uploadNonce = crypto.randomUUID();
      const serviceSupabase = createServiceClient();

      const registerResult = await serviceSupabase.rpc(
        "register_internal_attachment_upload",
        {
          p_conversation_id: conversationId,
          p_storage_path: attachment.storagePath,
          p_uploaded_as: "admin",
          p_upload_nonce: uploadNonce,
          p_uploaded_by: user.id,
        },
      );

      if (registerResult.error) {
        await removeCrmAttachments({
          conversationId,
          attachments: [attachment],
        }).catch(() => undefined);
        throw new Error(registerResult.error.message);
      }
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

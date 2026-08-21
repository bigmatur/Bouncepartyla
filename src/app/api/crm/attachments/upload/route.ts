import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { uploadCrmAttachment } from "@/lib/communication/attachments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdminPermission("customers.edit");

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

    const attachment = await uploadCrmAttachment({
      conversationId,
      file,
    });

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

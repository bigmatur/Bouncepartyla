import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type {
  CrmAttachment,
  CrmAttachmentWithUrl,
} from "@/lib/communication/types";

export const CRM_ATTACHMENT_BUCKET = "crm-attachments";
export const CRM_ATTACHMENT_MAX_FILES = 5;
export const CRM_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function safeFileName(value: string) {
  const clean = String(value || "file")
    .trim()
    .replace(/[^a-zA-Z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return clean || "file";
}

function isImageMimeType(mimeType: string) {
  return String(mimeType || "").toLowerCase().startsWith("image/");
}

function assertConversationStoragePath(
  conversationId: string,
  storagePath: string,
) {
  const prefix = `${conversationId}/`;

  if (!storagePath.startsWith(prefix)) {
    throw new Error(
      "Attachment does not belong to this CRM conversation.",
    );
  }
}

export function validateCrmAttachmentFile(file: File) {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("Choose a file to upload.");
  }

  if (file.size > CRM_ATTACHMENT_MAX_BYTES) {
    throw new Error(
      `${file.name || "Attachment"} is larger than 10 MB.`,
    );
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(
      `${file.name || "Attachment"} has an unsupported file type. Use JPG, PNG, WEBP, or PDF.`,
    );
  }
}

export async function uploadCrmAttachment(params: {
  conversationId: string;
  file: File;
}): Promise<CrmAttachment> {
  const conversationId = String(
    params.conversationId || "",
  ).trim();

  if (!conversationId) {
    throw new Error("Missing CRM conversation id.");
  }

  validateCrmAttachmentFile(params.file);

  const supabase = createServiceClient();
  const fileName = safeFileName(params.file.name);
  const now = new Date();

  const storagePath = [
    conversationId,
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${crypto.randomUUID()}-${fileName}`,
  ].join("/");

  const uploaded = await supabase.storage
    .from(CRM_ATTACHMENT_BUCKET)
    .upload(storagePath, params.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: params.file.type,
    });

  if (uploaded.error) {
    throw new Error(uploaded.error.message);
  }

  return {
    storagePath,
    name: params.file.name || fileName,
    mimeType: params.file.type,
    size: params.file.size,
    type: isImageMimeType(params.file.type)
      ? "image"
      : "file",
  };
}

export async function createCrmAttachmentSignedUrl(params: {
  conversationId: string;
  attachment: CrmAttachment;
  expiresInSeconds?: number;
}): Promise<CrmAttachmentWithUrl> {
  const conversationId = String(
    params.conversationId || "",
  ).trim();

  const storagePath = String(
    params.attachment.storagePath || "",
  ).trim();

  assertConversationStoragePath(
    conversationId,
    storagePath,
  );

  const supabase = createServiceClient();

  const signed = await supabase.storage
    .from(CRM_ATTACHMENT_BUCKET)
    .createSignedUrl(
      storagePath,
      Math.max(
        60,
        params.expiresInSeconds ||
          7 * 24 * 60 * 60,
      ),
    );

  if (
    signed.error ||
    !signed.data?.signedUrl
  ) {
    throw new Error(
      signed.error?.message ||
        "Could not create attachment link.",
    );
  }

  return {
    ...params.attachment,
    url: signed.data.signedUrl,
  };
}

export async function createCrmAttachmentSignedUrls(params: {
  conversationId: string;
  attachments: CrmAttachment[];
  expiresInSeconds?: number;
}) {
  return Promise.all(
    params.attachments.map((attachment) =>
      createCrmAttachmentSignedUrl({
        conversationId:
          params.conversationId,
        attachment,
        expiresInSeconds:
          params.expiresInSeconds,
      }),
    ),
  );
}

export async function downloadCrmAttachment(params: {
  conversationId: string;
  attachment: CrmAttachment;
}) {
  const storagePath = String(
    params.attachment.storagePath || "",
  ).trim();

  assertConversationStoragePath(
    params.conversationId,
    storagePath,
  );

  const supabase = createServiceClient();

  const result = await supabase.storage
    .from(CRM_ATTACHMENT_BUCKET)
    .download(storagePath);

  if (result.error || !result.data) {
    throw new Error(
      result.error?.message ||
        "Could not download CRM attachment.",
    );
  }

  const arrayBuffer =
    await result.data.arrayBuffer();

  return {
    attachment: params.attachment,
    content: Buffer.from(arrayBuffer),
  };
}

export async function removeCrmAttachments(params: {
  conversationId: string;
  attachments: CrmAttachment[];
}) {
  if (params.attachments.length === 0) {
    return;
  }

  for (const attachment of params.attachments) {
    assertConversationStoragePath(
      params.conversationId,
      attachment.storagePath,
    );
  }

  const supabase = createServiceClient();

  await supabase.storage
    .from(CRM_ATTACHMENT_BUCKET)
    .remove(
      params.attachments.map(
        (item) => item.storagePath,
      ),
    );
}

export function parseCrmAttachments(
  value: unknown,
): CrmAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: any): CrmAttachment => ({
      storagePath: String(
        item?.storagePath ||
          item?.storage_path ||
          "",
      ).trim(),

      name: String(
        item?.name || "Attachment",
      ).trim(),

      mimeType: String(
        item?.mimeType ||
          item?.mime_type ||
          "",
      ).trim(),

      size: Number(item?.size || 0),

      type:
        item?.type === "image"
          ? "image"
          : "file",
    }))
    .filter(
      (item) => Boolean(item.storagePath),
    );
}
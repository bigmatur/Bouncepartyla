import "server-only";

import { sendCrmInstagramReply } from "@/lib/crm/instagram";
import type {
  CrmAttachmentWithUrl,
  CrmOutboundMessageResult,
} from "@/lib/communication/types";

export async function sendCommunicationInstagram(params: {
  conversationId: string;
  body: string;
  attachments?: CrmAttachmentWithUrl[];
}): Promise<CrmOutboundMessageResult> {
  const result =
    await sendCrmInstagramReply(params);

  return {
    channel: "instagram",
    providerMessageId:
      result.messageId || null,
    simulated:
      Boolean(result.simulated),
    status:
      result.status || "sent",
  };
}

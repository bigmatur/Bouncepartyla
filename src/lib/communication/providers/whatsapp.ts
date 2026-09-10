import "server-only";

import { sendCrmWhatsAppReply } from "@/lib/crm/whatsapp";
import type {
  CrmAttachmentWithUrl,
  CrmOutboundMessageResult,
} from "@/lib/communication/types";

export async function sendCommunicationWhatsapp(params: {
  conversationId: string;
  body: string;
  attachments?: CrmAttachmentWithUrl[];
}): Promise<CrmOutboundMessageResult> {
  const result =
    await sendCrmWhatsAppReply(params);

  return {
    channel: "whatsapp",
    providerMessageId:
      result.messageId || null,
    status:
      result.status || "sent",
  };
}

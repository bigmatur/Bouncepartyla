import "server-only";

import { sendCrmEmailReply } from "@/lib/crm/gmail";
import type {
  CrmAttachment,
  CrmOutboundMessageResult,
} from "@/lib/communication/types";

export async function sendCommunicationEmail(params: {
  conversationId: string;
  body: string;
  attachments?: CrmAttachment[];
}): Promise<CrmOutboundMessageResult> {
  const result = await sendCrmEmailReply(params);

  return {
    channel: "email",
    providerMessageId:
      result.messageId || null,
    recipient:
      result.recipient || null,
    status: "sent",
  };
}

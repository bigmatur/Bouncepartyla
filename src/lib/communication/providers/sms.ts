import "server-only";

import { sendCrmSmsReply } from "@/lib/crm/sms";
import type {
  CrmAttachmentWithUrl,
  CrmOutboundMessageResult,
} from "@/lib/communication/types";

export async function sendCommunicationSms(params: {
  conversationId: string;
  body: string;
  attachments?: CrmAttachmentWithUrl[];
}): Promise<CrmOutboundMessageResult> {
  const result = await sendCrmSmsReply(params);

  return {
    channel: "sms",
    providerMessageId:
      result.messageSid || null,
    status:
      result.status || "queued",
  };
}

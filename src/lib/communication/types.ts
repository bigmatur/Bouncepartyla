export type CrmCommunicationChannel = "email" | "sms" | "instagram";

export type CrmAttachment = {
  storagePath: string;
  name: string;
  mimeType: string;
  size: number;
  type: "image" | "file";
};

export type CrmAttachmentWithUrl = CrmAttachment & {
  url: string;
};

export type CrmOutboundMessageResult = {
  channel: CrmCommunicationChannel;
  providerMessageId?: string | null;
  simulated?: boolean;
  recipient?: string | null;
  status?: string | null;
};

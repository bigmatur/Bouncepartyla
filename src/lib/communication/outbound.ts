import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import {
  createCrmAttachmentSignedUrls,
} from "@/lib/communication/attachments";
import { sendCommunicationEmail } from "@/lib/communication/providers/email";
import { sendCommunicationSms } from "@/lib/communication/providers/sms";
import { sendCommunicationInstagram } from "@/lib/communication/providers/instagram";
import { sendCommunicationWhatsapp } from "@/lib/communication/providers/whatsapp";
import type {
  CrmAttachment,
  CrmAttachmentWithUrl,
  CrmCommunicationChannel,
  CrmOutboundMessageResult,
} from "@/lib/communication/types";

const SUPPORTED_CHANNELS =
  new Set<CrmCommunicationChannel>([
    "email",
    "sms",
    "instagram",
    "whatsapp",
  ]);

function asSupportedChannel(
  value: unknown,
): CrmCommunicationChannel | null {
  const channel = String(value || "")
    .trim()
    .toLowerCase() as CrmCommunicationChannel;

  return SUPPORTED_CHANNELS.has(channel)
    ? channel
    : null;
}

export async function resolveCrmReplyChannel(
  conversationId: string,
): Promise<CrmCommunicationChannel> {
  const supabase = createServiceClient();

  const conversation = await supabase
    .from("crm_conversations")
    .select("last_channel")
    .eq("id", conversationId)
    .single();

  if (conversation.error) {
    throw new Error(
      conversation.error.message,
    );
  }

  const configuredLastChannel =
    asSupportedChannel(
      conversation.data?.last_channel,
    );

  if (configuredLastChannel) {
    return configuredLastChannel;
  }

  const lastInbound = await supabase
    .from("crm_messages")
    .select("channel")
    .eq(
      "conversation_id",
      conversationId,
    )
    .eq("direction", "inbound")
    .order("sent_at", {
      ascending: false,
      nullsFirst: false,
    })
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (lastInbound.error) {
    throw new Error(
      lastInbound.error.message,
    );
  }

  const inboundChannel =
    asSupportedChannel(
      lastInbound.data?.channel,
    );

  return inboundChannel || "email";
}

function linkOnlyAttachments(
  attachments: CrmAttachmentWithUrl[],
) {
  return attachments.filter(
    (item) => item.type !== "image",
  );
}

function appendFallbackLinks(
  body: string,
  attachments: CrmAttachmentWithUrl[],
) {
  if (attachments.length === 0) {
    return body;
  }

  const lines = attachments.map(
    (item) => `${item.name}: ${item.url}`,
  );

  return [
    body,
    body ? "" : null,
    "Attachments:",
    ...lines,
  ]
    .filter(
      (value) => value !== null,
    )
    .join("\n")
    .trim();
}

async function attachMetadataToOutboundMessage(
  params: {
    conversationId: string;
    channel: CrmCommunicationChannel;
    result: CrmOutboundMessageResult;
    originalBody: string;
    attachments: CrmAttachment[];
  },
) {
  if (
    params.attachments.length === 0
  ) {
    return;
  }

  const supabase = createServiceClient();

  let query = supabase
    .from("crm_messages")
    .select("id, metadata")
    .eq(
      "conversation_id",
      params.conversationId,
    )
    .eq("direction", "outbound")
    .eq("channel", params.channel);

  if (
    params.result.providerMessageId
  ) {
    query = query.eq(
      "provider_message_id",
      params.result.providerMessageId,
    );
  }

  const message = await query
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (message.error) {
    throw new Error(
      message.error.message,
    );
  }

  if (!message.data?.id) {
    throw new Error(
      "Outbound CRM message was sent but could not be linked to its attachments.",
    );
  }

  const metadata =
    message.data.metadata &&
    typeof message.data.metadata ===
      "object"
      ? (message.data
          .metadata as Record<
          string,
          unknown
        >)
      : {};

  const updated = await supabase
    .from("crm_messages")
    .update({
      body_text: params.originalBody,
      metadata: {
        ...metadata,
        attachments:
          params.attachments,
      },
    })
    .eq("id", message.data.id);

  if (updated.error) {
    throw new Error(
      updated.error.message,
    );
  }
}

export async function sendCrmConversationReply(
  params: {
    conversationId: string;
    body: string;
    channel?: CrmCommunicationChannel;
    attachments?: CrmAttachment[];
  },
): Promise<CrmOutboundMessageResult> {
  const conversationId = String(
    params.conversationId || "",
  ).trim();

  const body = String(
    params.body || "",
  ).trim();

  const attachments =
    params.attachments || [];

  if (!conversationId) {
    throw new Error(
      "Missing conversation id.",
    );
  }

  if (
    !body &&
    attachments.length === 0
  ) {
    throw new Error(
      "Reply cannot be empty.",
    );
  }

  const channel =
    params.channel ||
    (await resolveCrmReplyChannel(
      conversationId,
    ));

  const signedAttachments =
    attachments.length > 0
      ? await createCrmAttachmentSignedUrls(
          {
            conversationId,
            attachments,
            expiresInSeconds:
              7 * 24 * 60 * 60,
          },
        )
      : [];

  let result: CrmOutboundMessageResult;

  if (channel === "email") {
    result =
      await sendCommunicationEmail({
        conversationId,
        body,
        attachments,
      });
  } else if (channel === "sms") {
    const pdfLinks =
      linkOnlyAttachments(
        signedAttachments,
      );

    result =
      await sendCommunicationSms({
        conversationId,
        body: appendFallbackLinks(
          body,
          pdfLinks,
        ),
        attachments:
          signedAttachments.filter(
            (item) =>
              item.type === "image",
          ),
      });
  } else if (
    channel === "instagram"
  ) {
    const unsupported =
      linkOnlyAttachments(
        signedAttachments,
      );

    result =
      await sendCommunicationInstagram({
        conversationId,
        body: appendFallbackLinks(
          body,
          unsupported,
        ),
        attachments:
          signedAttachments.filter(
            (item) =>
              item.type === "image",
          ),
      });
  } else if (
    channel === "whatsapp"
  ) {
    const unsupported =
      linkOnlyAttachments(
        signedAttachments,
      );

    result =
      await sendCommunicationWhatsapp({
        conversationId,
        body: appendFallbackLinks(
          body,
          unsupported,
        ),
        attachments:
          signedAttachments.filter(
            (item) =>
              item.type === "image",
          ),
      });
  } else {
    const exhaustiveCheck: never =
      channel;

    throw new Error(
      `Unsupported communication channel: ${String(
        exhaustiveCheck,
      )}`,
    );
  }

  await attachMetadataToOutboundMessage(
    {
      conversationId,
      channel,
      result,
      originalBody: body,
      attachments,
    },
  );

  return result;
}

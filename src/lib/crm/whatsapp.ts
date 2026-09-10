import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { ingestCrmInboundMessage } from "@/lib/communication/inbound";
import { resolveIntegrationConnection } from "@/lib/integrations/connections";
import { normalizeCrmPhone } from "@/lib/crm/sms";
import type { CrmAttachmentWithUrl } from "@/lib/communication/types";

function stringValue(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function safeMetadataObject(
  value: unknown,
  maxSerializedLength = 20000,
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  try {
    const serialized = JSON.stringify(value);

    if (
      !serialized ||
      serialized.length > maxSerializedLength
    ) {
      return null;
    }

    const parsed = JSON.parse(serialized);

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toMetaPhone(value: string) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.length === 10) {
    return `1${digits}`;
  }

  return digits;
}

function fromMetaPhone(value: string) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) {
    return raw;
  }

  return raw.startsWith("+")
    ? `+${digits}`
    : `+${digits}`;
}

function normalizeMessageStatus(value: string) {
  const status = String(value || "").trim().toLowerCase();

  if (!status) {
    return null;
  }

  if (status === "sent") return "sent";
  if (status === "delivered") return "delivered";
  if (status === "read") return "read";
  if (status === "failed") return "failed";
  if (status === "undelivered") return "failed";

  return null;
}

function successStatusRank(value: string | null) {
  if (value === "sent") return 1;
  if (value === "delivered") return 2;
  if (value === "read") return 3;
  return 0;
}

function successStatusFromRank(rank: number) {
  if (rank >= 3) return "read";
  if (rank === 2) return "delivered";
  if (rank === 1) return "sent";
  return null;
}

export async function getResolvedWhatsAppIntegration() {
  const integration = await resolveIntegrationConnection("whatsapp");
  const publicConfig = integration.publicConfig as Record<string, any>;
  const credentials = integration.credentials as Record<string, string>;

  const graphVersion =
    stringValue(publicConfig.graph_version) ||
    "v24.0";

  const phoneNumberId = stringValue(
    publicConfig.phone_number_id,
  );

  const businessAccountId = stringValue(
    publicConfig.business_account_id,
  );

  const accessToken = stringValue(
    credentials.access_token,
  );

  const appSecret = stringValue(
    credentials.app_secret,
  );

  const verifyToken = stringValue(
    credentials.verify_token,
  );

  return {
    source: integration.source,
    graphVersion,
    phoneNumberId,
    businessAccountId,
    accessToken,
    appSecret,
    verifyToken,
    inboundConfigured: Boolean(appSecret && verifyToken),
    outboundConfigured: Boolean(accessToken && phoneNumberId),
  };
}

function getInboundBody(message: any) {
  const type = stringValue(message?.type) || "message";
  const text = stringValue(message?.text?.body);

  if (text) {
    return text;
  }

  if (type === "image") {
    const caption = stringValue(message?.image?.caption);
    return caption || "(WhatsApp image message)";
  }

  if (type === "document") {
    const caption = stringValue(message?.document?.caption);
    return caption || "(WhatsApp document message)";
  }

  return `(WhatsApp ${type} message)`;
}

export async function ingestCrmWhatsAppInbound(params: {
  providerMessageId: string;
  senderPhone: string;
  recipientPhone?: string;
  threadId?: string | null;
  senderName?: string;
  body?: string;
  sentAt?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const providerMessageId = stringValue(
    params.providerMessageId,
  );

  const senderPhone = stringValue(
    params.senderPhone,
  );

  if (!providerMessageId || !senderPhone) {
    throw new Error(
      "WhatsApp inbound message is missing providerMessageId or senderPhone.",
    );
  }

  const normalizedPhone = normalizeCrmPhone(
    senderPhone,
  );

  if (!normalizedPhone) {
    throw new Error(
      "WhatsApp inbound message sender phone is invalid.",
    );
  }

  const senderName = stringValue(params.senderName);

  return ingestCrmInboundMessage({
    channel: "whatsapp",
    identityType: "phone",
    identityValue: senderPhone,
    normalizedIdentity: normalizedPhone,
    displayIdentity: senderPhone,
    senderDisplayName:
      senderName || `WhatsApp ${senderPhone}`,
    recipientIdentity:
      stringValue(params.recipientPhone) ||
      null,
    providerMessageId,
    providerThreadId:
      stringValue(params.threadId) ||
      senderPhone,
    subject: `WhatsApp ${senderPhone}`,
    bodyText:
      stringValue(params.body) ||
      "(WhatsApp message)",
    sentAt:
      stringValue(params.sentAt) || null,
    metadata: {
      ...(params.metadata || {}),
    },
  });
}

async function resolveWhatsappRecipient(
  conversationId: string,
) {
  const supabase = createServiceClient();

  const conversation = await supabase
    .from("crm_conversations")
    .select("id, customer_id, lead_id")
    .eq("id", conversationId)
    .single();

  if (conversation.error) {
    throw new Error(conversation.error.message);
  }

  const lastInbound = await supabase
    .from("crm_messages")
    .select("sender_identity")
    .eq("conversation_id", conversationId)
    .eq("channel", "whatsapp")
    .eq("direction", "inbound")
    .order("sent_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(1)
    .maybeSingle();

  if (lastInbound.error) {
    throw new Error(lastInbound.error.message);
  }

  let recipient = stringValue(
    lastInbound.data?.sender_identity,
  );

  if (!recipient && conversation.data.customer_id) {
    const customer = await supabase
      .from("customers")
      .select("phone")
      .eq("id", conversation.data.customer_id)
      .single();

    if (customer.error) {
      throw new Error(customer.error.message);
    }

    recipient = stringValue(customer.data?.phone);
  }

  if (!recipient && conversation.data.lead_id) {
    const lead = await supabase
      .from("booking_leads")
      .select("customer_phone")
      .eq("id", conversation.data.lead_id)
      .single();

    if (lead.error) {
      throw new Error(lead.error.message);
    }

    recipient = stringValue(lead.data?.customer_phone);
  }

  if (!recipient) {
    throw new Error(
      "No phone number is linked to this conversation.",
    );
  }

  const metaPhone = toMetaPhone(recipient);

  if (!metaPhone) {
    throw new Error(
      "WhatsApp recipient phone could not be normalized.",
    );
  }

  return {
    recipientPhone: metaPhone,
    recipientDisplay: fromMetaPhone(recipient),
  };
}

async function sendWhatsappMessage(params: {
  endpoint: string;
  accessToken: string;
  recipientPhone: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(params.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: params.recipientPhone,
      ...params.body,
    }),
    cache: "no-store",
  });

  const payload =
    (await response
      .json()
      .catch(() => ({}))) as Record<string, any>;

  if (!response.ok) {
    throw new Error(
      stringValue(payload?.error?.message) ||
        `WhatsApp API error ${response.status}`,
    );
  }

  const providerMessageId = stringValue(
    payload?.messages?.[0]?.id,
  );

  return {
    providerMessageId,
    rawStatus: stringValue(
      payload?.messages?.[0]?.message_status,
    ),
  };
}

export async function sendCrmWhatsAppReply(params: {
  conversationId: string;
  body: string;
  attachments?: CrmAttachmentWithUrl[];
}) {
  const conversationId = stringValue(
    params.conversationId,
  );

  const body = stringValue(params.body);
  const attachments = params.attachments || [];

  if (!conversationId) {
    throw new Error(
      "WhatsApp conversation id is missing.",
    );
  }

  if (!body && attachments.length === 0) {
    throw new Error("Reply cannot be empty.");
  }

  const config =
    await getResolvedWhatsAppIntegration();

  if (!config.outboundConfigured) {
    throw new Error(
      "WhatsApp outbound transport is not configured.",
    );
  }

  const supabase = createServiceClient();
  const recipient =
    await resolveWhatsappRecipient(conversationId);

  const endpoint =
    `https://graph.facebook.com/${config.graphVersion}/` +
    `${encodeURIComponent(config.phoneNumberId)}/messages`;

  const fallbackProviderMessageId =
    `wa_out_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  const providerMessageIds: string[] = [];

  let status = "sent";

  if (body) {
    const textResult =
      await sendWhatsappMessage({
        endpoint,
        accessToken: config.accessToken,
        recipientPhone: recipient.recipientPhone,
        body: {
          type: "text",
          text: {
            body,
            preview_url: false,
          },
        },
      });

    if (textResult.providerMessageId) {
      providerMessageIds.push(textResult.providerMessageId);
    }

    status =
      normalizeMessageStatus(textResult.rawStatus) ||
      status;
  }

  for (const attachment of attachments) {
    if (
      attachment.type !== "image" ||
      !attachment.url
    ) {
      continue;
    }

    const mediaResult = await sendWhatsappMessage({
      endpoint,
      accessToken: config.accessToken,
      recipientPhone: recipient.recipientPhone,
      body: {
        type: "image",
        image: {
          link: attachment.url,
        },
      },
    });

    if (mediaResult.providerMessageId) {
      providerMessageIds.push(mediaResult.providerMessageId);
    }

    status =
      normalizeMessageStatus(mediaResult.rawStatus) ||
      status;
  }

  const uniqueProviderMessageIds = Array.from(
    new Set(providerMessageIds.filter(Boolean)),
  );

  const primaryProviderMessageId =
    uniqueProviderMessageIds[0] ||
    fallbackProviderMessageId;

  const now = new Date().toISOString();

  const inserted = await supabase
    .from("crm_messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      channel: "whatsapp",
      sender_identity:
        config.businessAccountId ||
        config.phoneNumberId,
      recipient_identity:
        recipient.recipientDisplay,
      body_text: body,
      provider_message_id:
        primaryProviderMessageId,
      provider_thread_id:
        recipient.recipientPhone,
      status,
      sent_at: now,
      metadata: {
        phone_number_id:
          config.phoneNumberId,
        business_account_id:
          config.businessAccountId || null,
        native_media_count:
          attachments.length,
        whatsapp_primary_provider_message_id:
          primaryProviderMessageId,
        whatsapp_provider_message_ids:
          uniqueProviderMessageIds.length > 0
            ? uniqueProviderMessageIds
            : [primaryProviderMessageId],
      },
    });

  if (inserted.error) {
    throw new Error(inserted.error.message);
  }

  const updated = await supabase
    .from("crm_conversations")
    .update({
      status: "open",
      needs_reply: false,
      last_channel: "whatsapp",
      last_message_at: now,
      last_outbound_at: now,
      updated_at: now,
    })
    .eq("id", conversationId);

  if (updated.error) {
    throw new Error(updated.error.message);
  }

  return {
    messageId: primaryProviderMessageId,
    status,
  };
}

async function findWhatsappMessageByProviderMessageId(params: {
  providerMessageId: string;
}) {
  const providerMessageId = stringValue(
    params.providerMessageId,
  );

  if (!providerMessageId) {
    return null;
  }

  const supabase = createServiceClient();

  const direct = await supabase
    .from("crm_messages")
    .select("id, metadata")
    .eq("channel", "whatsapp")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (direct.error) {
    throw new Error(direct.error.message);
  }

  if (direct.data?.id) {
    return direct.data;
  }

  const mapped = await supabase
    .from("crm_messages")
    .select("id, metadata")
    .eq("channel", "whatsapp")
    .contains("metadata", {
      whatsapp_provider_message_ids: [providerMessageId],
    })
    .limit(2);

  if (mapped.error) {
    throw new Error(mapped.error.message);
  }

  if ((mapped.data || []).length === 0) {
    return null;
  }

  if ((mapped.data || []).length > 1) {
    throw new Error(
      "WhatsApp status callback provider message id matched multiple CRM messages.",
    );
  }

  return mapped.data?.[0] || null;
}

export async function updateCrmWhatsAppDeliveryStatus(params: {
  providerMessageId: string;
  messageStatus: string;
  metadata?: Record<string, unknown>;
}) {
  const providerMessageId = stringValue(
    params.providerMessageId,
  );

  const normalizedStatus = normalizeMessageStatus(
    params.messageStatus,
  );

  if (!providerMessageId || !normalizedStatus) {
    return {
      updated: false,
      ignored: true,
    };
  }

  const message = await findWhatsappMessageByProviderMessageId({
    providerMessageId,
  });

  if (!message?.id) {
    console.warn(
      "WhatsApp status callback ignored: unknown provider message id",
      {
        providerMessageId,
      },
    );

    return {
      updated: false,
      ignored: true,
    };
  }

  const supabase = createServiceClient();
  const current = await supabase
    .from("crm_messages")
    .select("id, status, sent_at, delivered_at, read_at, failed_at, metadata")
    .eq("id", message.id)
    .maybeSingle();

  if (current.error) {
    throw new Error(current.error.message);
  }

  if (!current.data?.id) {
    return {
      updated: false,
      ignored: true,
    };
  }

  const currentStatus = stringValue(current.data.status || "") || null;
  const currentSuccessRank = successStatusRank(currentStatus);
  const incomingSuccessRank = successStatusRank(normalizedStatus);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};

  if (incomingSuccessRank > 0) {
    const nextRank = Math.max(currentSuccessRank, incomingSuccessRank);
    const nextStatus = successStatusFromRank(nextRank);

    if (nextStatus && nextStatus !== currentStatus) {
      patch.status = nextStatus;
    }

    if (normalizedStatus === "delivered" && !current.data.delivered_at) {
      patch.delivered_at = now;
    }

    if (normalizedStatus === "read") {
      if (!current.data.delivered_at) {
        patch.delivered_at = now;
      }

      if (!current.data.read_at) {
        patch.read_at = now;
      }
    }
  } else if (normalizedStatus === "failed") {
    if (!current.data.failed_at) {
      patch.failed_at = now;
    }

    const hasDeliveredSuccess = currentSuccessRank >= 2;

    if (!hasDeliveredSuccess && currentStatus !== "failed") {
      patch.status = "failed";
    }
  }

  let latestMetadata: unknown = current.data.metadata;

  if (Object.keys(patch).length > 0) {
    const updateResult = await supabase
      .from("crm_messages")
      .update(patch)
      .eq("id", current.data.id)
      .select("id, metadata")
      .maybeSingle();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    latestMetadata =
      updateResult.data?.metadata ??
      latestMetadata;
  }

  if (params.metadata) {
    const metadataSource =
      latestMetadata || {};

    const metadata = {
      ...(metadataSource as Record<string, unknown>),
      whatsapp_status:
        normalizedStatus,
      whatsapp_status_provider_message_id:
        providerMessageId,
      whatsapp_status_metadata:
        safeMetadataObject(params.metadata) ||
        null,
    };

    const metadataUpdate = await supabase
      .from("crm_messages")
      .update({ metadata })
      .eq("id", current.data.id);

    if (metadataUpdate.error) {
      throw new Error(metadataUpdate.error.message);
    }
  }

  const responseStatus =
    stringValue(
      String(
        patch.status ||
          currentStatus ||
          normalizedStatus,
      ),
    ) || normalizedStatus;

  return {
    updated: true,
    ignored: false,
    status: responseStatus,
  };
}

export function extractWhatsAppWebhookEvents(
  payload: any,
) {
  const inboundEvents: Array<{
    providerMessageId: string;
    senderPhone: string;
    recipientPhone?: string;
    threadId?: string | null;
    senderName?: string;
    body: string;
    sentAt?: string | null;
    metadata: Record<string, unknown>;
  }> = [];

  const statusEvents: Array<{
    providerMessageId: string;
    messageStatus: string;
    metadata: Record<string, unknown>;
  }> = [];

  const entries = Array.isArray(payload?.entry)
    ? payload.entry
    : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes)
      ? entry.changes
      : [];

    for (const change of changes) {
      const value = change?.value;

      if (!value || typeof value !== "object") {
        continue;
      }

      const metadata =
        safeMetadataObject(value.metadata) ||
        null;

      const displayPhone = stringValue(
        metadata?.display_phone_number,
      );

      const phoneNumberId = stringValue(
        metadata?.phone_number_id,
      );

      const contacts = Array.isArray(value.contacts)
        ? value.contacts
        : [];

      const messages = Array.isArray(value.messages)
        ? value.messages
        : [];

      for (const message of messages) {
        const providerMessageId = stringValue(
          message?.id,
        );

        const from = stringValue(message?.from);

        if (!providerMessageId || !from) {
          continue;
        }

        const contact = contacts.find(
          (item: any) =>
            stringValue(item?.wa_id) === from,
        );

        const senderName = stringValue(
          contact?.profile?.name,
        );

        const body = getInboundBody(message);

        const epochSeconds = Number(message?.timestamp);

        inboundEvents.push({
          providerMessageId,
          senderPhone: fromMetaPhone(from),
          recipientPhone: displayPhone || phoneNumberId || undefined,
          threadId: from,
          senderName,
          body,
          sentAt: Number.isFinite(epochSeconds)
            ? new Date(epochSeconds * 1000).toISOString()
            : null,
          metadata: {
            source: "meta_webhook",
            object: payload?.object || null,
            entry_id: entry?.id || null,
            field: stringValue(change?.field) || null,
            phone_number_id: phoneNumberId || null,
            contact: safeMetadataObject(contact),
            message: safeMetadataObject(message),
          },
        });
      }

      const statuses = Array.isArray(value.statuses)
        ? value.statuses
        : [];

      for (const status of statuses) {
        const providerMessageId = stringValue(
          status?.id,
        );

        const messageStatus = stringValue(
          status?.status,
        );

        if (!providerMessageId || !messageStatus) {
          continue;
        }

        statusEvents.push({
          providerMessageId,
          messageStatus,
          metadata: {
            source: "meta_webhook",
            object: payload?.object || null,
            entry_id: entry?.id || null,
            field: stringValue(change?.field) || null,
            phone_number_id: phoneNumberId || null,
            status: safeMetadataObject(status),
          },
        });
      }
    }
  }

  return {
    inboundEvents,
    statusEvents,
  };
}

import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import {
  ingestCrmInboundMessage,
  ingestCrmOutboundMessage,
} from "@/lib/communication/inbound";
import { resolveIntegrationConnection } from "@/lib/integrations/connections";
import type {
  CrmAttachmentWithUrl,
} from "@/lib/communication/types";

function env(name: string) {
  return String(
    process.env[name] || "",
  ).trim();
}

function boolEnv(name: string) {
  return (
    env(name).toLowerCase() ===
    "true"
  );
}

function normalizeInstagramIdentity(
  value: string,
) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

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

function successStatusRank(status: string | null | undefined) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  if (normalized === "sent") return 1;
  if (normalized === "delivered") return 2;
  if (normalized === "read") return 3;

  return 0;
}

function successStatusFromRank(rank: number) {
  if (rank >= 3) return "read";
  if (rank >= 2) return "delivered";
  if (rank >= 1) return "sent";
  return null;
}

function parseMetaTimestamp(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const rawNumber =
    typeof value === "number"
      ? value
      : Number(String(value).trim());

  if (!Number.isFinite(rawNumber)) {
    const asDate = new Date(String(value));

    return Number.isNaN(asDate.getTime())
      ? ""
      : asDate.toISOString();
  }

  const ms =
    rawNumber > 1_000_000_000_000
      ? rawNumber
      : rawNumber * 1000;

  const date = new Date(ms);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toISOString();
}

export function getCrmInstagramConfiguration() {
  const accessToken = env(
    "META_INSTAGRAM_ACCESS_TOKEN",
  );

  const appSecret = env(
    "META_APP_SECRET",
  );

  const verifyToken = env(
    "META_INSTAGRAM_VERIFY_TOKEN",
  );

  const instagramUserId = env(
    "META_INSTAGRAM_USER_ID",
  );

  const graphVersion =
    env("META_GRAPH_VERSION") ||
    "v24.0";

  const simulatorEnabled =
    boolEnv(
      "CRM_INSTAGRAM_SIMULATOR_ENABLED",
    );

  return {
    accessToken,
    appSecret,
    verifyToken,
    instagramUserId,
    graphVersion,
    simulatorEnabled,
    inboundConfigured: Boolean(
      appSecret && verifyToken,
    ),
    outboundConfigured: Boolean(
      accessToken &&
        instagramUserId,
    ),
  };
}

export async function getResolvedMetaIntegration() {
  const integration = await resolveIntegrationConnection("instagram");
  const publicConfig = integration.publicConfig as Record<string, any>;
  const credentials = integration.credentials as Record<string, string>;
  const graphVersion = String(publicConfig.graph_version || "v24.0").trim() || "v24.0";
  const instagramUserId = String(
    publicConfig.instagram_business_account_id || credentials.instagram_user_id || "",
  ).trim();
  const accessToken = String(credentials.access_token || "").trim();
  const appSecret = String(credentials.app_secret || "").trim();
  const verifyToken = String(credentials.verify_token || "").trim();

  return {
    source: integration.source,
    accessToken,
    appSecret,
    verifyToken,
    instagramUserId,
    graphVersion,
    pageId: String(publicConfig.page_id || "").trim(),
    adAccountId: String(publicConfig.ad_account_id || "").trim(),
    simulatorEnabled: Boolean(publicConfig.simulator_enabled),
    inboundConfigured: Boolean(appSecret && verifyToken),
    outboundConfigured: Boolean(accessToken && instagramUserId),
  };
}

export async function ingestCrmInstagramInbound(
  params: {
    providerMessageId: string;
    senderId: string;
    username?: string;
    recipientId?: string;
    body?: string;
    metadata?: Record<
      string,
      unknown
    >;
  },
) {
  const providerMessageId =
    String(
      params.providerMessageId ||
        "",
    ).trim();

  const senderId = String(
    params.senderId || "",
  ).trim();

  const username = String(
    params.username || "",
  ).trim();

  if (
    !providerMessageId ||
    !senderId
  ) {
    throw new Error(
      "Instagram inbound message is missing providerMessageId or senderId.",
    );
  }

  const normalizedIdentity =
    normalizeInstagramIdentity(
      username || senderId,
    );

  return ingestCrmInboundMessage({
    channel: "instagram",
    identityType: "instagram",
    identityValue: senderId,
    normalizedIdentity,
    displayIdentity: username
      ? `@${normalizeInstagramIdentity(
          username,
        )}`
      : senderId,
    senderDisplayName: username
      ? `@${normalizeInstagramIdentity(
          username,
        )}`
      : `Instagram ${senderId}`,
    recipientIdentity:
      params.recipientId || null,
    providerMessageId,
    providerThreadId: senderId,
    subject: username
      ? `Instagram @${normalizeInstagramIdentity(
          username,
        )}`
      : "Instagram conversation",
    bodyText:
      String(params.body || "")
        .trim() ||
      "(Instagram media message)",
    metadata: {
      username:
        username || null,
      ...(params.metadata || {}),
    },
  });
}

export async function ingestCrmInstagramNativeOutbound(
  params: {
    providerMessageId: string;
    recipientId: string;
    username?: string;
    senderId?: string;
    body?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const recipientId = String(params.recipientId || "").trim();
  const providerMessageId = String(params.providerMessageId || "").trim();
  const username = String(params.username || "").trim();

  if (!providerMessageId || !recipientId) {
    throw new Error("Instagram native outbound message is missing providerMessageId or recipientId.");
  }

  return ingestCrmOutboundMessage({
    channel: "instagram",
    identityType: "instagram",
    identityValue: recipientId,
    normalizedIdentity: normalizeInstagramIdentity(username || recipientId),
    displayIdentity: username ? `@${normalizeInstagramIdentity(username)}` : recipientId,
    senderDisplayName: username ? `@${normalizeInstagramIdentity(username)}` : `Instagram ${recipientId}`,
    messageSenderIdentity: String(params.senderId || "").trim() || null,
    messageRecipientIdentity: recipientId,
    providerMessageId,
    providerThreadId: recipientId,
    subject: username ? `Instagram @${normalizeInstagramIdentity(username)}` : "Instagram conversation",
    bodyText: String(params.body || "").trim() || "(Instagram media message)",
    metadata: {
      source: "meta_webhook",
      native_instagram_outbound: true,
      username: username || null,
      ...(params.metadata || {}),
    },
  });
}

export async function simulateCrmInstagramInbound(
  params: {
    senderId: string;
    username: string;
    body: string;
  },
) {
  const config =
    await getResolvedMetaIntegration();

  if (
    !config.simulatorEnabled
  ) {
    throw new Error(
      "Instagram simulator is disabled.",
    );
  }

  const username = String(
    params.username || "",
  ).trim();

  const body = String(
    params.body || "",
  ).trim();

  if (!username) {
    throw new Error(
      "Instagram simulator username is required.",
    );
  }

  if (!body) {
    throw new Error(
      "Instagram simulator message is required.",
    );
  }

  const normalizedUsername =
    normalizeInstagramIdentity(
      username,
    );

  const senderId =
    String(
      params.senderId || "",
    ).trim() ||
    `sim_${
      normalizedUsername || "user"
    }`;

  return ingestCrmInstagramInbound({
    providerMessageId:
      `sim_ig_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 9)}`,
    senderId,
    username,
    recipientId:
      config.instagramUserId ||
      "sim_business_account",
    body,
    metadata: {
      simulated: true,
      source:
        "local_instagram_simulator",
    },
  });
}

async function resolveInstagramRecipient(
  conversationId: string,
) {
  const supabase =
    createServiceClient();

  const lastInbound =
    await supabase
      .from("crm_messages")
      .select(
        "sender_identity, metadata",
      )
      .eq(
        "conversation_id",
        conversationId,
      )
      .eq(
        "channel",
        "instagram",
      )
      .eq(
        "direction",
        "inbound",
      )
      .order("sent_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(1)
      .maybeSingle();

  if (lastInbound.error) {
    throw new Error(
      lastInbound.error.message,
    );
  }

  const recipientId =
    String(
      lastInbound.data
        ?.sender_identity || "",
    ).trim();

  if (!recipientId) {
    throw new Error(
      "No Instagram recipient is linked to this conversation.",
    );
  }

  return {
    recipientId,
    metadata:
      (lastInbound.data
        ?.metadata ||
        {}) as Record<
        string,
        unknown
      >,
  };
}

async function sendMetaMessage(params: {
  endpoint: string;
  accessToken: string;
  recipientId: string;
  message: Record<string, unknown>;
}) {
  const response = await fetch(
    params.endpoint,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${params.accessToken}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        recipient: {
          id: params.recipientId,
        },
        message: params.message,
      }),
      cache: "no-store",
    },
  );

  const payload =
    (await response
      .json()
      .catch(() => ({}))) as Record<
      string,
      any
    >;

  if (!response.ok) {
    throw new Error(
      String(
        payload?.error
          ?.message ||
          `Instagram API error ${response.status}`,
      ),
    );
  }

  return String(
    payload.message_id || "",
  );
}

async function sendMetaSenderAction(params: {
  endpoint: string;
  accessToken: string;
  recipientId: string;
  senderAction: "mark_seen";
}) {
  const response = await fetch(
    params.endpoint,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${params.accessToken}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        recipient: {
          id: params.recipientId,
        },
        sender_action:
          params.senderAction,
      }),
      cache: "no-store",
    },
  );

  const payload =
    (await response
      .json()
      .catch(() => ({}))) as Record<
      string,
      any
    >;

  if (!response.ok) {
    throw new Error(
      String(
        payload?.error
          ?.message ||
          `Instagram API error ${response.status}`,
      ),
    );
  }

  return true;
}

export async function markCrmInstagramConversationSeen(
  params: {
    conversationId: string;
  },
) {
  const conversationId = stringValue(
    params.conversationId,
  );

  if (!conversationId) {
    throw new Error(
      "Instagram conversation id is missing.",
    );
  }

  const config =
    await getResolvedMetaIntegration();

  if (!config.outboundConfigured) {
    return {
      synced: false,
      simulated: Boolean(
        config.simulatorEnabled,
      ),
    };
  }

  const recipient =
    await resolveInstagramRecipient(
      conversationId,
    );

  const endpoint =
    `https://graph.instagram.com/` +
    `${config.graphVersion}/` +
    `${encodeURIComponent(
      config.instagramUserId,
    )}/messages`;

  await sendMetaSenderAction({
    endpoint,
    accessToken:
      config.accessToken,
    recipientId:
      recipient.recipientId,
    senderAction:
      "mark_seen",
  });

  return {
    synced: true,
    simulated: false,
  };
}

export async function updateCrmInstagramDeliveryStatus(params: {
  providerMessageIds?: string[];
  providerThreadId?: string;
  messageStatus: "delivered" | "read";
  watermark?: string;
  metadata?: Record<string, unknown>;
}) {
  const providerMessageIds = Array.from(
    new Set(
      (params.providerMessageIds || [])
        .map((value) => stringValue(value))
        .filter(Boolean),
    ),
  );

  const providerThreadId = stringValue(
    params.providerThreadId,
  );

  const messageStatus = stringValue(
    params.messageStatus,
  ) as "delivered" | "read";

  if (
    messageStatus !== "delivered" &&
    messageStatus !== "read"
  ) {
    return {
      updated: false,
      ignored: true,
      matchedCount: 0,
    };
  }

  const supabase = createServiceClient();

  if (
    providerMessageIds.length === 0 &&
    !providerThreadId
  ) {
    return {
      updated: false,
      ignored: true,
      matchedCount: 0,
    };
  }

  const watermarkIso = parseMetaTimestamp(
    params.watermark,
  );
  const rows: Array<Record<string, any>> = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("crm_messages")
      .select("id, status, sent_at, delivered_at, read_at, metadata")
      .eq("channel", "instagram")
      .eq("direction", "outbound")
      .order("id", { ascending: true });

    query = providerMessageIds.length > 0
      ? query.in(
          "provider_message_id",
          providerMessageIds,
        )
      : query.eq(
          "provider_thread_id",
          providerThreadId,
        );

    if (
      providerMessageIds.length === 0 &&
      watermarkIso
    ) {
      query = query.lte(
        "sent_at",
        watermarkIso,
      );
    }

    const page = await query.range(
      from,
      from + pageSize - 1,
    );

    if (page.error) {
      throw new Error(
        page.error.message,
      );
    }

    rows.push(...(page.data || []));

    if ((page.data || []).length < pageSize) {
      break;
    }
  }

  if (rows.length === 0) {
    return {
      updated: false,
      ignored: true,
      matchedCount: 0,
    };
  }

  const now = new Date().toISOString();
  const statusOccurredAt =
    watermarkIso || now;
  let updatedCount = 0;

  for (const row of rows) {
    const currentStatus = stringValue(
      row.status || "",
    ) || null;

    const currentRank =
      successStatusRank(
        currentStatus,
      );

    const incomingRank =
      successStatusRank(
        messageStatus,
      );

    const patch: Record<string, unknown> = {};

    const nextRank = Math.max(
      currentRank,
      incomingRank,
    );

    const nextStatus =
      successStatusFromRank(
        nextRank,
      );

    if (
      nextStatus &&
      nextStatus !== currentStatus
    ) {
      patch.status = nextStatus;
    }

    if (
      messageStatus === "delivered" &&
      !row.delivered_at
    ) {
      patch.delivered_at = statusOccurredAt;
    }

    if (messageStatus === "read") {
      if (!row.delivered_at) {
        patch.delivered_at = statusOccurredAt;
      }

      if (!row.read_at) {
        patch.read_at = statusOccurredAt;
      }
    }

    if (incomingRank >= currentRank) {
      patch.metadata = {
        ...((row.metadata || {}) as Record<
          string,
          unknown
        >),
        instagram_status:
          nextStatus || messageStatus,
        instagram_status_updated_at:
          statusOccurredAt,
        instagram_status_metadata:
          safeMetadataObject(
            params.metadata,
          ) || null,
      };
    }

    if (Object.keys(patch).length === 0) {
      continue;
    }

    const updateResult = await supabase
      .from("crm_messages")
      .update(patch)
      .eq("id", row.id);

    if (updateResult.error) {
      throw new Error(
        updateResult.error.message,
      );
    }

    updatedCount += 1;
  }

  return {
    updated: updatedCount > 0,
    ignored: updatedCount === 0,
    matchedCount:
      rows.length,
    updatedCount,
    status:
      messageStatus,
  };
}

export async function sendCrmInstagramReply(
  params: {
    conversationId: string;
    body: string;
    attachments?: CrmAttachmentWithUrl[];
  },
) {
  const conversationId =
    String(
      params.conversationId ||
        "",
    ).trim();

  const body = String(
    params.body || "",
  ).trim();

  const attachments =
    params.attachments || [];

  if (!conversationId) {
    throw new Error(
      "Instagram conversation id is missing.",
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

  const config =
    await getResolvedMetaIntegration();

  const supabase =
    createServiceClient();

  const recipient =
    await resolveInstagramRecipient(
      conversationId,
    );

  let providerMessageId =
    `sim_ig_out_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

  let status = "sent";
  let simulated = false;

  if (
    config.outboundConfigured
  ) {
    const endpoint =
      `https://graph.instagram.com/` +
      `${config.graphVersion}/` +
      `${encodeURIComponent(
        config.instagramUserId,
      )}/messages`;

    if (body) {
      const textMessageId =
        await sendMetaMessage({
          endpoint,
          accessToken:
            config.accessToken,
          recipientId:
            recipient.recipientId,
          message: {
            text: body,
          },
        });

      if (textMessageId) {
        providerMessageId =
          textMessageId;
      }
    }

    for (const attachment of attachments) {
      if (
        attachment.type !==
          "image" ||
        !attachment.url
      ) {
        continue;
      }

      const mediaMessageId =
        await sendMetaMessage({
          endpoint,
          accessToken:
            config.accessToken,
          recipientId:
            recipient.recipientId,
          message: {
            attachment: {
              type: "image",
              payload: {
                url: attachment.url,
              },
            },
          },
        });

      if (mediaMessageId) {
        providerMessageId =
          mediaMessageId;
      }
    }
  } else if (
    config.simulatorEnabled
  ) {
    simulated = true;
  } else {
    throw new Error(
      "Instagram outbound transport is not configured.",
    );
  }

  const now =
    new Date().toISOString();

  const inserted =
    await supabase
      .from("crm_messages")
      .insert({
        conversation_id:
          conversationId,
        direction: "outbound",
        channel: "instagram",
        sender_identity:
          config.instagramUserId ||
          "sim_business_account",
        recipient_identity:
          recipient.recipientId,
        body_text: body,
        provider_message_id:
          providerMessageId,
        provider_thread_id:
          recipient.recipientId,
        status,
        sent_at: now,
        metadata: {
          simulated,
          username:
            recipient.metadata
              .username || null,
          native_media_count:
            attachments.length,
        },
      });

  if (inserted.error) {
    throw new Error(
      inserted.error.message,
    );
  }

  const updated =
    await supabase
      .from("crm_conversations")
      .update({
        needs_reply: false,
        last_channel:
          "instagram",
        last_message_at: now,
        last_outbound_at: now,
        updated_at: now,
      })
      .eq(
        "id",
        conversationId,
      );

  if (updated.error) {
    throw new Error(
      updated.error.message,
    );
  }

  return {
    messageId:
      providerMessageId,
    status,
    simulated,
  };
}

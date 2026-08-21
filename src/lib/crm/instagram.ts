import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { ingestCrmInboundMessage } from "@/lib/communication/inbound";
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

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  getResolvedMetaIntegration,
  ingestCrmInstagramInbound,
  ingestCrmInstagramNativeOutbound,
  updateCrmInstagramDeliveryStatus,
} from "@/lib/crm/instagram";

export const runtime = "nodejs";

type ResolvedInstagramProfile = {
  username: string | null;
};

function normalizeInstagramHandle(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function extractEventInstagramUsername(params: {
  event: any;
  message: any;
  metadata: Record<string, unknown>;
}) {
  const metadataMessage =
    params.metadata?.message &&
    typeof params.metadata.message === "object"
      ? (params.metadata.message as Record<string, unknown>)
      : {};

  const candidates = [
    params.event?.sender?.username,
    params.event?.sender?.name,
    params.message?.from?.username,
    params.message?.from?.name,
    metadataMessage.username,
    metadataMessage.sender_username,
  ];

  for (const candidate of candidates) {
    const normalized =
      normalizeInstagramHandle(
        candidate,
      );

    if (!normalized) {
      continue;
    }

    if (!/^[a-z0-9._]{2,64}$/i.test(normalized)) {
      continue;
    }

    return normalized;
  }

  return "";
}

function verifyMetaWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string;
  appSecret: string;
}) {
  const rawBody = String(params.rawBody || "");
  const signatureHeader = String(params.signatureHeader || "").trim();
  const appSecret = String(params.appSecret || "").trim();

  if (!rawBody || !signatureHeader || !appSecret) {
    return false;
  }

  const expectedPrefix = "sha256=";

  if (!signatureHeader.startsWith(expectedPrefix)) {
    return false;
  }

  const receivedHex = signatureHeader
    .slice(expectedPrefix.length)
    .trim();

  if (!/^[a-fA-F0-9]{64}$/.test(receivedHex)) {
    return false;
  }

  const expectedHex = createHmac(
    "sha256",
    appSecret,
  )
    .update(rawBody, "utf8")
    .digest("hex");

  try {
    const expectedBuffer = Buffer.from(
      expectedHex,
      "hex",
    );

    const receivedBuffer = Buffer.from(
      receivedHex,
      "hex",
    );

    if (
      expectedBuffer.length !==
      receivedBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(
      expectedBuffer,
      receivedBuffer,
    );
  } catch {
    return false;
  }
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
    const serialized =
      JSON.stringify(value);

    if (
      !serialized ||
      serialized.length >
        maxSerializedLength
    ) {
      return null;
    }

    const parsed =
      JSON.parse(serialized);

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<
          string,
          unknown
        >)
      : null;
  } catch {
    return null;
  }
}

function getMetaReferralAttribution(
  event: any,
  message: any,
) {
  const eventReferral =
    safeMetadataObject(
      event?.referral,
    );

  const messageReferral =
    safeMetadataObject(
      message?.referral,
    );

  const referral =
    eventReferral ||
    messageReferral;

  if (!referral) {
    return {
      eventReferral: null,
      messageReferral: null,
      attribution: null,
    };
  }

  const adsContext =
    safeMetadataObject(
      referral.ads_context_data,
    );

  const source =
    stringValue(
      referral.source,
    );

  const type =
    stringValue(
      referral.type,
    );

  const ref =
    stringValue(
      referral.ref,
    );

  const adId =
    stringValue(
      referral.ad_id,
    ) ||
    stringValue(
      adsContext?.ad_id,
    );

  return {
    eventReferral,
    messageReferral,
    attribution: {
      provider: "meta",
      channel: "instagram",
      source: source || null,
      type: type || null,
      ref: ref || null,
      ad_id: adId || null,
      ads_context_data:
        adsContext,
    },
  };
}

function getMessageBody(message: any) {
  const text = stringValue(
    message?.text,
  );

  if (text) {
    return text;
  }

  const attachments = Array.isArray(
    message?.attachments,
  )
    ? message.attachments
    : [];

  if (attachments.length > 0) {
    const types = attachments
      .map((attachment: any) =>
        stringValue(
          attachment?.type,
        ),
      )
      .filter(Boolean);

    if (types.length > 0) {
      return `(Instagram ${types.join(", ")} message)`;
    }

    return "(Instagram media message)";
  }

  return "(Instagram message)";
}

function extractInstagramMessages(
  payload: any,
) {
  const messages: Array<{
    providerMessageId: string;
    direction: "inbound" | "outbound";
    contactId: string;
    businessAccountId?: string;
    body: string;
    fallbackUsername?: string;
    metadata: Record<
      string,
      unknown
    >;
  }> = [];

  const entries = Array.isArray(
    payload?.entry,
  )
    ? payload.entry
    : [];

  for (const entry of entries) {
    const messagingEvents =
      Array.isArray(
        entry?.messaging,
      )
        ? entry.messaging
        : [];

    for (
      const event of
      messagingEvents
    ) {
      const message =
        event?.message;

      /* Delivery/read events have no message payload. */
      if (
        !message ||
        typeof message !== "object"
      ) {
        continue;
      }

      const senderId =
        stringValue(
          event?.sender?.id,
        );

      const recipientId =
        stringValue(
          event?.recipient?.id,
        );

      const isEcho = message?.is_echo === true;
      const contactId = isEcho ? recipientId : senderId;
      const businessAccountId = isEcho ? senderId : recipientId;

      if (!contactId) {
        continue;
      }

      /*
       * Meta normally supplies message.mid.
       *
       * We deliberately do not generate a random ID here because
       * providerMessageId is used for idempotency/deduplication.
       */
      const providerMessageId =
        stringValue(
          message?.mid,
        ) ||
        stringValue(
          message?.id,
        );

      if (!providerMessageId) {
        console.warn(
          "Instagram webhook message skipped because provider message id is missing.",
          {
            senderId,
            recipientId,
          },
        );

        continue;
      }

      const attachments =
        Array.isArray(
          message?.attachments,
        )
          ? message.attachments
          : [];

      const referralContext =
        getMetaReferralAttribution(
          event,
          message,
        );

      const metadata: Record<
        string,
        unknown
      > = {
        source:
          "meta_webhook",

        object:
          payload?.object ||
          null,

        entry_id:
          entry?.id ||
          null,

        entry_time:
          entry?.time ||
          null,

        timestamp:
          event?.timestamp ||
          null,

        ...(referralContext.eventReferral
          ? {
              referral:
                referralContext.eventReferral,
            }
          : {}),

        ...(referralContext.messageReferral
          ? {
              message_referral:
                referralContext.messageReferral,
            }
          : {}),

        ...(referralContext.attribution
          ? {
              attribution:
                referralContext.attribution,
            }
          : {}),

        message: {
          mid:
            providerMessageId,

          text:
            stringValue(
              message?.text,
            ) || null,

          is_echo:
            message?.is_echo ===
            true,

          attachments,
        },
      };

      const fallbackUsername =
        extractEventInstagramUsername(
          {
            event,
            message,
            metadata,
          },
        );

      if (fallbackUsername) {
        metadata.sender_username =
          fallbackUsername;
      }

      messages.push({
        providerMessageId,
        direction: isEcho ? "outbound" : "inbound",
        contactId,
        businessAccountId: businessAccountId || undefined,

        fallbackUsername:
          fallbackUsername ||
          undefined,

        body:
          getMessageBody(
            message,
          ),

        metadata,
      });
    }
  }

  return messages;
}

function extractInstagramStatusEvents(
  payload: any,
) {
  const statusEvents: Array<{
    type: "delivered" | "read";
    providerMessageIds: string[];
    providerThreadId?: string;
    recipientId?: string;
    watermark?: string;
    metadata: Record<string, unknown>;
  }> = [];

  const entries = Array.isArray(
    payload?.entry,
  )
    ? payload.entry
    : [];

  for (const entry of entries) {
    const messagingEvents =
      Array.isArray(
        entry?.messaging,
      )
        ? entry.messaging
        : [];

    for (
      const event of
      messagingEvents
    ) {
      const senderId = stringValue(
        event?.sender?.id,
      );

      const recipientId = stringValue(
        event?.recipient?.id,
      );

      const delivery = event?.delivery;

      if (
        delivery &&
        typeof delivery === "object"
      ) {
        const mids = Array.isArray(
          delivery?.mids,
        )
          ? delivery.mids
          : [];

        const providerMessageIds = mids
          .map((mid: unknown) =>
            stringValue(mid),
          )
          .filter(Boolean);

        statusEvents.push({
          type: "delivered",
          providerMessageIds,
          providerThreadId:
            senderId ||
            undefined,
          recipientId:
            recipientId ||
            undefined,
          watermark:
            delivery?.watermark
              ? String(
                  delivery.watermark,
                )
              : undefined,
          metadata: {
            source:
              "meta_webhook",
            event_type:
              "delivery",
            object:
              payload?.object ||
              null,
            entry_id:
              entry?.id ||
              null,
            entry_time:
              entry?.time ||
              null,
            timestamp:
              event?.timestamp ||
              null,
            sender_id:
              senderId || null,
            delivery,
          },
        });
      }

      const read = event?.read;

      if (
        read &&
        typeof read === "object"
      ) {
        statusEvents.push({
          type: "read",
          providerMessageIds: [],
          providerThreadId:
            senderId ||
            undefined,
          recipientId:
            recipientId ||
            undefined,
          watermark:
            read?.watermark
              ? String(
                  read.watermark,
                )
              : undefined,
          metadata: {
            source:
              "meta_webhook",
            event_type: "read",
            object:
              payload?.object ||
              null,
            entry_id:
              entry?.id ||
              null,
            entry_time:
              entry?.time ||
              null,
            timestamp:
              event?.timestamp ||
              null,
            sender_id:
              senderId || null,
            read,
          },
        });
      }
    }
  }

  return statusEvents;
}

async function resolveInstagramSenderProfile(params: {
  senderId: string;
  accessToken: string;
  graphVersion: string;
  instagramUserId?: string;
  pageId?: string;
}) {
  const senderId = stringValue(params.senderId);

  if (!senderId) {
    return null;
  }

  const accessToken = stringValue(params.accessToken);

  if (!accessToken) {
    return null;
  }

  const graphVersion = stringValue(params.graphVersion) || "v24.0";
  const endpoint = `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(senderId)}?fields=username,name`;

  const fetchUsername = async (
    token: string,
  ) => {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    return response;
  };

  const resolvePageAccessToken = async () => {
    try {
      const pagesEndpoint = `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`;
      const pagesResponse = await fetch(pagesEndpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      if (!pagesResponse.ok) {
        return "";
      }

      const payload = (await pagesResponse
        .json()
        .catch(() => ({}))) as Record<string, unknown>;

      const rows = Array.isArray(payload.data)
        ? payload.data
        : [];

      const preferred = rows.find((row: any) => {
        const rowPageId = stringValue(
          row?.id,
        );

        const rowInstagramId = stringValue(
          row
            ?.instagram_business_account
            ?.id,
        );

        const pageMatches =
          params.pageId &&
          rowPageId ===
            params.pageId;

        const instagramMatches =
          params.instagramUserId &&
          rowInstagramId ===
            params.instagramUserId;

        return (
          pageMatches ||
          instagramMatches
        );
      });

      return stringValue(
        (preferred as any)
          ?.access_token,
      );
    } catch {
      return "";
    }
  };

  try {
    let response =
      await fetchUsername(
        accessToken,
      );

    if (!response.ok) {
      const pageAccessToken =
        await resolvePageAccessToken();

      if (pageAccessToken) {
        response =
          await fetchUsername(
            pageAccessToken,
          );
      }
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const username = stringValue(payload?.username);

    if (!username) {
      return null;
    }

    return {
      username,
    } satisfies ResolvedInstagramProfile;
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
) {
  const config =
    await getResolvedMetaIntegration();

  const url =
    new URL(
      request.url,
    );

  const mode =
    url.searchParams.get(
      "hub.mode",
    ) || "";

  const token =
    url.searchParams.get(
      "hub.verify_token",
    ) || "";

  const challenge =
    url.searchParams.get(
      "hub.challenge",
    ) || "";

  if (
    mode === "subscribe" &&
    config.verifyToken &&
    token ===
      config.verifyToken
  ) {
    return new NextResponse(
      challenge,
      {
        status: 200,

        headers: {
          "Content-Type":
            "text/plain",

          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      error:
        "Instagram webhook verification failed.",
    },
    {
      status: 403,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

export async function POST(
  request: Request,
) {
  const config =
    await getResolvedMetaIntegration();

  /*
   * Never accept an unsigned webhook.
   */
  if (!config.appSecret) {
    console.error(
      "Instagram webhook rejected: META_APP_SECRET is not configured.",
    );

    return NextResponse.json(
      {
        error:
          "Instagram webhook is not configured.",
      },
      {
        status: 503,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const rawBody =
    await request.text();

  const signatureHeader =
    request.headers.get(
      "x-hub-signature-256",
    ) || "";

  const signatureValid =
    verifyMetaWebhookSignature({
      rawBody,
      signatureHeader,
      appSecret:
        config.appSecret,
    });

  if (!signatureValid) {
    console.warn(
      "Instagram webhook rejected because Meta signature verification failed.",
    );

    return NextResponse.json(
      {
        error:
          "Invalid Meta webhook signature.",
      },
      {
        status: 403,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  let payload: any;

  try {
    payload =
      JSON.parse(
        rawBody,
      );
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid JSON.",
      },
      {
        status: 400,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  /*
   * Ignore unrelated Meta webhook objects.
   */
  if (
    payload?.object &&
    String(
      payload.object,
    ).toLowerCase() !==
      "instagram"
  ) {
    return NextResponse.json(
      {
        received: true,
        ignored: true,
        reason:
          "unsupported_object",
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const messages =
    extractInstagramMessages(
      payload,
    );

  const statusEvents =
    extractInstagramStatusEvents(
      payload,
    );

  /*
   * A valid Meta notification may contain only read/delivery
   * events, so zero inbound messages is a valid result.
   */
  if (
    messages.length === 0 &&
    statusEvents.length === 0
  ) {
    return NextResponse.json(
      {
        received: true,
        processed: 0,
        statusProcessed: 0,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  let processed = 0;
  let ignored = 0;
  let statusProcessed = 0;
  let statusIgnored = 0;
  const senderProfileCache = new Map<string, Promise<ResolvedInstagramProfile | null>>();

  const failures: Array<{
    providerMessageId: string;
    error: string;
  }> = [];

  for (const statusEvent of statusEvents) {
    try {
      if (
        config.instagramUserId &&
        statusEvent.recipientId &&
        statusEvent.recipientId !==
          config.instagramUserId
      ) {
        statusIgnored += 1;
        continue;
      }

      const statusResult =
        await updateCrmInstagramDeliveryStatus(
          {
            providerMessageIds:
              statusEvent.providerMessageIds,
            providerThreadId:
              statusEvent.providerThreadId,
            messageStatus:
              statusEvent.type,
            watermark:
              statusEvent.watermark,
            metadata:
              statusEvent.metadata,
          },
        );

      if (statusResult.ignored) {
        statusIgnored += 1;
      } else {
        statusProcessed += 1;
      }
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : "Instagram CRM status processing failed.";

      failures.push({
        providerMessageId:
          `status:${statusEvent.type}:${statusEvent.providerThreadId || "unknown"}`,
        error:
          messageText,
      });
    }
  }

  for (
    const message of messages
  ) {
    try {
      /*
       * Security hardening:
       *
       * A valid Meta signature proves that the webhook came from Meta,
       * but the same Meta App could theoretically be connected to more
       * than one Instagram business account.
       *
       * When META_INSTAGRAM_USER_ID is configured, only ingest messages
       * addressed to that exact Instagram account.
       */
      if (
        config.instagramUserId &&
        message.businessAccountId &&
        message.businessAccountId !== config.instagramUserId
      ) {
        console.warn(
          "Instagram webhook message ignored because recipient does not match configured Instagram account.",
          {
            providerMessageId:
              message.providerMessageId,

            businessAccountId: message.businessAccountId,
          },
        );

        ignored += 1;
        continue;
      }

      if (!senderProfileCache.has(message.contactId)) {
        senderProfileCache.set(
          message.contactId,
          resolveInstagramSenderProfile({
            senderId: message.contactId,
            accessToken: config.accessToken,
            graphVersion: config.graphVersion,
            instagramUserId: config.instagramUserId,
            pageId: config.pageId,
          }),
        );
      }

      const senderProfile = await senderProfileCache.get(message.contactId)!;

      const payload = {
        providerMessageId:
          message.providerMessageId,
        username:
          senderProfile?.username || message.fallbackUsername || undefined,
        body: message.body,
        metadata: message.metadata,
      };

      if (message.direction === "outbound") {
        await ingestCrmInstagramNativeOutbound({
          ...payload,
          recipientId: message.contactId,
          senderId: message.businessAccountId,
        });
      } else {
        await ingestCrmInstagramInbound({
          ...payload,
          senderId: message.contactId,
          recipientId: message.businessAccountId,
        });
      }

      processed += 1;
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : "Instagram CRM inbound processing failed.";

      console.error(
        "Instagram CRM inbound message failed",
        {
          providerMessageId:
            message.providerMessageId,

          error:
            messageText,
        },
      );

      failures.push({
        providerMessageId:
          message.providerMessageId,

        error:
          messageText,
      });
    }
  }

  /*
   * Do not expose internal database/error details to Meta.
   *
   * If every actual processing attempt failed, return 500
   * so Meta can retry.
   *
   * Ignored messages do not count as failures.
   */
  if (
    processed === 0 &&
    statusProcessed === 0 &&
    failures.length > 0
  ) {
    return NextResponse.json(
      {
        error:
          "Instagram webhook processing failed.",
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      received: true,
      processed,
      statusProcessed,
      statusIgnored,
      ignored,
      failed:
        failures.length,
    },
    {
      status: 200,

      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

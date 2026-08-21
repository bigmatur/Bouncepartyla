import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  getResolvedMetaIntegration,
  ingestCrmInstagramInbound,
} from "@/lib/crm/instagram";

export const runtime = "nodejs";

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
    senderId: string;
    recipientId?: string;
    body: string;
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

      /*
       * Delivery/read/echo events are not inbound customer messages.
       * Only ingest actual message events.
       */
      if (
        !message ||
        typeof message !== "object"
      ) {
        continue;
      }

      if (
        message?.is_echo === true
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

      if (!senderId) {
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

      messages.push({
        providerMessageId,
        senderId,

        recipientId:
          recipientId ||
          undefined,

        body:
          getMessageBody(
            message,
          ),

        metadata: {
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
        },
      });
    }
  }

  return messages;
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

  /*
   * A valid Meta notification may contain only read/delivery
   * events, so zero inbound messages is a valid result.
   */
  if (
    messages.length === 0
  ) {
    return NextResponse.json(
      {
        received: true,
        processed: 0,
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

  const failures: Array<{
    providerMessageId: string;
    error: string;
  }> = [];

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
        message.recipientId &&
        message.recipientId !==
          config.instagramUserId
      ) {
        console.warn(
          "Instagram webhook message ignored because recipient does not match configured Instagram account.",
          {
            providerMessageId:
              message.providerMessageId,

            recipientId:
              message.recipientId,
          },
        );

        ignored += 1;
        continue;
      }

      await ingestCrmInstagramInbound({
        providerMessageId:
          message.providerMessageId,

        senderId:
          message.senderId,

        recipientId:
          message.recipientId,

        body:
          message.body,

        metadata:
          message.metadata,
      });

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
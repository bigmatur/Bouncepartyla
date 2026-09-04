import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  extractWhatsAppWebhookEvents,
  getResolvedWhatsAppIntegration,
  ingestCrmWhatsAppInbound,
  updateCrmWhatsAppDeliveryStatus,
} from "@/lib/crm/whatsapp";

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

export async function GET(
  request: Request,
) {
  const config =
    await getResolvedWhatsAppIntegration();

  const url = new URL(request.url);

  const mode =
    url.searchParams.get("hub.mode") || "";

  const token =
    url.searchParams.get("hub.verify_token") || "";

  const challenge =
    url.searchParams.get("hub.challenge") || "";

  if (
    mode === "subscribe" &&
    config.verifyToken &&
    token === config.verifyToken
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      error:
        "WhatsApp webhook verification failed.",
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(
  request: Request,
) {
  const config =
    await getResolvedWhatsAppIntegration();

  if (!config.appSecret) {
    console.error(
      "WhatsApp webhook rejected: app secret is not configured.",
    );

    return NextResponse.json(
      {
        error:
          "WhatsApp webhook is not configured.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const rawBody = await request.text();

  const signatureHeader =
    request.headers.get("x-hub-signature-256") || "";

  if (
    !verifyMetaWebhookSignature({
      rawBody,
      signatureHeader,
      appSecret: config.appSecret,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid Meta webhook signature.",
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const objectType = stringValue(
    payload?.object,
  ).toLowerCase();

  if (
    objectType &&
    objectType !== "whatsapp_business_account"
  ) {
    return NextResponse.json(
      {
        received: true,
        ignored: true,
        reason: "unsupported_object",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const { inboundEvents, statusEvents } =
    extractWhatsAppWebhookEvents(payload);

  if (
    inboundEvents.length === 0 &&
    statusEvents.length === 0
  ) {
    return NextResponse.json(
      {
        received: true,
        processed_messages: 0,
        processed_statuses: 0,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  let processedMessages = 0;
  let failedMessages = 0;
  let processedStatuses = 0;
  let ignoredStatuses = 0;
  let failedStatuses = 0;

  for (const event of inboundEvents) {
    try {
      await ingestCrmWhatsAppInbound({
        providerMessageId:
          event.providerMessageId,
        senderPhone: event.senderPhone,
        recipientPhone:
          event.recipientPhone,
        threadId: event.threadId,
        senderName: event.senderName,
        body: event.body,
        sentAt: event.sentAt,
        metadata: event.metadata,
      });

      processedMessages += 1;
    } catch (error) {
      failedMessages += 1;
      console.error(
        "WhatsApp inbound processing failed",
        {
          providerMessageId:
            event.providerMessageId,
          error:
            error instanceof Error
              ? error.message
              : "unknown_error",
        },
      );
    }
  }

  for (const statusEvent of statusEvents) {
    try {
      const result =
        await updateCrmWhatsAppDeliveryStatus({
          providerMessageId:
            statusEvent.providerMessageId,
          messageStatus:
            statusEvent.messageStatus,
          metadata:
            statusEvent.metadata,
        });

      if (result.updated) {
        processedStatuses += 1;
      } else {
        ignoredStatuses += 1;
      }
    } catch (error) {
      failedStatuses += 1;
      console.error(
        "WhatsApp status processing failed",
        {
          providerMessageId:
            statusEvent.providerMessageId,
          status: statusEvent.messageStatus,
          error:
            error instanceof Error
              ? error.message
              : "unknown_error",
        },
      );
    }
  }

  if (
    inboundEvents.length > 0 &&
    processedMessages === 0 &&
    failedMessages > 0
  ) {
    return NextResponse.json(
      {
        error:
          "WhatsApp message processing failed.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (
    statusEvents.length > 0 &&
    processedStatuses === 0 &&
    ignoredStatuses === 0 &&
    failedStatuses > 0
  ) {
    return NextResponse.json(
      {
        error:
          "WhatsApp status processing failed.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      received: true,
      processed_messages: processedMessages,
      failed_messages: failedMessages,
      processed_statuses: processedStatuses,
      ignored_statuses: ignoredStatuses,
      failed_statuses: failedStatuses,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

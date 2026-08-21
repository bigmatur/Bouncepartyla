import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getStripeWebhookSecret,
  syncStripeCheckoutSessionPayment,
} from "@/lib/payments/stripe";
import { processNotificationQueueBestEffort } from "@/lib/notifications/engine";

export const runtime = "nodejs";

function verifyStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) || "";
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - timestampNumber);
  if (ageSeconds > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  return signatures.some((signature) => {
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(signature, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

export async function POST(request: Request) {
  const secret = getStripeWebhookSecret();
  if (!secret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") || "";

  if (!verifyStripeSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventType = String(event?.type || "");
  const session = event?.data?.object || {};

  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(eventType)) {
    try {
      const result = await syncStripeCheckoutSessionPayment({
        sessionId: String(session?.id || ""),
      });
      if (result?.bookingId) {
        await processNotificationQueueBestEffort({ bookingId: result.bookingId, limit: 25 });
      }
      return NextResponse.json({ received: true, result });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Stripe payment sync failed." },
        { status: 500 },
      );
    }
  }

  if (eventType === "checkout.session.expired") {
    const bookingId = String(session?.metadata?.booking_id || session?.client_reference_id || "").trim();
    const source = String(session?.metadata?.source || "").trim();

    if (bookingId && source === "customer_initial_deposit") {
      const supabase = createServiceClient();
      const cleanup = await supabase.rpc("expire_unpaid_customer_stripe_booking", {
        p_booking_id: bookingId,
      });

      if (cleanup.error) {
        return NextResponse.json({ error: cleanup.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { processNotificationQueueBestEffort } from "@/lib/notifications/engine";

function requireStripeSecretKey() {
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY to the server environment.");
  }
  return key;
}

export function getStripeWebhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}

export function getStripeIntegrationStatus() {
  return {
    secretKeyConfigured: Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim()),
    webhookSecretConfigured: Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || "").trim()),
  };
}

export async function getApplicationOrigin() {
  const explicit = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "")
    .trim()
    .replace(/\/$/, "");

  if (explicit) return explicit;

  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "http";
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3001";
  return `${proto}://${host}`;
}

function setParam(params: URLSearchParams, key: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return;
  params.set(key, String(value));
}

export type StripeCheckoutSource =
  | "admin_booking"
  | "admin_new_booking"
  | "customer_checkout"
  | "customer_temporary_deposit"
  | "customer_initial_deposit";

export async function createStripeCheckoutSession(input: {
  bookingId: string;
  amount: number;
  baseAmount?: number;
  tipAmount?: number;
  customerEmail?: string | null;
  source: StripeCheckoutSource;
  successPath: string;
  cancelPath: string;
  description?: string;
  expiresAt?: number;
  metadata?: Record<string, string | number | null | undefined>;
}) {
  const secretKey = requireStripeSecretKey();
  const amount = Number(input.amount || 0);
  const cents = Math.round(amount * 100);

  if (!Number.isFinite(amount) || cents <= 0) {
    throw new Error("Stripe payment amount must be greater than 0.");
  }

  const origin = await getApplicationOrigin();
  const params = new URLSearchParams();

  params.set("mode", "payment");
  params.set("payment_method_types[0]", "card");
  params.set(
    "success_url",
    `${origin}${input.successPath}${input.successPath.includes("?") ? "&" : "?"}stripe=success&session_id={CHECKOUT_SESSION_ID}`,
  );
  params.set(
    "cancel_url",
    `${origin}${input.cancelPath}${input.cancelPath.includes("?") ? "&" : "?"}stripe=cancelled`,
  );
  params.set("client_reference_id", input.bookingId);
  params.set("line_items[0][price_data][currency]", "usd");
  params.set(
    "line_items[0][price_data][product_data][name]",
    input.description || "Bounce Party LA booking payment",
  );
  params.set("line_items[0][price_data][unit_amount]", String(cents));
  params.set("line_items[0][quantity]", "1");

  if (input.expiresAt && Number.isFinite(input.expiresAt)) {
    params.set("expires_at", String(Math.floor(input.expiresAt)));
  }

  if (input.customerEmail) {
    params.set("customer_email", input.customerEmail);
  }

  const metadata: Record<string, string | number | null | undefined> = {
    booking_id: input.bookingId,
    source: input.source,
    base_amount: Number(input.baseAmount ?? amount).toFixed(2),
    tip_amount: Number(input.tipAmount ?? 0).toFixed(2),
    ...input.metadata,
  };

  for (const [key, value] of Object.entries(metadata)) {
    setParam(params, `metadata[${key}]`, value);
    setParam(params, `payment_intent_data[metadata][${key}]`, value);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = String((payload as any)?.error?.message || "Stripe Checkout session could not be created.");
    throw new Error(message);
  }

  const url = String((payload as any)?.url || "");
  const id = String((payload as any)?.id || "");

  if (!url || !id) {
    throw new Error("Stripe Checkout returned an invalid session.");
  }

  return { id, url };
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  const safeSessionId = String(sessionId || "").trim();
  if (!safeSessionId.startsWith("cs_")) {
    throw new Error("Invalid Stripe Checkout session ID.");
  }

  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(safeSessionId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${requireStripeSecretKey()}`,
      },
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as any)?.error?.message || "Stripe Checkout session could not be read."));
  }

  return payload as any;
}

export async function syncStripeCheckoutSessionPayment(input: {
  sessionId: string;
  expectedBookingId?: string | null;
}) {
  const session = await retrieveStripeCheckoutSession(input.sessionId);
  const bookingId = String(session?.metadata?.booking_id || session?.client_reference_id || "").trim();
  const expectedBookingId = String(input.expectedBookingId || "").trim();

  if (!bookingId) {
    throw new Error("Stripe session is missing booking metadata.");
  }

  if (expectedBookingId && bookingId !== expectedBookingId) {
    throw new Error("Stripe session does not belong to this booking.");
  }

  if (String(session?.payment_status || "") !== "paid") {
    return {
      success: false,
      status: "not_paid",
      bookingId,
      source: String(session?.metadata?.source || "stripe_checkout"),
    };
  }

  const sessionId = String(session?.id || "").trim();
  const paymentIntentId = String(session?.payment_intent || "").trim();
  const source = String(session?.metadata?.source || "stripe_checkout").trim();
  const amount = Number(session?.amount_total || 0) / 100;
  const tipAmount = Math.max(0, Number(session?.metadata?.tip_amount || 0));

  if (!sessionId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Stripe session payment information is incomplete.");
  }

  const supabase = createServiceClient();
  const existing = await supabase
    .from("payments")
    .select("id")
    .eq("external_reference", sessionId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (!existing.data) {
    const insertResult = await supabase.from("payments").insert({
      booking_id: bookingId,
      amount: Number(amount.toFixed(2)),
      method: "stripe",
      status: "paid",
      external_reference: sessionId,
      tip_amount: Number(tipAmount.toFixed(2)),
      note: `Stripe Checkout paid. Source: ${source}. PaymentIntent: ${paymentIntentId || "n/a"}`,
      paid_at: new Date().toISOString(),
    });

    if (insertResult.error && String(insertResult.error.code || "") !== "23505") {
      throw new Error(insertResult.error.message);
    }
  }

  const finalizeResult = await supabase.rpc("finalize_booking_after_external_payment", {
    p_booking_id: bookingId,
  });

  if (finalizeResult.error) {
    throw new Error(finalizeResult.error.message);
  }

  const finalizePayload = finalizeResult.data as {
    success?: boolean;
    status?: string;
  } | null;

  // Route Board is derived operational data. A Route Board sync failure must
  // never roll back or hide a successfully paid/finalized booking. The SQL RPC
  // is idempotent and catches its own route-stop errors; we also keep this call
  // non-fatal here so Stripe reconciliation remains authoritative.
  let routeSyncResult: unknown = null;
  if (finalizePayload?.success && finalizePayload.status === "confirmed") {
    const routeSync = await supabase.rpc("sync_booking_route_stops_after_external_payment", {
      p_booking_id: bookingId,
    });

    routeSyncResult = routeSync.error
      ? { success: false, status: "route_sync_rpc_error", error: routeSync.error.message }
      : routeSync.data;

    if (routeSync.error) {
      console.error("Stripe booking finalized but Route Board sync failed", {
        bookingId,
        error: routeSync.error.message,
      });
    }
  }

  // Flush any queued notifications for this booking (e.g. contract_signed,
  // deposit_paid). The Stripe webhook covers this in production, but the
  // localhost-friendly return path above never reaches the webhook handler.
  await processNotificationQueueBestEffort({ bookingId, limit: 25 });

  return {
    success: true,
    status: "paid",
    bookingId,
    source,
    paymentAmount: Number(amount.toFixed(2)),
    finalizeResult: finalizeResult.data,
    routeSyncResult,
  };
}

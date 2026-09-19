"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createStripeCheckoutSession,
  retrieveStripeCheckoutSession,
} from "@/lib/payments/stripe";
import {
  getTemporaryCheckoutHoldBufferMinutes,
  getTemporaryCheckoutSessionMinutes,
  minutesFromNowToUnixSeconds,
} from "@/lib/booking/temporary-hold-config";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildOrderSummaryHtml(values: {
  customerName: string;
  customerEmail: string;
  bookingNumber: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  setupAddress: string;
  setupCity: string;
  setupState: string;
  setupZip: string;
  itemSummary: string;
  subtotal: string;
  discountAmount: string;
  deliveryFee: string;
  taxAmount: string;
  totalAmount: string;
  depositAmount: string;
  balanceDue: string;
}) {
  return `
    <section style="border:1px solid #e7ddd0; border-radius:14px; padding:16px; margin-bottom:16px; background:#fcfaf7;">
      <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#9a7a49; font-weight:700;">Order Summary</div>
      <div style="margin-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:13px; color:#4b4339;">
        <div><strong>Customer:</strong> ${values.customerName}</div>
        <div><strong>Email:</strong> ${values.customerEmail || "-"}</div>
        <div><strong>Booking:</strong> ${values.bookingNumber}</div>
        <div><strong>Event date:</strong> ${values.eventDate}</div>
        <div><strong>Time:</strong> ${values.eventStartTime || "-"} - ${values.eventEndTime || "-"}</div>
        <div style="grid-column:1 / -1;"><strong>Address:</strong> ${values.setupAddress}, ${values.setupCity} ${values.setupState} ${values.setupZip}</div>
      </div>
      <div style="margin-top:10px; font-size:13px; color:#3f382f;"><strong>Equipment:</strong> ${values.itemSummary || "-"}</div>
      <div style="margin-top:10px; border-top:1px solid #e7ddd0; padding-top:10px; display:grid; gap:4px; font-size:13px; color:#3f382f;">
        <div><strong>Subtotal:</strong> $${values.subtotal}</div>
        <div><strong>Discount:</strong> $${values.discountAmount}</div>
        <div><strong>Delivery:</strong> $${values.deliveryFee}</div>
        <div><strong>Tax:</strong> $${values.taxAmount}</div>
        <div><strong>Total:</strong> $${values.totalAmount}</div>
        <div><strong>Deposit:</strong> $${values.depositAmount}</div>
        <div><strong>Balance due:</strong> $${values.balanceDue}</div>
      </div>
    </section>
  `;
}

function isMissingFunctionError(error: any, functionName?: string) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const target = String(functionName || "").toLowerCase();

  if (code === "42883") {
    return !target || message.includes(target);
  }

  return (
    message.includes("function") &&
    message.includes("does not exist") &&
    (!target || message.includes(target))
  );
}

export async function signTemporaryBookingContractAction(formData: FormData) {
  const bookingId = text(formData, "bookingId");
  const signerName = text(formData, "signerName");
  const accepted = formData.get("accepted") === "on";
  const signatureDataUrl = text(formData, "signatureDataUrl");

  if (!bookingId || !signerName || !accepted || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signatureDataUrl)) {
    redirect(`/account/bookings/${bookingId}?complete=1&error=signature_required`);
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user?.email) {
    redirect(`/account/login?next=${encodeURIComponent(`/account/bookings/${bookingId}?complete=1`)}`);
  }

  const { data: bookingDetailsResult } = await supabase.rpc(
    "get_my_booking_details",
    {
      p_booking_id: bookingId,
    },
  );

  const bookingDetails =
    bookingDetailsResult && typeof bookingDetailsResult === "object"
      ? (bookingDetailsResult as any)
      : null;

  const bookingFromRpc = bookingDetails?.booking || null;
  const itemsFromRpc = Array.isArray(bookingDetails?.items)
    ? bookingDetails.items
    : [];

  let booking = bookingFromRpc;
  let items = itemsFromRpc;

  // Fallback for environments where the RPC is unavailable.
  if (!booking) {
    const [bookingResult, itemsResult] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, customer_id, booking_number, event_date, event_start_time, event_end_time, setup_address, setup_city, setup_state, setup_zip, subtotal, discount_amount, delivery_fee, tax_amount, total_amount, deposit_amount, balance_due",
        )
        .eq("id", bookingId)
        .maybeSingle(),
      supabase
        .from("booking_items")
        .select("quantity, products(name)")
        .eq("booking_id", bookingId),
    ]);

    booking = bookingResult.data;
    items = itemsResult.data || [];
  }

  if (!booking) {
    redirect(`/account/bookings/${bookingId}?complete=1&error=booking_not_found`);
  }

  const [{ data: customer }, { data: contractSettings }] = await Promise.all([
    booking.customer_id
      ? supabase.from("customers").select("full_name, email").eq("id", booking.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("booking_contract_settings")
      .select("template_html, signature_label")
      .limit(1)
      .maybeSingle(),
  ]);

  const profileResult = await supabase.rpc("get_my_customer_profile");
  const profile = Array.isArray(profileResult.data)
    ? profileResult.data[0]
    : profileResult.data;
  const profileFullName = String(profile?.full_name || "").trim();
  const profileFirst = String(profile?.first_name || "").trim();
  const profileLast = String(profile?.last_name || "").trim();
  const profileName = [profileFirst, profileLast].filter(Boolean).join(" ").trim();

  const signedAt = new Date().toISOString();
  const signerDate = signedAt.slice(0, 10);
  const itemSummary = (items || [])
    .map((item: any) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      const itemName =
        product?.name ||
        item?.product_name ||
        "Product";

      return `${escapeHtml(itemName)} × ${Number(item.quantity || 1)}`;
    })
    .join(", ");

  const template = String(
    contractSettings?.template_html ||
      "<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>{{signature_label}}: {{signature_manual}}</p><p>Date: {{signature_date}}</p>"
  );

  const resolvedCustomerName = escapeHtml(
    String(
      customer?.full_name ||
        profileFullName ||
        profileName ||
        booking?.customer_name ||
        signerName ||
        "Customer",
    ),
  );
  const resolvedCustomerEmail = escapeHtml(
    String(user.email || customer?.email || ""),
  );
  const resolvedBookingNumber = escapeHtml(
    String(booking.booking_number || booking.id),
  );
  const resolvedEventDate = escapeHtml(String(booking.event_date || ""));
  const resolvedEventStart = escapeHtml(
    String(booking.event_start_time || ""),
  );
  const resolvedEventEnd = escapeHtml(String(booking.event_end_time || ""));
  const resolvedSetupAddress = escapeHtml(
    String(booking.setup_address || ""),
  );
  const resolvedSetupCity = escapeHtml(String(booking.setup_city || ""));
  const resolvedSetupState = escapeHtml(String(booking.setup_state || ""));
  const resolvedSetupZip = escapeHtml(String(booking.setup_zip || ""));
  const resolvedSubtotal = Number(booking.subtotal || 0).toFixed(2);
  const resolvedDiscount = Number(booking.discount_amount || 0).toFixed(2);
  const resolvedDelivery = Number(booking.delivery_fee || 0).toFixed(2);
  const resolvedTax = Number(booking.tax_amount || 0).toFixed(2);
  const resolvedTotal = Number(booking.total_amount || 0).toFixed(2);
  const resolvedDeposit = Number(booking.deposit_amount || 0).toFixed(2);
  const resolvedBalance = Number(booking.balance_due || 0).toFixed(2);

  const orderInfoBlock = buildOrderSummaryHtml({
    customerName: resolvedCustomerName,
    customerEmail: resolvedCustomerEmail,
    bookingNumber: resolvedBookingNumber,
    eventDate: resolvedEventDate,
    eventStartTime: resolvedEventStart,
    eventEndTime: resolvedEventEnd,
    setupAddress: resolvedSetupAddress,
    setupCity: resolvedSetupCity,
    setupState: resolvedSetupState,
    setupZip: resolvedSetupZip,
    itemSummary,
    subtotal: resolvedSubtotal,
    discountAmount: resolvedDiscount,
    deliveryFee: resolvedDelivery,
    taxAmount: resolvedTax,
    totalAmount: resolvedTotal,
    depositAmount: resolvedDeposit,
    balanceDue: resolvedBalance,
  });

  const values: Record<string, string> = {
    customer_name: resolvedCustomerName,
    customer_email: resolvedCustomerEmail,
    booking_number: resolvedBookingNumber,
    event_date: resolvedEventDate,
    event_start_time: resolvedEventStart,
    event_end_time: resolvedEventEnd,
    setup_address: resolvedSetupAddress,
    setup_city: resolvedSetupCity,
    setup_state: resolvedSetupState,
    setup_zip: resolvedSetupZip,
    items_summary: itemSummary,
    subtotal: resolvedSubtotal,
    discount_amount: resolvedDiscount,
    delivery_fee: resolvedDelivery,
    tax_amount: resolvedTax,
    total_amount: resolvedTotal,
    deposit_amount: resolvedDeposit,
    balance_due: resolvedBalance,
    signature_label: escapeHtml(String(contractSettings?.signature_label || "Client signature")),
    signature_name: escapeHtml(signerName),
    signature_manual: `<img src="${signatureDataUrl}" alt="Manual signature" style="display:block;max-width:280px;height:auto;border-bottom:1px solid #d8cec0;padding-bottom:2px;" />`,
    signature_date: signerDate,
  };

  const renderedTemplate = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? "");
  const renderedHtml = `${orderInfoBlock}${renderedTemplate}`;
  const documentHash = createHash("sha256").update(renderedHtml).digest("hex");

  const { data: signResult, error: signError } = await supabase.rpc(
    "sign_temporary_booking_contract",
    {
      p_booking_id: bookingId,
      p_signer_name: signerName,
      p_rendered_html: renderedHtml,
      p_document_hash: documentHash,
      p_signature_image_data_url: signatureDataUrl,
    },
  );

  if (signError) {
    redirect(`/account/bookings/${bookingId}?complete=1&error=${encodeURIComponent(signError.message)}`);
  }

  const signed = signResult as { success?: boolean; status?: string } | null;
  if (!signed?.success) {
    redirect(`/account/bookings/${bookingId}?complete=1&status=${encodeURIComponent(signed?.status || "sign_failed")}`);
  }

  revalidatePath(`/account/bookings/${bookingId}`);
  redirect(`/account/bookings/${bookingId}?complete=1&signed=1`);
}

export async function recordTemporaryBookingDepositAction(formData: FormData) {
  const bookingId = text(formData, "bookingId");
  const supabase = await createClient();
  const MAX_CUSTOMER_TIP_CENTS = 1000 * 100;

  const toCents = (value: number | string | null | undefined) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.round(numeric * 100));
  };

  const fromCents = (value: number) => Number((value / 100).toFixed(2));

  const rawTip = text(formData, "tipAmount");
  const parsedTip = rawTip === "" ? 0 : Number(rawTip);

  if (!bookingId || !Number.isFinite(parsedTip) || parsedTip < 0) {
    redirect(`/account/bookings/${bookingId}?complete=1&status=invalid_payment`);
  }

  const tipCents = Math.round(parsedTip * 100);

  if (tipCents > MAX_CUSTOMER_TIP_CENTS) {
    redirect(`/account/bookings/${bookingId}?complete=1&status=invalid_payment`);
  }

  const bookingStateResult = await supabase.rpc(
    "get_my_booking_authoritative_state",
    {
      p_booking_id: bookingId,
    },
  );

  const bookingState =
    bookingStateResult.error ||
    !bookingStateResult.data ||
    typeof bookingStateResult.data !== "object" ||
    Array.isArray(bookingStateResult.data)
      ? null
      : (bookingStateResult.data as {
          booking?: {
            id?: string;
            booking_number?: string | null;
            deposit_amount?: number | string | null;
            amount_paid?: number | string | null;
            balance_due?: number | string | null;
            booking_source?: string | null;
          } | null;
        });

  const booking = bookingState?.booking || null;

  if (!booking?.id) {
    redirect(`/account/bookings/${bookingId}?complete=1&status=booking_not_found`);
  }

  if (String(booking.booking_source || "") !== "admin") {
    redirect(`/account/bookings/${bookingId}?complete=1&status=unsupported_flow`);
  }

  const depositAmountCents = toCents(booking.deposit_amount);
  const amountPaidCents = toCents(booking.amount_paid);
  const balanceDueCents = toCents(booking.balance_due);
  const depositDueCents = Math.min(
    balanceDueCents,
    Math.max(0, depositAmountCents - amountPaidCents),
  );

  if (depositDueCents <= 0) {
    redirect(`/account/bookings/${bookingId}?complete=1&status=deposit_already_paid`);
  }

  const depositDueAmount = fromCents(depositDueCents);
  const tipAmount = fromCents(tipCents);
  const stripeChargeAmount = fromCents(depositDueCents + tipCents);

  const checkoutSessionMinutes = getTemporaryCheckoutSessionMinutes();
  const holdBufferMinutes = getTemporaryCheckoutHoldBufferMinutes();

  const acquireResult = await supabase.rpc(
    "acquire_booking_temporary_inventory_hold",
    {
      p_booking_id: bookingId,
      p_attempt_kind: "customer_temporary_deposit",
      p_hold_minutes: checkoutSessionMinutes + holdBufferMinutes,
      p_require_active_completion_session: true,
    },
  );

  if (acquireResult.error) {
    if (
      isMissingFunctionError(
        acquireResult.error,
        "acquire_booking_temporary_inventory_hold",
      )
    ) {
      redirect(`/account/bookings/${bookingId}?complete=1&status=inventory_hold_migration_required`);
    }

    redirect(
      `/account/bookings/${bookingId}?complete=1&status=${encodeURIComponent(
        `inventory_unavailable:${acquireResult.error.message}`,
      )}`,
    );
  }

  const acquirePayload =
    acquireResult.data &&
    typeof acquireResult.data === "object" &&
    !Array.isArray(acquireResult.data)
      ? (acquireResult.data as {
          status?: string;
          message?: string;
          attempt_id?: string;
          stripe_checkout_session_id?: string | null;
        })
      : null;

  const acquireStatus = String(acquirePayload?.status || "").trim();
  const checkoutAttemptId = String(acquirePayload?.attempt_id || "").trim();
  const existingStripeSessionId = String(acquirePayload?.stripe_checkout_session_id || "").trim();

  const resumeExistingStripeCheckout = async (attemptId: string, sessionId: string) => {
    let existingSession: Awaited<ReturnType<typeof retrieveStripeCheckoutSession>> | null = null;

    try {
      existingSession = await retrieveStripeCheckoutSession(sessionId);
    } catch {
      existingSession = null;
    }

    const sessionStatus = String(existingSession?.status || "").trim();
    const sessionUrl = String(existingSession?.url || "").trim();

    if (sessionStatus === "open" && sessionUrl) {
      redirect(sessionUrl);
    }

    if (sessionStatus === "expired") {
      await supabase.rpc("release_booking_checkout_attempt_hold", {
        p_booking_id: bookingId,
        p_attempt_id: attemptId,
        p_stripe_checkout_session_id: sessionId,
        p_reason: "stripe_checkout_session_not_open",
      });

      redirect(`/account/bookings/${bookingId}?complete=1&status=payment_session_expired_retry`);
    }

    redirect(`/account/bookings/${bookingId}?complete=1&status=payment_reconciliation_required`);
  };

  if (acquireStatus === "completion_session_invalid") {
    redirect(`/account/bookings/${bookingId}?complete=1&status=completion_session_invalid`);
  }

  if (
    (acquireStatus === "ok" || acquireStatus === "stripe_attempt_active")
    && checkoutAttemptId
  ) {
    if (existingStripeSessionId) {
      await resumeExistingStripeCheckout(checkoutAttemptId, existingStripeSessionId);
    }

    if (acquireStatus === "stripe_attempt_active") {
      redirect(`/account/bookings/${bookingId}?complete=1&status=payment_reconciliation_required`);
    }
  } else {
    redirect(
      `/account/bookings/${bookingId}?complete=1&status=${encodeURIComponent(
        `inventory_unavailable:${acquirePayload?.status || acquirePayload?.message || "unknown"}`,
      )}`,
    );
  }

  const stripeExpiresAt = minutesFromNowToUnixSeconds(
    checkoutSessionMinutes,
  );

  let session: { id: string; url: string };

  try {
    session = await createStripeCheckoutSession({
      bookingId,
      amount: stripeChargeAmount,
      baseAmount: depositDueAmount,
      tipAmount,
      source: "customer_temporary_deposit",
      successPath: `/account/bookings/${bookingId}?complete=1`,
      cancelPath: `/account/bookings/${bookingId}?complete=1`,
      expiresAt: stripeExpiresAt,
      description: `Bounce Party LA deposit ${booking.booking_number || String(bookingId).slice(0, 8)}`,
      metadata: {
        flow: "admin_temporary_completion",
        checkout_method: "stripe",
        booking_checkout_attempt_id: checkoutAttemptId,
      },
    });
  } catch (stripeError) {
    await supabase.rpc("release_booking_checkout_attempt_hold", {
      p_booking_id: bookingId,
      p_attempt_id: checkoutAttemptId,
      p_reason: "stripe_checkout_session_create_failed",
    });

    const message = stripeError instanceof Error ? stripeError.message : "stripe_session_create_failed";
    redirect(`/account/bookings/${bookingId}?complete=1&status=${encodeURIComponent(`payment_unavailable:${message}`)}`);
  }

  const bindResult = await supabase.rpc("bind_booking_checkout_attempt_to_stripe_session", {
    p_booking_id: bookingId,
    p_attempt_id: checkoutAttemptId,
    p_stripe_checkout_session_id: session.id,
    p_stripe_expires_at: new Date(stripeExpiresAt * 1000).toISOString(),
  });

  const bindPayload =
    bindResult.data && typeof bindResult.data === "object" && !Array.isArray(bindResult.data)
      ? (bindResult.data as { status?: string })
      : null;

  if (bindResult.error || bindPayload?.status !== "ok") {
    await supabase.rpc("release_booking_checkout_attempt_hold", {
      p_booking_id: bookingId,
      p_attempt_id: checkoutAttemptId,
      p_stripe_checkout_session_id: session.id,
      p_reason: "stripe_checkout_bind_failed",
    });

    const bindErrorMessage = bindResult.error?.message || bindPayload?.status || "bind_failed";
    redirect(`/account/bookings/${bookingId}?complete=1&status=${encodeURIComponent(`payment_unavailable:${bindErrorMessage}`)}`);
  }

  revalidatePath(`/account/bookings/${bookingId}`);
  redirect(session.url);
}

export async function finalizeTemporaryBookingAction(formData: FormData) {
  const bookingId = text(formData, "bookingId");
  revalidatePath(`/account/bookings/${bookingId}`);
  redirect(`/account/bookings/${bookingId}?complete=1&status=payment_reconciliation_required`);
}

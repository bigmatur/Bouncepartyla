"use server";

import { redirect } from "next/navigation";
import { requireCustomerAccess } from "@/lib/auth/require-customer";
import {
  createStripeCheckoutSession,
  retrieveStripeCheckoutSession,
} from "@/lib/payments/stripe";
import {
  getTemporaryCheckoutHoldBufferMinutes,
  getTemporaryCheckoutSessionMinutes,
  minutesFromNowToUnixSeconds,
} from "@/lib/booking/temporary-hold-config";

function toCents(value: number | string | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 100));
}

function fromCents(value: number) {
  return Number((value / 100).toFixed(2));
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

export async function payCustomerBookingBalanceByCardAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId") || "").trim();
  if (!bookingId) throw new Error("Booking ID is required.");

  const { supabase, access } = await requireCustomerAccess();
  const result = await supabase
    .from("bookings")
    .select("id, booking_number, balance_due, status, booking_source, customer_approval_state")
    .eq("id", bookingId)
    .maybeSingle();

  if (result.error || !result.data) {
    throw new Error("Booking not found or not available for this customer.");
  }

  const bookingStatus = String((result.data as any).status || "").toLowerCase();
  const bookingSource = String((result.data as any).booking_source || "").toLowerCase();
  const approvalState = String((result.data as any).customer_approval_state || "").toLowerCase();

  if (
    bookingSource === "customer_self_service" &&
    bookingStatus === "pending_deposit"
  ) {
    if (approvalState !== "approved") {
      redirect(`/account/bookings/${bookingId}?approval=${encodeURIComponent(approvalState || "pending")}`);
    }

    redirect(`/account/bookings/${bookingId}?approval=approved`);
  }

  const balanceDue = Math.max(0, Number((result.data as any).balance_due || 0));
  if (balanceDue <= 0) {
    redirect(`/account/bookings/${bookingId}`);
  }

  const session = await createStripeCheckoutSession({
    bookingId,
    amount: balanceDue,
    baseAmount: balanceDue,
    tipAmount: 0,
    customerEmail: access.user?.email || null,
    source: "customer_checkout",
    successPath: `/account/bookings/${bookingId}`,
    cancelPath: `/account/bookings/${bookingId}`,
    description: `Bounce Party LA balance ${(result.data as any).booking_number || String(bookingId).slice(0, 8)}`,
  });

  redirect(session.url);
}

export async function payApprovedCustomerBookingDepositAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId") || "").trim();
  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  const { supabase, access } = await requireCustomerAccess();

  const result = await supabase
    .from("bookings")
    .select("id, booking_number, status, booking_source, customer_approval_state, customer_approval_revision, customer_approval_expires_at, deposit_amount, amount_paid, balance_due")
    .eq("id", bookingId)
    .maybeSingle();

  if (result.error || !result.data) {
    throw new Error("Booking not found or not available for this customer.");
  }

  const booking = result.data as any;
  const source = String(booking.booking_source || "").toLowerCase();
  const status = String(booking.status || "").toLowerCase();
  const approvalState = String(booking.customer_approval_state || "").toLowerCase();

  if (source !== "customer_self_service" || status !== "pending_deposit") {
    redirect(`/account/bookings/${bookingId}`);
  }

  if (approvalState !== "approved") {
    redirect(`/account/bookings/${bookingId}?approval=${encodeURIComponent(approvalState || "pending")}`);
  }

  const holdState = await supabase.rpc("get_my_action_required_booking_hold_state", {
    p_booking_ids: [bookingId],
  });

  if (holdState.error) {
    throw new Error(holdState.error.message);
  }

  const holdRow = Array.isArray(holdState.data)
    ? (holdState.data as Array<{ booking_id?: string; has_active_hold?: boolean }>).find(
        (row) => String(row.booking_id || "") === bookingId,
      )
    : null;

  if (!holdRow?.has_active_hold) {
    redirect(`/account/bookings/${bookingId}?approval=expired`);
  }

  const checkoutSessionMinutes = getTemporaryCheckoutSessionMinutes();
  const holdBufferMinutes = getTemporaryCheckoutHoldBufferMinutes();
  const minimumWindowSeconds = (checkoutSessionMinutes + holdBufferMinutes) * 60;
  const approvalExpiresAtMs = Date.parse(String(booking.customer_approval_expires_at || ""));

  if (!Number.isFinite(approvalExpiresAtMs)) {
    redirect(`/account/bookings/${bookingId}?approval=expired`);
  }

  const depositAmountCents = toCents(booking.deposit_amount);
  const amountPaidCents = toCents(booking.amount_paid);
  const balanceDueCents = toCents(booking.balance_due);
  const depositDueCents = Math.min(
    balanceDueCents,
    Math.max(0, depositAmountCents - amountPaidCents),
  );

  if (depositDueCents <= 0) {
    const complete = await supabase.rpc("complete_customer_booking_checkout", {
      p_booking_id: bookingId,
      p_amount: 0,
      p_method: "stripe",
      p_payment_reference: null,
    });

    if (complete.error) {
      throw new Error(complete.error.message);
    }

    const completePayload = (Array.isArray(complete.data)
      ? complete.data[0]
      : complete.data) as
      | { success?: boolean; status?: string }
      | null;

    if (!completePayload?.success || completePayload.status !== "confirmed") {
      throw new Error(`complete_customer_booking_checkout failed: ${completePayload?.status || "unknown"}`);
    }

    redirect(`/account/bookings/${bookingId}`);
  }

  const acquireResult = await supabase.rpc("acquire_booking_temporary_inventory_hold", {
    p_booking_id: bookingId,
    p_attempt_kind: "customer_temporary_deposit",
    p_hold_minutes: checkoutSessionMinutes + holdBufferMinutes,
    p_require_active_completion_session: false,
  });

  if (acquireResult.error) {
    if (isMissingFunctionError(acquireResult.error, "acquire_booking_temporary_inventory_hold")) {
      redirect(`/account/bookings/${bookingId}?approval=migration-required`);
    }

    redirect(`/account/bookings/${bookingId}?approval=inventory-unavailable`);
  }

  const acquirePayload =
    acquireResult.data && typeof acquireResult.data === "object" && !Array.isArray(acquireResult.data)
      ? (acquireResult.data as {
          status?: string;
          attempt_id?: string;
          stripe_checkout_session_id?: string | null;
        })
      : null;

  const acquireStatus = String(acquirePayload?.status || "");
  const checkoutAttemptId = String(acquirePayload?.attempt_id || "");
  const existingStripeSessionId = String(acquirePayload?.stripe_checkout_session_id || "");

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

      redirect(`/account/bookings/${bookingId}?approval=expired`);
    }

    redirect(`/account/bookings/${bookingId}?approval=reconciliation-required`);
  };

  if ((acquireStatus === "ok" || acquireStatus === "stripe_attempt_active") && checkoutAttemptId) {
    if (existingStripeSessionId) {
      await resumeExistingStripeCheckout(checkoutAttemptId, existingStripeSessionId);
    }

    if (acquireStatus === "stripe_attempt_active") {
      redirect(`/account/bookings/${bookingId}?approval=reconciliation-required`);
    }
  } else {
    redirect(`/account/bookings/${bookingId}?approval=inventory-unavailable`);
  }

  const persistedAttemptResult = await supabase
    .from("booking_checkout_attempts")
    .select("id, hold_expires_at")
    .eq("id", checkoutAttemptId)
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (persistedAttemptResult.error || !persistedAttemptResult.data) {
    await supabase.rpc("release_booking_checkout_attempt_hold", {
      p_booking_id: bookingId,
      p_attempt_id: checkoutAttemptId,
      p_reason: "attempt_lookup_failed_after_acquire",
    });

    redirect(`/account/bookings/${bookingId}?approval=inventory-unavailable`);
  }

  const attemptHoldExpiresAtMs = Date.parse(String((persistedAttemptResult.data as any).hold_expires_at || ""));

  if (!Number.isFinite(attemptHoldExpiresAtMs)) {
    await supabase.rpc("release_booking_checkout_attempt_hold", {
      p_booking_id: bookingId,
      p_attempt_id: checkoutAttemptId,
      p_reason: "attempt_hold_expiry_invalid",
    });

    redirect(`/account/bookings/${bookingId}?approval=expired`);
  }

  const effectiveWindowEndMs = Math.min(approvalExpiresAtMs, attemptHoldExpiresAtMs);

  if (effectiveWindowEndMs - Date.now() < minimumWindowSeconds * 1000) {
    await supabase.rpc("release_booking_checkout_attempt_hold", {
      p_booking_id: bookingId,
      p_attempt_id: checkoutAttemptId,
      p_reason: "approval_window_too_short_for_checkout",
    });

    redirect(`/account/bookings/${bookingId}?approval=window-too-short`);
  }

  const stripeExpiresAt = Math.floor(
    Math.min(
      minutesFromNowToUnixSeconds(checkoutSessionMinutes),
      (effectiveWindowEndMs - holdBufferMinutes * 60 * 1000) / 1000,
    ),
  );

  if (stripeExpiresAt <= Math.floor(Date.now() / 1000) + 60) {
    await supabase.rpc("release_booking_checkout_attempt_hold", {
      p_booking_id: bookingId,
      p_attempt_id: checkoutAttemptId,
      p_reason: "approval_window_too_short_for_stripe_session",
    });

    redirect(`/account/bookings/${bookingId}?approval=window-too-short`);
  }

  let session: { id: string; url: string };

  try {
    session = await createStripeCheckoutSession({
      bookingId,
      amount: fromCents(depositDueCents),
      baseAmount: fromCents(depositDueCents),
      tipAmount: 0,
      customerEmail: access.user?.email || null,
      source: "customer_temporary_deposit",
      successPath: `/account/bookings/${bookingId}`,
      cancelPath: `/account/bookings/${bookingId}`,
      expiresAt: stripeExpiresAt,
      description: `Bounce Party LA deposit ${booking.booking_number || String(bookingId).slice(0, 8)}`,
      metadata: {
        flow: "customer_approved_deposit",
        booking_checkout_attempt_id: checkoutAttemptId,
        customer_approval_revision: String((booking as any).customer_approval_revision || 0),
      },
    });
  } catch (stripeError) {
    await supabase.rpc("release_booking_checkout_attempt_hold", {
      p_booking_id: bookingId,
      p_attempt_id: checkoutAttemptId,
      p_reason: "stripe_checkout_session_create_failed",
    });

    const message = stripeError instanceof Error ? stripeError.message : "stripe_session_create_failed";
    redirect(`/account/bookings/${bookingId}?approval=${encodeURIComponent(`payment-unavailable:${message}`)}`);
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
    redirect(`/account/bookings/${bookingId}?approval=${encodeURIComponent(`payment-unavailable:${bindErrorMessage}`)}`);
  }

  redirect(session.url);
}

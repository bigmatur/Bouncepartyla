"use server";

import { redirect } from "next/navigation";
import { requireCustomerAccess } from "@/lib/auth/require-customer";
import {
  createStripeCheckoutSession,
  getApplicationOrigin,
  retrieveStripeCheckoutSession,
} from "@/lib/payments/stripe";
import {
  type CustomerApprovalReason,
  evaluateCustomerBookingApproval,
  requestCustomerBookingApproval,
} from "@/lib/booking/customer-approval";
import {
  enqueueBookingNotification,
  enqueueStaffBookingNotification,
  processNotificationQueueBestEffort,
} from "@/lib/notifications/engine";
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

async function expireCustomerApprovalAndRedirect(params: {
  supabase: any;
  bookingId: string;
  approvalRevision: number;
  reason: string;
}): Promise<never> {
  let shouldNotifyExpired = false;

  try {
    const expireResult = await params.supabase.rpc(
      "expire_customer_booking_approval_if_needed",
      {
        p_booking_id: params.bookingId,
        p_reason: params.reason,
      },
    );

    if (expireResult.error) {
      console.error("Failed to expire customer approval before redirect", {
        bookingId: params.bookingId,
        reason: params.reason,
        message: expireResult.error.message,
        code: expireResult.error.code,
      });
    } else {
      const payload =
        expireResult.data && typeof expireResult.data === "object" && !Array.isArray(expireResult.data)
          ? (expireResult.data as { success?: boolean; status?: string })
          : null;

      shouldNotifyExpired = payload?.success === true && payload.status === "expired";
    }
  } catch (error) {
    console.error("Unexpected approval expiry normalization error", {
      bookingId: params.bookingId,
      reason: params.reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (shouldNotifyExpired) {
    try {
      const dedupeSuffix =
        params.approvalRevision > 0
          ? `revision-${params.approvalRevision}`
          : "approval-expired";

      await enqueueBookingNotification({
        eventCode: "customer_booking_approval_expired",
        bookingId: params.bookingId,
        dedupeSuffix,
        payload: {},
      });

      await processNotificationQueueBestEffort({
        bookingId: params.bookingId,
        limit: 10,
      });
    } catch (notifyError) {
      console.error("Failed to enqueue approval-expired notification", {
        bookingId: params.bookingId,
        error: notifyError instanceof Error ? notifyError.message : String(notifyError),
      });
    }
  }

  redirect(`/account/bookings/${params.bookingId}?approval=expired`);
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
  const approvalRevision = Math.max(0, Number(booking.customer_approval_revision || 0));

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
    await expireCustomerApprovalAndRedirect({
      supabase,
      bookingId,
      approvalRevision,
      reason: "customer_checkout_no_active_hold",
    });
  }

  const checkoutSessionMinutes = getTemporaryCheckoutSessionMinutes();
  const holdBufferMinutes = getTemporaryCheckoutHoldBufferMinutes();
  const minimumWindowSeconds = (checkoutSessionMinutes + holdBufferMinutes) * 60;
  const approvalExpiresAtMs = Date.parse(String(booking.customer_approval_expires_at || ""));

  if (!Number.isFinite(approvalExpiresAtMs)) {
    await expireCustomerApprovalAndRedirect({
      supabase,
      bookingId,
      approvalRevision,
      reason: "customer_checkout_invalid_approval_expiry",
    });
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
          hold_expires_at?: string | null;
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

      await expireCustomerApprovalAndRedirect({
        supabase,
        bookingId,
        approvalRevision,
        reason: "stripe_checkout_session_expired",
      });
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

  const attemptHoldExpiresAtMs = Date.parse(String(acquirePayload?.hold_expires_at || ""));

  if (!Number.isFinite(attemptHoldExpiresAtMs)) {
    await supabase.rpc("release_booking_checkout_attempt_hold", {
      p_booking_id: bookingId,
      p_attempt_id: checkoutAttemptId,
      p_reason: "attempt_hold_expiry_invalid",
    });

    await expireCustomerApprovalAndRedirect({
      supabase,
      bookingId,
      approvalRevision,
      reason: "customer_checkout_attempt_hold_invalid",
    });
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

export async function requestCustomerBookingApprovalAgainAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId") || "").trim();

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  const { supabase } = await requireCustomerAccess();

  const bookingResult = await supabase
    .from("bookings")
    .select(
      "id, booking_number, status, booking_source, customer_approval_state, customer_approval_revision, customer_approval_reasons, customer_approval_expires_at, event_date, event_start_time, event_end_time, setup_address, setup_city, setup_zip, amount_paid, payment_status",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingResult.error || !bookingResult.data) {
    throw new Error("Booking not found or not available for this customer.");
  }

  const booking = bookingResult.data as any;
  const bookingSource = String(booking.booking_source || "").toLowerCase();
  const bookingStatus = String(booking.status || "").toLowerCase();
  const approvalState = String(booking.customer_approval_state || "").toLowerCase();
  const paymentStatus = String(booking.payment_status || "").toLowerCase();
  const amountPaid = Math.max(0, Number(booking.amount_paid || 0));
  const approvalExpiresAtMs = Date.parse(String(booking.customer_approval_expires_at || ""));
  const approvalRevision = Math.max(0, Number(booking.customer_approval_revision || 0));

  if (bookingSource !== "customer_self_service" || bookingStatus !== "pending_deposit") {
    redirect(`/account/bookings/${bookingId}`);
  }

  if (paymentStatus === "paid" || paymentStatus === "partial" || amountPaid > 0) {
    redirect(`/account/bookings/${bookingId}`);
  }

  const isExpiredByTime =
    approvalState === "approved" &&
    Number.isFinite(approvalExpiresAtMs) &&
    approvalExpiresAtMs <= Date.now();
  const isExpiredLike = approvalState === "expired" || isExpiredByTime;

  if (!isExpiredLike) {
    redirect(`/account/bookings/${bookingId}?approval=${encodeURIComponent(approvalState || "pending")}`);
  }

  const modifierRows = await supabase
    .from("booking_modifiers")
    .select("modifier_group_option_id")
    .eq("booking_id", bookingId);

  if (modifierRows.error) {
    console.error("Approval re-request modifier lookup failed", {
      bookingId,
      message: modifierRows.error.message,
      code: modifierRows.error.code,
    });
    redirect(`/account/bookings/${bookingId}?approval=recheck-error`);
  }

  const selectedModifierOptionIds = modifierRows.error
    ? []
    : Array.from(
        new Set(
          (modifierRows.data || [])
            .map((row: any) => String(row.modifier_group_option_id || "").trim())
            .filter(Boolean),
        ),
      );

  let evaluation: Awaited<ReturnType<typeof evaluateCustomerBookingApproval>>;
  try {
    evaluation = await evaluateCustomerBookingApproval({
      supabase,
      eventDate: String(booking.event_date || ""),
      eventStartTime: String(booking.event_start_time || "") || undefined,
      selectedModifierOptionIds,
      bookingId,
    });
  } catch (evaluationError) {
    console.error("Approval re-request evaluation failed", {
      bookingId,
      error: evaluationError instanceof Error ? evaluationError.message : String(evaluationError),
    });
    redirect(`/account/bookings/${bookingId}?approval=recheck-error`);
  }

  if (!evaluation.ok || evaluation.configErrors.length > 0) {
    console.error("Approval re-request blocked by invalid approval configuration", {
      bookingId,
      configErrors: evaluation.configErrors,
    });
    redirect(`/account/bookings/${bookingId}?approval=recheck-error`);
  }

  if (!evaluation.requiresApproval) {
    redirect(`/account/bookings/${bookingId}?approval=recheck-not-required`);
  }

  if (evaluation.reasons.length === 0) {
    console.error("Approval re-request returned requiresApproval without reasons", {
      bookingId,
    });
    redirect(`/account/bookings/${bookingId}?approval=recheck-error`);
  }

  const effectiveReasons = evaluation.reasons;

  const snapshot = {
    event_date: String(booking.event_date || ""),
    event_start_time: booking.event_start_time || null,
    event_end_time: booking.event_end_time || null,
    setup_address: booking.setup_address || null,
    setup_city: booking.setup_city || null,
    setup_zip: booking.setup_zip || null,
    reasons: effectiveReasons,
    selected_modifier_option_ids: selectedModifierOptionIds,
    source: "customer_re_request_after_expiry",
  };

  const approvalRequest = await requestCustomerBookingApproval({
    supabase,
    bookingId,
    reasons: effectiveReasons,
    snapshot,
  });

  const nextRevision = Math.max(approvalRevision + 1, Number(approvalRequest.revision || 0));
  const dedupeSuffix = nextRevision > 0 ? `revision-${nextRevision}` : "revision-current";
  const applicationOrigin = await getApplicationOrigin();
  const adminBookingUrl = `${applicationOrigin}/admin/bookings/${bookingId}`;

  try {
    await Promise.all([
      enqueueBookingNotification({
        eventCode: "customer_booking_approval_requested",
        bookingId,
        dedupeSuffix,
        payload: {
          action_url: `${applicationOrigin}/account/bookings/${bookingId}`,
          approval_revision: nextRevision > 0 ? nextRevision : null,
        },
      }),
      enqueueStaffBookingNotification({
        eventCode: "customer_booking_approval_requested",
        bookingId,
        recipientRole: "admin",
        dedupeSuffix,
        payload: {
          action_url: adminBookingUrl,
          approval_revision: nextRevision > 0 ? nextRevision : null,
        },
      }),
      enqueueStaffBookingNotification({
        eventCode: "customer_booking_approval_requested",
        bookingId,
        recipientRole: "manager",
        dedupeSuffix,
        payload: {
          action_url: adminBookingUrl,
          approval_revision: nextRevision > 0 ? nextRevision : null,
        },
      }),
    ]);

    await processNotificationQueueBestEffort({
      bookingId,
      limit: 20,
    });
  } catch (notifyError) {
    console.error("Failed to enqueue re-request approval notifications", {
      bookingId,
      error: notifyError instanceof Error ? notifyError.message : String(notifyError),
    });
  }

  redirect(`/account/bookings/${bookingId}?approval=pending`);
}

export async function requestCustomerBookingCancellationAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId") || "").trim();
  const reason = String(formData.get("reason") || "").trim();
  const customerComment = String(formData.get("customerComment") || "").trim();

  if (!bookingId) {
    redirect("/account?cancellation=error");
  }

  if (!reason) {
    redirect(`/account/bookings/${bookingId}?cancellation=error`);
  }

  const { supabase } = await requireCustomerAccess();

  const requestResult = await supabase.rpc("request_my_booking_cancellation", {
    p_booking_id: bookingId,
    p_reason: reason,
    p_customer_comment: customerComment || null,
  });

  if (requestResult.error) {
    if (isMissingFunctionError(requestResult.error, "request_my_booking_cancellation")) {
      redirect(`/account/bookings/${bookingId}?cancellation=not-available`);
    }

    console.error("Customer cancellation request RPC failed", {
      bookingId,
      message: requestResult.error.message,
      code: requestResult.error.code,
    });

    redirect(`/account/bookings/${bookingId}?cancellation=error`);
  }

  const payload =
    requestResult.data && typeof requestResult.data === "object" && !Array.isArray(requestResult.data)
      ? (requestResult.data as {
          success?: boolean;
          status?: string;
          revision?: number;
          idempotent?: boolean;
        })
      : null;

  const status = String(payload?.status || "").toLowerCase();
  const revision = Number(payload?.revision || 0);
  const isIdempotentPending = payload?.idempotent === true;

  if (payload?.success === true && status === "pending") {
    if (!isIdempotentPending) {
      const dedupeSuffix = revision > 0 ? `revision-${revision}` : "revision-current";
      const applicationOrigin = await getApplicationOrigin();
      const adminBookingUrl = `${applicationOrigin}/admin/bookings/${bookingId}`;

      try {
        await Promise.all([
          enqueueStaffBookingNotification({
            eventCode: "customer_booking_cancellation_requested",
            bookingId,
            recipientRole: "admin",
            dedupeSuffix,
            payload: {
              action_url: adminBookingUrl,
              cancellation_revision: revision > 0 ? revision : null,
            },
          }),
          enqueueStaffBookingNotification({
            eventCode: "customer_booking_cancellation_requested",
            bookingId,
            recipientRole: "manager",
            dedupeSuffix,
            payload: {
              action_url: adminBookingUrl,
              cancellation_revision: revision > 0 ? revision : null,
            },
          }),
        ]);

        await processNotificationQueueBestEffort({
          bookingId,
          limit: 20,
        });
      } catch (notifyError) {
        console.error("Failed to enqueue cancellation-requested staff notifications", {
          bookingId,
          revision,
          error: notifyError instanceof Error ? notifyError.message : String(notifyError),
        });
      }
    }

    redirect(`/account/bookings/${bookingId}?cancellation=pending`);
  }

  if (
    status === "already_approved" ||
    status === "booking_not_cancellable_requestable" ||
    status === "booking_not_found" ||
    status === "forbidden"
  ) {
    redirect(`/account/bookings/${bookingId}?cancellation=not-available`);
  }

  redirect(`/account/bookings/${bookingId}?cancellation=error`);
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  enqueueStaffBookingNotification,
  processNotificationQueueBestEffort,
} from "@/lib/notifications/engine";

export const dynamic = "force-dynamic";

type PaymentNotCollectedReason =
  | "customer_will_pay_later"
  | "customer_not_available"
  | "online_payment_pending"
  | "payment_issue"
  | "other";

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function forbidden(message = "Access denied") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

function parseReason(value: unknown): PaymentNotCollectedReason | null {
  const reason = String(value || "").trim().toLowerCase();

  if (
    reason === "customer_will_pay_later" ||
    reason === "customer_not_available" ||
    reason === "online_payment_pending" ||
    reason === "payment_issue" ||
    reason === "other"
  ) {
    return reason;
  }

  return null;
}

function reasonLabel(reason: PaymentNotCollectedReason) {
  if (reason === "customer_will_pay_later") return "Customer Will Pay Later";
  if (reason === "customer_not_available") return "Customer Not Available";
  if (reason === "online_payment_pending") return "Online Payment Pending";
  if (reason === "payment_issue") return "Payment Issue";
  return "Other";
}

function stopTypeLabel(value: unknown) {
  const stopType = String(value || "").trim().toLowerCase();
  return stopType === "pickup" ? "Pickup" : "Delivery";
}

function isBlockedRouteStopStatus(status: unknown) {
  const value = String(status || "").trim().toLowerCase();
  return (
    value === "cancelled" ||
    value === "failed" ||
    value === "installed" ||
    value === "picked_up" ||
    value === "completed"
  );
}

function isIneligibleBookingStatus(status: unknown) {
  const value = String(status || "").trim().toLowerCase();
  return value === "cancelled" || value === "closed" || value === "refunded";
}

function money(amount: number) {
  return `$${amount.toFixed(2)}`;
}

async function authenticate(request: Request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return { response: unauthorized() } as const;

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!url || !anonKey) {
    return {
      response: NextResponse.json(
        { success: false, error: "Server Supabase configuration is missing." },
        { status: 500 },
      ),
    } as const;
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const userResult = await supabase.auth.getUser(token);

  if (userResult.error || !userResult.data.user) {
    return { response: unauthorized("Invalid or expired session.") } as const;
  }

  const driverResult = await supabase
    .from("route_drivers")
    .select("id, name")
    .eq("auth_user_id", userResult.data.user.id)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (driverResult.error || !driverResult.data?.name) {
    return {
      response: forbidden("An active linked driver account is required."),
    } as const;
  }

  return {
    supabase,
  } as const;
}

export async function POST(request: Request) {
  const auth = await authenticate(request);

  if ("response" in auth) {
    return auth.response;
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const stopId = String(body.stopId || "").trim();
  const reason = parseReason(body.reason);
  const commentRaw = String(body.comment || "").trim();
  const comment = commentRaw || null;

  if (!stopId) {
    return NextResponse.json(
      { success: false, error: "Route stop ID is required." },
      { status: 400 },
    );
  }

  if (!reason) {
    return NextResponse.json(
      { success: false, error: "A valid payment-not-collected reason is required." },
      { status: 400 },
    );
  }

  if (reason === "other" && !comment) {
    return NextResponse.json(
      { success: false, error: "Comment is required when reason is Other." },
      { status: 400 },
    );
  }

  const assignedStopResult = await auth.supabase.rpc(
    "get_my_assigned_route_stop",
    { p_stop_id: stopId },
  );

  if (assignedStopResult.error) {
    return NextResponse.json(
      {
        success: false,
        error: String(
          assignedStopResult.error.message ||
            "This route stop is not assigned to your driver account.",
        ),
      },
      { status: 403 },
    );
  }

  const stop = Array.isArray(assignedStopResult.data)
    ? (assignedStopResult.data[0] || null)
    : (assignedStopResult.data || null);

  if (!stop) {
    return NextResponse.json(
      { success: false, error: "Route stop was not found." },
      { status: 404 },
    );
  }

  if (isBlockedRouteStopStatus(stop.status)) {
    return NextResponse.json(
      { success: false, error: "This route stop is not eligible for payment exception reporting." },
      { status: 400 },
    );
  }

  const bookingId = String(stop.booking_id || "").trim();

  if (!bookingId) {
    return NextResponse.json(
      { success: false, error: "This route stop is not linked to a booking." },
      { status: 400 },
    );
  }

  const bookingResult = await auth.supabase
    .from("bookings")
    .select("id, booking_number, status, balance_due")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingResult.error) {
    return NextResponse.json(
      { success: false, error: bookingResult.error.message },
      { status: 400 },
    );
  }

  if (!bookingResult.data) {
    return NextResponse.json(
      { success: false, error: "Booking not found." },
      { status: 404 },
    );
  }

  const booking = bookingResult.data as Record<string, unknown>;

  if (isIneligibleBookingStatus(booking.status)) {
    return NextResponse.json(
      { success: false, error: "This booking is not eligible for payment exception reporting." },
      { status: 400 },
    );
  }

  const authoritativeBalance = Math.max(0, Number(booking.balance_due || 0));

  if (!Number.isFinite(authoritativeBalance)) {
    return NextResponse.json(
      { success: false, error: "Booking balance is invalid." },
      { status: 400 },
    );
  }

  if (authoritativeBalance <= 0) {
    return NextResponse.json({
      success: true,
      data: {
        stopId,
        bookingId,
        reason,
        comment,
        outstandingBalance: 0,
        alreadyReported: false,
        reportStatus: "no_balance_due",
      },
    });
  }

  const reportResult = await auth.supabase.rpc(
    "report_my_route_stop_payment_not_collected",
    {
      p_stop_id: stopId,
      p_reason_code: reason,
      p_reason_comment: comment,
    },
  );

  if (reportResult.error) {
    return NextResponse.json(
      {
        success: false,
        error: String(reportResult.error.message || "Could not report payment exception."),
      },
      { status: 400 },
    );
  }

  const reportData =
    reportResult.data && typeof reportResult.data === "object"
      ? (reportResult.data as Record<string, unknown>)
      : null;

  const reportStatusRaw = String(
    reportData?.report_status || "",
  ).trim();

  const reportStatus:
    | "reported"
    | "already_reported"
    | "no_balance_due" =
    reportStatusRaw === "already_reported"
      ? "already_reported"
      : reportStatusRaw === "no_balance_due"
        ? "no_balance_due"
        : "reported";

  const outstandingAmount = Number(
    reportData?.outstanding_balance ?? authoritativeBalance,
  );

  const reportedAt = String(
    reportData?.reported_at || new Date().toISOString(),
  );

  const alreadyReported = Boolean(reportData?.already_reported) || reportStatus === "already_reported";
  const reasonCode = parseReason(reportData?.reason_code) || reason;

  const persistedCommentRaw = reportData?.reason_comment;
  const reasonComment =
    typeof persistedCommentRaw === "string"
      ? persistedCommentRaw.trim() || null
      : null;

  const stopType = stopTypeLabel(
    reportData?.stop_type ?? stop.stop_type,
  );
  const driverName = String(
    reportData?.driver_name || stop.driver_name || "Driver",
  );
  const reasonText = reasonLabel(reasonCode);

  if (reportStatus !== "no_balance_due") {
    try {
      await Promise.all([
        enqueueStaffBookingNotification({
          eventCode: "payment_not_collected",
          bookingId,
          recipientRole: "admin",
          dedupeSuffix: `driver-${stopId}`,
          payload: {
            route_stop_id: stopId,
            stop_type: stopType,
            driver_name: driverName,
            payment_exception_reason: reasonText,
            payment_exception_comment: reasonComment,
            outstanding_amount: Number.isFinite(outstandingAmount)
              ? Number(outstandingAmount.toFixed(2))
              : Number(authoritativeBalance.toFixed(2)),
            balance_due: money(
              Number.isFinite(outstandingAmount)
                ? Number(outstandingAmount.toFixed(2))
                : Number(authoritativeBalance.toFixed(2)),
            ),
            action_url: `/admin/bookings/${bookingId}`,
            reported_at: reportedAt,
          },
        }),
        enqueueStaffBookingNotification({
          eventCode: "payment_not_collected",
          bookingId,
          recipientRole: "manager",
          dedupeSuffix: `driver-${stopId}`,
          payload: {
            route_stop_id: stopId,
            stop_type: stopType,
            driver_name: driverName,
            payment_exception_reason: reasonText,
            payment_exception_comment: reasonComment,
            outstanding_amount: Number.isFinite(outstandingAmount)
              ? Number(outstandingAmount.toFixed(2))
              : Number(authoritativeBalance.toFixed(2)),
            balance_due: money(
              Number.isFinite(outstandingAmount)
                ? Number(outstandingAmount.toFixed(2))
                : Number(authoritativeBalance.toFixed(2)),
            ),
            action_url: `/admin/bookings/${bookingId}`,
            reported_at: reportedAt,
          },
        }),
      ]);

      await processNotificationQueueBestEffort({
        bookingId,
        limit: 20,
      });
    } catch (notificationError) {
      console.error("Driver payment-not-collected notification enqueue failed", {
        stopId,
        bookingId,
        reportStatus,
        alreadyReported,
        reason: reasonCode,
        error:
          notificationError instanceof Error
            ? notificationError.message
            : String(notificationError),
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      stopId,
      bookingId,
      reason: reasonCode,
      comment: reasonComment || null,
      outstandingBalance: Number.isFinite(outstandingAmount)
        ? Number(outstandingAmount.toFixed(2))
        : Number(authoritativeBalance.toFixed(2)),
      alreadyReported,
      reportStatus,
      reportedAt,
    },
  });
}

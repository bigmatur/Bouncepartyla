import {
  requestCustomerBookingCancellationAction,
} from "../actions";
import type {
  BookingCancellationRequest,
  BookingRecord,
} from "../booking-types";
import ActionButton from "@/components/ui/ActionButton";

type BookingCancellationCardProps = {
  booking: BookingRecord;
  cancellationRequest: BookingCancellationRequest | null;
  adminPreview?: boolean;
  cancellationState?: string | null;
};

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getRequestStatusCopy(request: BookingCancellationRequest) {
  const state = normalize(request.state);

  if (state === "pending") {
    return {
      tone: "amber" as const,
      title: "Cancellation request submitted",
      body: "Your request is pending review. Your booking remains active until staff reviews and confirms the cancellation request.",
    };
  }

  if (state === "approved") {
    const financialDecision = normalize(request.financial_decision);

    if (financialDecision === "refund_deposit") {
      return {
        tone: "blue" as const,
        title: "Cancellation request approved",
        body: "A deposit refund was selected for this cancellation. Contact us if you need confirmation of refund processing.",
      };
    }

    if (financialDecision === "keep_deposit") {
      return {
        tone: "blue" as const,
        title: "Cancellation request approved",
        body: "Your cancellation request was approved, and the deposit is being kept according to the cancellation decision.",
      };
    }

    if (financialDecision === "no_payment") {
      return {
        tone: "blue" as const,
        title: "Cancellation request approved",
        body: "Your cancellation request was approved.",
      };
    }

    return {
      tone: "blue" as const,
      title: "Cancellation request approved",
      body: "Your cancellation request was approved.",
    };
  }

  return {
    tone: "red" as const,
    title: "Cancellation request declined",
    body: "Your request was declined. Contact support if you need help with rescheduling options.",
  };
}

function toneClasses(tone: "amber" | "blue" | "red") {
  if (tone === "blue") {
    return "border-blue-200 bg-blue-50 text-blue-900";
  }

  if (tone === "red") {
    return "border-red-200 bg-red-50 text-red-900";
  }

  return "border-amber-200 bg-amber-50 text-amber-900";
}

export default function BookingCancellationCard({
  booking,
  cancellationRequest,
  adminPreview = false,
  cancellationState,
}: BookingCancellationCardProps) {
  const bookingStatus = normalize(booking.status);
  const isTerminalBooking = bookingStatus === "cancelled" || bookingStatus === "canceled" || bookingStatus === "closed";

  const cancellationQueryState = normalize(cancellationState);
  const showPendingBanner = cancellationQueryState === "pending";
  const showUnavailableBanner = cancellationQueryState === "not-available";
  const showErrorBanner = cancellationQueryState === "error";
  const requestState = normalize(cancellationRequest?.state);
  const canSubmitNewRequest =
    !adminPreview &&
    !isTerminalBooking &&
    (!cancellationRequest || requestState === "declined");
  const requestStatus = cancellationRequest
    ? getRequestStatusCopy(cancellationRequest)
    : null;

  return (
    <section className="overflow-hidden rounded-[26px] border border-black/10 bg-white">
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Cancellation
        </p>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          Request booking cancellation
        </h2>

        <p className="mt-2 text-sm leading-6 text-black/65">
          Send a cancellation request for staff review. This request does not instantly cancel your booking.
        </p>

        {showPendingBanner ? (
          <div className="mt-4 rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Your cancellation request was submitted and is now pending review.
          </div>
        ) : null}

        {showUnavailableBanner ? (
          <div className="mt-4 rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Cancellation requests are not available for this booking state.
          </div>
        ) : null}

        {showErrorBanner ? (
          <div className="mt-4 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            We could not submit your request. Please try again.
          </div>
        ) : null}

        {cancellationRequest && requestStatus ? (
          <div
            className={`mt-4 rounded-[16px] border px-4 py-4 ${toneClasses(requestStatus.tone)}`}
          >
            <p className="text-sm font-semibold">
              {requestStatus.title}
            </p>

            <p className="mt-1 text-sm leading-6 opacity-85">
              {requestStatus.body}
            </p>

            <div className="mt-3 space-y-1 text-xs opacity-80">
              <p>
                Submitted {formatDateTime(cancellationRequest.requested_at) || "recently"}
              </p>
              {cancellationRequest.reviewed_at ? (
                <p>
                  Reviewed {formatDateTime(cancellationRequest.reviewed_at) || "recently"}
                </p>
              ) : null}
              {cancellationRequest.reason ? (
                <p>Reason: {cancellationRequest.reason}</p>
              ) : null}
              {cancellationRequest.admin_comment ? (
                <p>Staff note: {cancellationRequest.admin_comment}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {isTerminalBooking ? (
          <div className="mt-4 rounded-[16px] border border-black/10 bg-[#f7f4ef] px-4 py-4 text-sm text-black/70">
            This booking is already closed or cancelled. A new cancellation request cannot be submitted.
          </div>
        ) : null}

        {adminPreview ? (
          <div className="mt-4 rounded-[16px] border border-black/10 bg-[#f7f4ef] px-4 py-4 text-sm text-black/70">
            Admin preview mode: cancellation requests are view-only.
          </div>
        ) : null}

        {canSubmitNewRequest ? (
          <form action={requestCustomerBookingCancellationAction} className="mt-4 space-y-3">
            <input type="hidden" name="bookingId" value={booking.id} />

            {requestState === "declined" ? (
              <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                You can submit a new cancellation request with updated details.
              </div>
            ) : null}

            <div>
              <label htmlFor="cancellation-reason" className="text-sm font-medium text-black/80">
                Reason
              </label>
              <select
                id="cancellation-reason"
                name="reason"
                required
                defaultValue=""
                className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[#243442]"
              >
                <option value="" disabled>
                  Select a reason
                </option>
                <option value="schedule_change">Schedule change</option>
                <option value="weather">Weather concerns</option>
                <option value="budget">Budget change</option>
                <option value="location_change">Location changed</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="cancellation-comment" className="text-sm font-medium text-black/80">
                Additional details (optional)
              </label>
              <textarea
                id="cancellation-comment"
                name="customerComment"
                rows={3}
                maxLength={600}
                className="mt-1 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[#243442]"
                placeholder="Add any context that can help our team review your request"
              />
            </div>

            <ActionButton
              variant="secondary"
              pendingText="Submitting request..."
              className="w-full px-4 py-3"
            >
              {requestState === "declined"
                ? "Submit a new cancellation request"
                : "Submit cancellation request"}
            </ActionButton>
          </form>
        ) : null}
      </div>
    </section>
  );
}

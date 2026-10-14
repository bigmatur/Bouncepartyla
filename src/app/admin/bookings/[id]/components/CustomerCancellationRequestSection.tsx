import {
  approveCustomerCancellationRequestAction,
  declineCustomerCancellationRequestAction,
} from "../booking-admin-actions";

type CustomerCancellationRequest = {
  booking_id: string;
  revision: number;
  state: "pending" | "approved" | "declined";
  reason: string | null;
  customer_comment: string | null;
  requested_at: string | null;
  reviewed_at: string | null;
  admin_comment: string | null;
  financial_decision: "keep_deposit" | "refund_deposit" | "no_payment" | null;
};

type CustomerCancellationRequestSectionProps = {
  bookingId: string;
  request: CustomerCancellationRequest;
};

function prettifyLabel(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "—";

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function normalizeState(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function stateClassName(state: string) {
  if (state === "approved") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (state === "declined") {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
}

function financialDecisionCopy(value: CustomerCancellationRequest["financial_decision"]) {
  if (value === "refund_deposit") {
    return "Refund deposit selected. This records the decision only; provider refund processing is separate.";
  }

  if (value === "keep_deposit") {
    return "Keep deposit selected.";
  }

  if (value === "no_payment") {
    return "No payment/deposit to resolve.";
  }

  return "—";
}

export default function CustomerCancellationRequestSection({
  bookingId,
  request,
}: CustomerCancellationRequestSectionProps) {
  const state = normalizeState(request.state);
  const isPending = state === "pending";
  const isApproved = state === "approved";
  const isDeclined = state === "declined";

  return (
    <section className="rounded-[20px] border border-black/5 bg-white p-3.5 shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-5 sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
      <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-lg sm:font-semibold">
        Customer cancellation request
      </h3>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-[#e9dfd3] bg-[#fcfaf7] p-3">
          <div className="text-xs uppercase tracking-[0.1em] text-[#9a7a49]">State</div>
          <div className="mt-1">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stateClassName(state)}`}>
              {prettifyLabel(request.state)}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e9dfd3] bg-[#fcfaf7] p-3">
          <div className="text-xs uppercase tracking-[0.1em] text-[#9a7a49]">Revision</div>
          <div className="mt-1 text-sm font-semibold text-[#2f2924]">{request.revision}</div>
        </div>

        <div className="rounded-2xl border border-[#e9dfd3] bg-[#fcfaf7] p-3">
          <div className="text-xs uppercase tracking-[0.1em] text-[#9a7a49]">Customer reason</div>
          <div className="mt-1 text-sm font-semibold text-[#2f2924]">{prettifyLabel(request.reason)}</div>
        </div>

        <div className="rounded-2xl border border-[#e9dfd3] bg-[#fcfaf7] p-3">
          <div className="text-xs uppercase tracking-[0.1em] text-[#9a7a49]">Requested</div>
          <div className="mt-1 text-sm font-semibold text-[#2f2924]">{formatDateTime(request.requested_at)}</div>
        </div>
      </div>

      {request.customer_comment ? (
        <div className="mt-3 rounded-2xl border border-[#e9dfd3] bg-[#fcfaf7] p-3">
          <div className="text-xs uppercase tracking-[0.1em] text-[#9a7a49]">Customer comment</div>
          <p className="mt-1 text-sm text-[#2f2924]">{request.customer_comment}</p>
        </div>
      ) : null}

      {isPending ? (
        <div className="mt-4 rounded-2xl border border-[#efd582] bg-[#fff4d8] px-4 py-3 text-sm text-[#8a6b20]">
          Customer requested cancellation. Booking remains active until this request is approved.
        </div>
      ) : null}

      {(isApproved || isDeclined) ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[#e9dfd3] bg-[#fcfaf7] p-3">
            <div className="text-xs uppercase tracking-[0.1em] text-[#9a7a49]">Reviewed</div>
            <div className="mt-1 text-sm font-semibold text-[#2f2924]">{formatDateTime(request.reviewed_at)}</div>
          </div>

          <div className="rounded-2xl border border-[#e9dfd3] bg-[#fcfaf7] p-3">
            <div className="text-xs uppercase tracking-[0.1em] text-[#9a7a49]">Financial decision</div>
            <div className="mt-1 text-sm font-semibold text-[#2f2924]">
              {financialDecisionCopy(request.financial_decision)}
            </div>
          </div>
        </div>
      ) : null}

      {(isApproved || isDeclined) && request.admin_comment ? (
        <div className="mt-3 rounded-2xl border border-[#e9dfd3] bg-[#fcfaf7] p-3">
          <div className="text-xs uppercase tracking-[0.1em] text-[#9a7a49]">Admin comment</div>
          <p className="mt-1 text-sm text-[#2f2924]">{request.admin_comment}</p>
        </div>
      ) : null}

      {isPending ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <form action={approveCustomerCancellationRequestAction} className="rounded-2xl border border-[#efd582] bg-[#fff8e8] p-4">
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="requestRevision" value={String(request.revision)} />

            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-[#8a6b20]">
              Financial decision
              <select
                name="financialDecision"
                required
                defaultValue=""
                className="mt-2 w-full rounded-xl border border-[#e2c777] bg-white px-3 py-2 text-sm text-[#1f1e1b]"
              >
                <option value="" disabled>
                  Select a financial decision
                </option>
                <option value="keep_deposit">Keep deposit</option>
                <option value="refund_deposit">Refund deposit</option>
                <option value="no_payment">No payment / no deposit to resolve</option>
              </select>
            </label>

            <p className="mt-2 text-xs text-[#8a6b20]">
              Records the refund decision only. Payment-provider refund processing is separate.
            </p>

            <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.1em] text-[#8a6b20]">
              Admin comment (optional)
              <textarea
                name="adminComment"
                rows={3}
                className="mt-2 w-full rounded-xl border border-[#e2c777] bg-white px-3 py-2 text-sm text-[#1f1e1b]"
                placeholder="Optional internal/customer-facing context"
              />
            </label>

            <button
              type="submit"
              className="mt-3 w-full rounded-full bg-[#7a4a00] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Approve cancellation
            </button>
          </form>

          <form action={declineCustomerCancellationRequestAction} className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="requestRevision" value={String(request.revision)} />

            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-red-700">
              Decline comment (optional)
              <textarea
                name="adminComment"
                rows={3}
                className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-[#1f1e1b]"
                placeholder="Explain why this request is declined"
              />
            </label>

            <button
              type="submit"
              className="mt-3 w-full rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Decline request
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

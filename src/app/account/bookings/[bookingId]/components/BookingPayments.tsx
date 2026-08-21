import type {
  BookingPayment,
  BookingRecord,
} from "../booking-types";
import { payCustomerBookingBalanceByCardAction } from "../actions";

type BookingPaymentsProps = {
  booking?: BookingRecord | null;
  payments?: BookingPayment[] | null;
};

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(toNumber(value));
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

function titleCase(value: unknown, fallback: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return fallback;
  }

  return normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getStatusClasses(value: unknown) {
  const status = normalizeText(value).toLowerCase();

  if (
    status === "paid" ||
    status === "completed" ||
    status === "succeeded"
  ) {
    return "bg-emerald-50 text-emerald-700";
  }

  if (
    status === "failed" ||
    status === "cancelled" ||
    status === "refunded"
  ) {
    return "bg-red-50 text-red-700";
  }

  return "bg-amber-50 text-amber-700";
}

export default function BookingPayments({
  booking,
  payments,
}: BookingPaymentsProps) {
  const safePayments = Array.isArray(payments)
    ? payments
    : [];

  if (!booking) {
    return (
      <section className="overflow-hidden rounded-[20px] border border-black/10 bg-white sm:rounded-[26px]">
        <div className="p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
            Payments
          </p>

          <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] sm:mt-2 sm:text-xl">
            Payment summary
          </h2>

          <div className="mt-5 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-sm font-semibold text-amber-900">
              Payment information is unavailable
            </p>

            <p className="mt-1 text-sm leading-6 text-amber-800/75">
              The booking record was not passed to the payment component.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const subtotal = toNumber((booking as any).subtotal);
  const modifiersTotal = toNumber((booking as any).modifiers_total);
  const deliveryFee = toNumber((booking as any).delivery_fee);
  const discountAmount = toNumber((booking as any).discount_amount);
  const taxAmount = toNumber((booking as any).tax_amount);
  const totalAmount = toNumber(booking.total_amount);
  const balanceDue = Math.max(0, toNumber(booking.balance_due));
  // Use total − balance_due so the deposit is correctly shown even before
  // any payment record exists (balance_due already accounts for the deposit).
  const effectivePaid = Math.max(
    toNumber(booking.amount_paid),
    totalAmount - balanceDue,
  );

  const successfulPayments = safePayments.filter(
    (payment) => {
      const status = normalizeText(
        payment?.status,
      ).toLowerCase();

      return (
        status === "paid" ||
        status === "completed" ||
        status === "succeeded"
      );
    },
  );

  const paymentsTotal = successfulPayments.reduce(
    (sum, payment) =>
      sum + Math.max(0, toNumber(payment?.amount) - toNumber(payment?.tip_amount)),
    0,
  );

  const hasPaymentMismatch =
    successfulPayments.length > 0 &&
    Math.abs(paymentsTotal - effectivePaid) >= 0.01;

  const isSelfServiceCheckoutPending =
    normalizeText(booking.booking_source).toLowerCase() === "customer_self_service" &&
    normalizeText(booking.status).toLowerCase() === "pending_deposit";

  return (
    <section className="overflow-hidden rounded-[26px] border border-black/10 bg-white">
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Payments
        </p>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          Payment summary
        </h2>

        <div className="mt-4 divide-y divide-black/[0.06] sm:mt-5">
          {subtotal !== 0 ? (
            <div className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-black/50">Equipment</span>
              <span className="font-medium">{money(subtotal)}</span>
            </div>
          ) : null}

          {modifiersTotal !== 0 ? (
            <div className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-black/50">Options</span>
              <span className="font-medium">{money(modifiersTotal)}</span>
            </div>
          ) : null}

          {deliveryFee !== 0 ? (
            <div className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-black/50">Delivery</span>
              <span className="font-medium">{money(deliveryFee)}</span>
            </div>
          ) : null}

          {discountAmount !== 0 ? (
            <div className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-black/50">Discount</span>
              <span className="font-medium">{`−${money(discountAmount)}`}</span>
            </div>
          ) : null}

          {taxAmount !== 0 ? (
            <div className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-black/50">Sales tax</span>
              <span className="font-medium">{money(taxAmount)}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="text-black/50">Total</span>
            <span className="font-semibold">{money(totalAmount)}</span>
          </div>

          {effectivePaid > 0 ? (
            <div className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-black/50">Paid</span>
              <span className="font-semibold text-emerald-700">{money(effectivePaid)}</span>
            </div>
          ) : null}

          <div className="flex items-end justify-between gap-4 rounded-[14px] bg-[#f7f4ef] px-3 py-3 sm:rounded-none sm:bg-transparent sm:px-0 sm:pt-3">
            <span className="font-semibold">Balance due</span>
            <span
              className={`text-xl font-semibold ${
                balanceDue > 0 ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {money(balanceDue)}
            </span>
          </div>
        </div>

        {isSelfServiceCheckoutPending ? (
          <div className="mt-5 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="text-sm font-semibold text-amber-900">
              Card checkout is being confirmed
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-800/75">
              Do not submit another payment from this page. If you already completed Stripe Checkout, refresh in a moment while the payment confirmation is recorded.
            </p>
          </div>
        ) : balanceDue > 0 ? (
          <div className="mt-4 rounded-[16px] border border-blue-200 bg-blue-50 px-3 py-3 sm:mt-5 sm:rounded-[18px] sm:px-4 sm:py-4">
            <p className="text-sm font-semibold text-blue-900">
              Pay securely by card
            </p>

            <p className="mt-1 text-sm leading-6 text-blue-800/75">
              Customer payments are processed securely through Stripe.
            </p>

            <form action={payCustomerBookingBalanceByCardAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button className="mt-3 w-full rounded-full bg-[#23313f] px-4 py-3 text-sm font-semibold text-white sm:mt-4">
                Pay {money(balanceDue)} by card
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-5 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-4">
            <p className="text-sm font-semibold text-emerald-800">
              This booking is paid in full
            </p>
          </div>
        )}

        {hasPaymentMismatch ? (
          <div className="mt-4 rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
            Payment records are still syncing. The booking balance shown above is the current account total.
          </div>
        ) : null}

        {safePayments.length > 0 ? (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/35">
              Payment history
            </p>

            <div className="mt-3 space-y-2">
              {safePayments.map((payment, index) => {
                const paidAt = formatDateTime(
                  payment?.paid_at,
                );

                const paymentId =
                  normalizeText(payment?.id) ||
                  `payment-${index}`;

                return (
                  <div
                    key={paymentId}
                    className="rounded-[16px] border border-black/[0.07] bg-black/[0.02] px-3.5 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {titleCase(
                            payment?.method,
                            "Payment",
                          )}
                        </p>

                        {paidAt ? (
                          <p className="mt-1 text-xs text-black/45">
                            {paidAt}
                          </p>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {money(payment?.amount)}
                        </p>

                        <span
                          className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusClasses(
                            payment?.status,
                          )}`}
                        >
                          {titleCase(
                            payment?.status,
                            "Pending",
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-black/45">
            No payments have been recorded yet.
          </p>
        )}
      </div>
    </section>
  );
}

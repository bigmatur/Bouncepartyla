type BookingHeroProps = {
  booking: {
    booking_number: string | null;
    status: string;
    balance_due: number | string;
    amount_paid: number | string;
    total_amount: number | string;
    event_date: string;
  };

  title: string;
  eventTime: string | null;
  setupAddress: string;
};

function formatMoney(
  value: number | string | null | undefined,
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatDate(value: string) {
  const date = value.includes("T")
    ? new Date(value)
    : new Date(`${value}T12:00:00`);

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function bookingStatusLabel(value: string) {
  const labels: Record<string, string> = {
    draft: "Booking started",
    quote: "Quote prepared",
    pending_deposit: "Waiting for deposit",
    booked: "Everything is on schedule",
    scheduled: "Everything is on schedule",
    inventory_reserved: "Equipment reserved",
    picking: "Preparing your equipment",
    loaded: "Ready for delivery",
    out_for_delivery: "Out for delivery",
    installed: "Setup is complete",
    pickup_scheduled: "Pickup scheduled",
    picked_up: "Equipment picked up",
    returned: "Completed",
    cleaning: "Completed",
    closed: "Completed",
    cancelled: "Cancelled",
    refunded: "Refunded",
  };

  return labels[value] || statusLabel(value);
}

function getStatusStyles(status: string) {
  if (
    status === "cancelled" ||
    status === "refunded"
  ) {
    return {
      wrapper: "bg-red-50 text-red-700",
      dot: "bg-red-500",
    };
  }

  if (
    status === "draft" ||
    status === "quote" ||
    status === "pending_deposit"
  ) {
    return {
      wrapper: "bg-amber-50 text-amber-700",
      dot: "bg-amber-500",
    };
  }

  return {
    wrapper: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  };
}

export default function BookingHero({
  booking,
  title,
  eventTime,
  setupAddress,
}: BookingHeroProps) {
  const totalAmount = Number(booking.total_amount || 0);
  const balanceDue = Number(booking.balance_due || 0);
  // Use total − balance_due so the deposit is reflected even before
  // a payment record exists (balance_due already accounts for the deposit).
  const effectivePaid = Math.max(
    Number(booking.amount_paid || 0),
    totalAmount - balanceDue,
  );

  const paymentProgress =
    totalAmount > 0
      ? Math.min(
          100,
          Math.max(0, (effectivePaid / totalAmount) * 100),
        )
      : 0;

  const isPaid = balanceDue <= 0;
  const statusStyles = getStatusStyles(booking.status);

  return (
    <section className="mt-4 overflow-hidden rounded-[22px] border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:mt-5 sm:rounded-[30px]">
      <div className="grid lg:grid-cols-[1fr_310px]">
        <div className="p-4 sm:p-9">
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm ${statusStyles.wrapper}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${statusStyles.dot}`}
              aria-hidden="true"
            />

            {bookingStatusLabel(booking.status)}
          </div>

          <h1 className="mt-4 max-w-3xl text-2xl font-semibold tracking-[-0.04em] sm:mt-6 sm:text-4xl lg:text-5xl">
            {title}
          </h1>

          <div className="mt-4 flex flex-col gap-1 sm:mt-6">
            <p className="text-lg font-semibold sm:text-xl">
              {formatDate(booking.event_date)}
            </p>

            {eventTime ? (
              <p className="text-sm font-medium text-black/55 sm:text-base">
                {eventTime}
              </p>
            ) : null}
          </div>

          {setupAddress ? (
            <div className="mt-4 flex max-w-2xl items-start gap-3 rounded-[16px] bg-black/[0.035] px-3 py-3 sm:mt-5 sm:rounded-[18px] sm:px-4">
              <span
                className="mt-0.5 text-base"
                aria-hidden="true"
              >
                📍
              </span>

              <p className="text-sm leading-6 text-black/60">
                {setupAddress}
              </p>
            </div>
          ) : null}

          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35 sm:mt-7 sm:text-xs">
            {booking.booking_number
              ? `Booking #${booking.booking_number}`
              : "Your reservation"}
          </p>
        </div>

        <div className="border-t border-black/[0.06] bg-[#f7f4ef] p-4 sm:p-8 lg:border-l lg:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40">
            {isPaid ? "Payment status" : "Balance due"}
          </p>

          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:mt-3 sm:text-4xl">
            {isPaid
              ? "Paid in full"
              : formatMoney(booking.balance_due)}
          </p>

          <div className="mt-7">
            <div className="hidden items-center justify-between gap-4 text-xs font-medium text-black/45 sm:flex">
              <span>Payment progress</span>
              <span>{Math.round(paymentProgress)}%</span>
            </div>

            <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10 sm:mt-2">
              <div
                className="h-full rounded-full bg-black transition-all"
                style={{
                  width: `${paymentProgress}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-4 rounded-[16px] bg-white/70 px-4 py-3 sm:mt-5 sm:rounded-[18px] sm:py-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-black/50">Paid</span>

              <strong>
                {formatMoney(effectivePaid)}
              </strong>
            </div>

            <div className="mt-3 flex items-center justify-between gap-4 border-t border-black/[0.06] pt-3 text-sm">
              <span className="text-black/50">Total</span>

              <strong>
                {formatMoney(booking.total_amount)}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
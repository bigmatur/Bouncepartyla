type BookingStatusNoticeProps = {
  bookingStatus: string;
  paymentStatus: string;
  balanceDue: number | string;
  eventDate: string;
};

function formatMoney(
  value: number | string | null | undefined,
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

export default function BookingStatusNotice({
  bookingStatus,
  paymentStatus,
  balanceDue,
  eventDate,
}: BookingStatusNoticeProps) {
  const status = normalize(bookingStatus);
  const payment = normalize(paymentStatus);
  const amountDue = Number(balanceDue || 0);

  const event = new Date(`${eventDate}T12:00:00`);
  const today = new Date();

  const eventIsPast =
    !Number.isNaN(event.getTime()) &&
    event.getTime() <
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime();

  if (
    status === "cancelled" ||
    status === "canceled"
  ) {
    return (
      <section className="mt-6 rounded-[22px] border border-red-200 bg-red-50 px-5 py-5">
        <p className="text-sm font-semibold text-red-800">
          This booking has been cancelled
        </p>

        <p className="mt-1 text-sm leading-6 text-red-700/80">
          Contact Bounce Party LA if you need help moving your deposit or selecting a new event date.
        </p>
      </section>
    );
  }

  if (
    status === "on_hold" ||
    status === "hold" ||
    status === "pending"
  ) {
    return (
      <section className="mt-6 rounded-[22px] border border-amber-200 bg-amber-50 px-5 py-5">
        <p className="text-sm font-semibold text-amber-900">
          Your reservation is not fully confirmed yet
        </p>

        <p className="mt-1 text-sm leading-6 text-amber-800/80">
          Complete any remaining contract or payment steps to secure your booking.
        </p>
      </section>
    );
  }

  if (
    amountDue > 0 &&
    (payment === "pending" ||
      payment === "partial" ||
      payment === "partially_paid" ||
      payment === "deposit_paid")
  ) {
    return (
      <section className="mt-6 flex flex-col gap-3 rounded-[22px] border border-blue-200 bg-blue-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-900">
            Remaining balance: {formatMoney(amountDue)}
          </p>

          <p className="mt-1 text-sm leading-6 text-blue-800/75">
            Your booking is active. The remaining balance can be paid according to your booking terms.
          </p>
        </div>
      </section>
    );
  }

  if (
    eventIsPast ||
    status === "completed" ||
    status === "closed"
  ) {
    return (
      <section className="mt-6 rounded-[22px] border border-emerald-200 bg-emerald-50 px-5 py-5">
        <p className="text-sm font-semibold text-emerald-900">
          Thank you for celebrating with Bounce Party LA
        </p>

        <p className="mt-1 text-sm leading-6 text-emerald-800/75">
          Your event is complete. Photos and payment records will remain available in this booking.
        </p>
      </section>
    );
  }

  return null;
}

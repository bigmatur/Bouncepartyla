type BookingProgressProps = {
  bookingStatus: string;
  paymentStatus: string;
  contractStatus: string;
  deliveryStatus: string | null;
  pickupStatus: string | null;
};

type ProgressStep = {
  key: string;
  title: string;
  description: string;
};

const steps: ProgressStep[] = [
  {
    key: "booked",
    title: "Booking confirmed",
    description: "Your equipment has been reserved.",
  },
  {
    key: "preparing",
    title: "Preparing your setup",
    description: "Our team is getting everything ready.",
  },
  {
    key: "delivery",
    title: "Delivery",
    description: "Your equipment is on the way.",
  },
  {
    key: "installed",
    title: "Setup complete",
    description: "Everything has been installed for your event.",
  },
  {
    key: "pickup",
    title: "Pickup",
    description: "Our team will return after your event.",
  },
  {
    key: "completed",
    title: "Completed",
    description: "Your booking has been completed.",
  },
];

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function getCurrentStep(
  bookingStatus: string,
  deliveryStatus: string | null,
  pickupStatus: string | null,
) {
  const booking = normalizeStatus(bookingStatus);
  const delivery = normalizeStatus(deliveryStatus);
  const pickup = normalizeStatus(pickupStatus);

  if (
    booking === "closed" ||
    booking === "returned" ||
    booking === "cleaning" ||
    pickup === "completed" ||
    pickup === "picked_up" ||
    pickup === "returned"
  ) {
    return 5;
  }

  if (
    booking === "pickup_scheduled" ||
    booking === "picked_up" ||
    pickup === "scheduled" ||
    pickup === "assigned" ||
    pickup === "on_the_way"
  ) {
    return 4;
  }

  if (
    booking === "installed" ||
    delivery === "installed" ||
    delivery === "completed" ||
    delivery === "delivered"
  ) {
    return 3;
  }

  if (
    booking === "out_for_delivery" ||
    delivery === "out_for_delivery" ||
    delivery === "on_the_way" ||
    delivery === "assigned"
  ) {
    return 2;
  }

  if (
    booking === "picking" ||
    booking === "loaded" ||
    booking === "inventory_reserved" ||
    booking === "scheduled"
  ) {
    return 1;
  }

  return 0;
}

function statusLabel(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function paymentStatusLabel(value: string) {
  const labels: Record<string, string> = {
    unpaid: "Payment due",
    partial: "Partially paid",
    paid: "Paid",
    refunded: "Refunded",
    failed: "Payment failed",
  };

  return labels[value] || statusLabel(value);
}

function contractStatusLabel(value: string) {
  const labels: Record<string, string> = {
    not_sent: "Preparing",
    sent: "Sent",
    viewed: "Viewed",
    signed: "Signed",
    expired: "Expired",
    cancelled: "Cancelled",
  };

  return labels[value] || statusLabel(value);
}

export default function BookingProgress({
  bookingStatus,
  paymentStatus,
  contractStatus,
  deliveryStatus,
  pickupStatus,
}: BookingProgressProps) {
  const currentStep = getCurrentStep(
    bookingStatus,
    deliveryStatus,
    pickupStatus,
  );

  const normalizedBookingStatus = normalizeStatus(bookingStatus);
  const isCancelled =
    normalizedBookingStatus === "cancelled" ||
    normalizedBookingStatus === "refunded";

  if (isCancelled) {
    return (
      <section className="rounded-[26px] border border-red-200 bg-red-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
          Booking status
        </p>

        <h2 className="mt-2 text-xl font-semibold text-red-800">
          {normalizedBookingStatus === "refunded"
            ? "Booking refunded"
            : "Booking cancelled"}
        </h2>

        <p className="mt-3 text-sm leading-6 text-red-700/75">
          Please contact Bounce Party LA if you have any questions about this
          booking.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[26px] border border-black/10 bg-white p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Party progress
        </p>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          What happens next
        </h2>
      </div>

      <div className="mt-6">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isLast = index === steps.length - 1;

          return (
            <div key={step.key} className="relative flex gap-4">
              {!isLast ? (
                <div
                  className={`absolute left-[15px] top-8 h-[calc(100%-8px)] w-px ${
                    isCompleted ? "bg-black" : "bg-black/10"
                  }`}
                />
              ) : null}

              <div className="relative z-10 shrink-0">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${
                    isCompleted
                      ? "border-black bg-black text-white"
                      : isCurrent
                        ? "border-black bg-white text-black"
                        : "border-black/10 bg-white text-black/25"
                  }`}
                >
                  {isCompleted ? "✓" : index + 1}
                </div>
              </div>

              <div className={`min-w-0 ${isLast ? "" : "pb-7"}`}>
                <p
                  className={`text-sm font-semibold ${
                    isCurrent || isCompleted ? "text-black" : "text-black/35"
                  }`}
                >
                  {step.title}
                </p>

                <p
                  className={`mt-1 text-xs leading-5 ${
                    isCurrent || isCompleted
                      ? "text-black/50"
                      : "text-black/25"
                  }`}
                >
                  {step.description}
                </p>

                {isCurrent ? (
                  <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    Current stage
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-3 border-t border-black/[0.06] pt-5 sm:grid-cols-2">
        <div className="rounded-2xl bg-black/[0.035] px-4 py-3">
          <p className="text-xs text-black/40">Payment</p>
          <p className="mt-1 text-sm font-semibold">
            {paymentStatusLabel(paymentStatus)}
          </p>
        </div>

        <div className="rounded-2xl bg-black/[0.035] px-4 py-3">
          <p className="text-xs text-black/40">Contract</p>
          <p className="mt-1 text-sm font-semibold">
            {contractStatusLabel(contractStatus)}
          </p>
        </div>
      </div>
    </section>
  );
}

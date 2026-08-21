type BookingDeliveryCardProps = {
  eventDate: string;
  deliveryDate: string | null;
  pickupDate: string | null;
  deliveryStatus: string | null;
  pickupStatus: string | null;
  setupAddress: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusLabel(value: string | null | undefined) {
  if (!value) {
    return "To be scheduled";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getStatusStyles(value: string | null) {
  const status = value?.toLowerCase() || "";

  if (
    status === "completed" ||
    status === "delivered" ||
    status === "picked_up"
  ) {
    return "bg-emerald-50 text-emerald-700";
  }

  if (
    status === "cancelled" ||
    status === "failed"
  ) {
    return "bg-red-50 text-red-700";
  }

  if (
    status === "en_route" ||
    status === "in_progress"
  ) {
    return "bg-blue-50 text-blue-700";
  }

  return "bg-amber-50 text-amber-700";
}

function ScheduleRow({
  icon,
  title,
  date,
  status,
  helper,
}: {
  icon: string;
  title: string;
  date: string;
  status: string | null;
  helper: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-[20px] border border-black/[0.07] bg-black/[0.025] px-4 py-4">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm"
        aria-hidden="true"
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold">
              {title}
            </p>

            <p className="mt-1 text-sm text-black/55">
              {date}
            </p>
          </div>

          <span
            className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusStyles(
              status,
            )}`}
          >
            {statusLabel(status)}
          </span>
        </div>

        <p className="mt-2 text-xs leading-5 text-black/40">
          {helper}
        </p>
      </div>
    </div>
  );
}

export default function BookingDeliveryCard({
  eventDate,
  deliveryDate,
  pickupDate,
  deliveryStatus,
  pickupStatus,
  setupAddress,
}: BookingDeliveryCardProps) {
  const formattedEventDate =
    formatDate(eventDate) || eventDate;

  const formattedDeliveryDate =
    formatDate(deliveryDate) ||
    formattedEventDate;

  const formattedPickupDate =
    formatDate(pickupDate) ||
    formattedEventDate;

  return (
    <section className="rounded-[26px] border border-black/10 bg-white p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Delivery plan
        </p>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          Setup and pickup
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
          Exact arrival windows are confirmed closer to your event.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <ScheduleRow
          icon="↓"
          title="Delivery and setup"
          date={formattedDeliveryDate}
          status={deliveryStatus}
          helper="Our team will arrive with enough time to complete the setup before your event."
        />

        <ScheduleRow
          icon="↑"
          title="Pickup"
          date={formattedPickupDate}
          status={pickupStatus}
          helper="The equipment will be collected after the agreed rental period."
        />
      </div>

      {setupAddress ? (
        <div className="mt-4 rounded-[18px] border border-black/[0.06] px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-black/35">
            Setup location
          </p>

          <p className="mt-2 text-sm font-medium leading-6 text-black/65">
            {setupAddress}
          </p>
        </div>
      ) : null}
    </section>
  );
}

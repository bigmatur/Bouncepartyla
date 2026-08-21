type BookingCountdownProps = {
  eventDate: string;
  eventStartTime: string | null;
  bookingStatus: string;
};

function createEventDate(
  eventDate: string,
  eventStartTime: string | null,
) {
  const time = eventStartTime || "12:00:00";
  const normalizedTime =
    time.length === 5 ? `${time}:00` : time;

  const date = new Date(
    `${eventDate}T${normalizedTime}`,
  );

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEventDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getCountdownCopy(daysUntilEvent: number) {
  if (daysUntilEvent > 30) {
    return {
      eyebrow: "Your party is coming",
      title: `${daysUntilEvent} days to go`,
      message:
        "Your reservation is confirmed and our team is preparing everything for your event.",
    };
  }

  if (daysUntilEvent > 7) {
    return {
      eyebrow: "Getting closer",
      title: `${daysUntilEvent} days to go`,
      message:
        "We will contact you closer to the event to confirm the final delivery and pickup schedule.",
    };
  }

  if (daysUntilEvent > 1) {
    return {
      eyebrow: "Almost party time",
      title: `${daysUntilEvent} days to go`,
      message:
        "Please make sure the setup area is clear and ready for our delivery team.",
    };
  }

  if (daysUntilEvent === 1) {
    return {
      eyebrow: "Tomorrow",
      title: "Your party is tomorrow",
      message:
        "We are getting everything ready. Please keep your phone available for delivery updates.",
    };
  }

  if (daysUntilEvent === 0) {
    return {
      eyebrow: "Today",
      title: "It’s party day!",
      message:
        "Our team is ready to make your setup clean, safe, and beautiful.",
    };
  }

  return {
    eyebrow: "Event complete",
    title: "Thank you for celebrating with us",
    message:
      "We hope you had a wonderful event with Bounce Party LA.",
  };
}

export default function BookingCountdown({
  eventDate,
  eventStartTime,
  bookingStatus,
}: BookingCountdownProps) {
  const event = createEventDate(
    eventDate,
    eventStartTime,
  );

  if (!event) {
    return null;
  }

  const today = new Date();

  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const startOfEvent = new Date(
    event.getFullYear(),
    event.getMonth(),
    event.getDate(),
  );

  const daysUntilEvent = Math.ceil(
    (startOfEvent.getTime() -
      startOfToday.getTime()) /
      86_400_000,
  );

  const normalizedStatus =
    bookingStatus.toLowerCase();

  const isCancelled =
    normalizedStatus === "cancelled" ||
    normalizedStatus === "canceled";

  const content = isCancelled
    ? {
        eyebrow: "Booking cancelled",
        title: "This event is no longer active",
        message:
          "Contact our team if you need help moving your deposit or choosing another date.",
      }
    : getCountdownCopy(daysUntilEvent);

  return (
    <section className="overflow-hidden rounded-[26px] border border-black/10 bg-[#f7f4ef] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
        {content.eyebrow}
      </p>

      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
        {content.title}
      </h2>

      <p className="mt-3 text-sm leading-6 text-black/55">
        {content.message}
      </p>

      <div className="mt-5 rounded-[18px] bg-white px-4 py-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-black/35">
          Event date
        </p>

        <p className="mt-2 text-sm font-semibold text-black/75">
          {formatEventDate(event)}
        </p>
      </div>
    </section>
  );
}

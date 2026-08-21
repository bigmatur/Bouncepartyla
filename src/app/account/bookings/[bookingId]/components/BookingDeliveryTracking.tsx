import type { BookingRouteStop } from "../booking-types";

type BookingDeliveryTrackingProps = {
  eventDate: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  deliveryDate: string | null;
  pickupDate: string | null;
  deliveryWindowStart: string | null;
  deliveryWindowEnd: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryStatus: string | null;
  pickupStatus: string | null;
  setupAddress: string;
  routeStops: BookingRouteStop[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  if (!value) return null;
  const raw = String(value);
  const match = raw.match(/(\d{2}):(\d{2})/);

  if (!match) return null;

  const hours = match[1];
  const minutes = match[2];
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);
  if (Number.isNaN(parsedHours) || Number.isNaN(parsedMinutes)) return null;

  const date = new Date();
  date.setHours(parsedHours, parsedMinutes, 0, 0);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function statusLabel(value: string | null | undefined, scheduled: boolean) {
  if (!value) return scheduled ? "Scheduled" : "To be scheduled";

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getStatusStyles(value: string | null | undefined) {
  const status = normalizeStatus(value);

  if (status === "completed" || status === "delivered" || status === "picked_up") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled" || status === "failed") {
    return "bg-red-50 text-red-700";
  }

  if (status === "en_route" || status === "in_progress" || status === "on_the_way") {
    return "bg-blue-50 text-blue-700";
  }

  return "bg-amber-50 text-amber-700";
}

function isLiveTrackingStatus(value: string | null | undefined) {
  const status = normalizeStatus(value);
  return status === "en_route" || status === "in_progress" || status === "on_the_way";
}

function findLatestStop(routeStops: BookingRouteStop[], type: "delivery" | "pickup") {
  return routeStops
    .filter((stop) => normalizeStatus(stop.stop_type) === type)
    .sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    })[0] || null;
}

// A route stop only reflects a real admin-planned window once both ends of
// the window are set and distinct; otherwise it's still the auto-created
// placeholder and the event time is a safer, non-confusing display.
function hasRealRouteWindow(stop: BookingRouteStop | null) {
  if (!stop?.scheduled_start_time || !stop?.scheduled_end_time) return false;
  return stop.scheduled_start_time !== stop.scheduled_end_time;
}

function buildScheduleText(params: {
  stop: BookingRouteStop | null;
  fallbackDate: string | null;
  fallbackTime: string | null;
  eventDate: string;
}) {
  const { stop, fallbackDate, fallbackTime, eventDate } = params;

  if (hasRealRouteWindow(stop)) {
    const date = formatDate(stop?.stop_date || fallbackDate || eventDate) || eventDate;
    const start = formatTime(stop?.scheduled_start_time);
    const end = formatTime(stop?.scheduled_end_time);
    if (start && end) return `${date} · ${start} – ${end}`;
  }

  const date = formatDate(fallbackDate || eventDate) || eventDate;
  const time = formatTime(fallbackTime);
  return time ? `${date} · ${time}` : `${date} · Time to be scheduled`;
}

function TimelineRow({
  title,
  date,
  status,
  scheduled,
}: {
  title: string;
  date: string;
  status: string | null;
  scheduled: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[16px] border border-black/[0.07] bg-white px-3 py-3 sm:gap-4 sm:rounded-[18px] sm:px-4 sm:py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-black/50">{date}</p>
      </div>

      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusStyles(status)}`}>
        {statusLabel(status, scheduled)}
      </span>
    </div>
  );
}

export default function BookingDeliveryTracking({
  eventDate,
  eventStartTime,
  eventEndTime,
  deliveryDate,
  pickupDate,
  deliveryWindowStart,
  deliveryWindowEnd,
  pickupWindowStart,
  pickupWindowEnd,
  deliveryStatus,
  pickupStatus,
  setupAddress,
  routeStops,
}: BookingDeliveryTrackingProps) {
  const deliveryStop = findLatestStop(routeStops, "delivery");
  const pickupStop = findLatestStop(routeStops, "pickup");

  const effectiveDeliveryStatus = deliveryStop?.status || deliveryStatus;
  const effectivePickupStatus = pickupStop?.status || pickupStatus;

  const deliverySchedule = buildScheduleText({
    stop: deliveryStop,
    fallbackDate: deliveryDate,
    fallbackTime: eventStartTime,
    eventDate,
  });

  const pickupSchedule = buildScheduleText({
    stop: pickupStop,
    fallbackDate: pickupDate,
    fallbackTime: eventEndTime,
    eventDate,
  });

  const deliveryScheduled = Boolean(
    hasRealRouteWindow(deliveryStop) || eventStartTime,
  );
  const pickupScheduled = Boolean(
    hasRealRouteWindow(pickupStop) || eventEndTime,
  );

  const liveTracking = isLiveTrackingStatus(effectiveDeliveryStatus);
  const mapUrl = setupAddress
    ? `https://www.google.com/maps?q=${encodeURIComponent(setupAddress)}&output=embed`
    : null;

  return (
    <section className="overflow-hidden rounded-[20px] border border-black/10 bg-white sm:rounded-[26px]">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">Delivery tracking</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] sm:mt-2 sm:text-xl">Delivery & pickup</h2>
            <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-black/45 sm:block">
              Live driver tracking will appear here when your delivery route begins.
            </p>
          </div>

          <span className={`w-fit shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${liveTracking ? "bg-blue-50 text-blue-700" : "bg-black/[0.05] text-black/55"}`}>
            {liveTracking ? "Live tracking active" : "Tracking not active yet"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="hidden overflow-hidden rounded-[22px] border border-black/[0.08] bg-black/[0.025] sm:block">
            {mapUrl ? (
              <div className="relative min-h-[320px]">
                <iframe
                  title="Booking setup location"
                  src={mapUrl}
                  className="absolute inset-0 h-full w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />

                {!liveTracking ? (
                  <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-[16px] border border-white/60 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
                    <p className="text-sm font-semibold">Waiting for the driver to start the route</p>
                    <p className="mt-1 text-xs leading-5 text-black/50">
                      The map currently shows your setup location. Driver position and ETA will appear once delivery begins.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center px-6 text-center">
                <div>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl shadow-sm" aria-hidden="true">⌖</div>
                  <p className="mt-4 text-sm font-semibold">Setup location is not available yet</p>
                  <p className="mt-1 text-sm leading-6 text-black/45">
                    The delivery map will appear after an address is added to the booking.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="order-first space-y-2 sm:space-y-3 lg:order-none">
            <TimelineRow
              title="Delivery and setup"
              date={deliverySchedule}
              status={effectiveDeliveryStatus}
              scheduled={deliveryScheduled}
            />

            <TimelineRow
              title="Pickup"
              date={pickupSchedule}
              status={effectivePickupStatus}
              scheduled={pickupScheduled}
            />

            {setupAddress ? (
              <div className="rounded-[18px] border border-black/[0.07] bg-black/[0.025] px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-black/35">Setup location</p>
                <p className="mt-2 text-sm font-medium leading-6 text-black/65">{setupAddress}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

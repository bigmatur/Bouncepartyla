import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getBookingMarkerColor, getBookingMarkerLabel } from "@/lib/booking/marker-color";
import { updateBookingMarkerColorAction } from "@/app/admin/bookings/marker-color-actions";
import { formatTime, type TimeFormat } from "@/lib/date-time-format";

type CalendarView = "day" | "week" | "month";

type PageProps = {
  searchParams?: Promise<{
    date?: string;
    view?: string;
    eventDate?: string;
    eventStartTime?: string;
  }>;
};

type CalendarDay = {
  date: Date;
  iso: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isPast: boolean;
};

const statusColors: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  quote: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  booked: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  inventory_reserved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  scheduled: "bg-[#eaf2f9] text-[#355879] ring-[#cfe0ef]",
  picking: "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]",
  loaded: "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]",
  out_for_delivery: "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]",
  installed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pickup_scheduled: "bg-[#eaf2f9] text-[#355879] ring-[#cfe0ef]",
  picked_up: "bg-[#eaf2f9] text-[#355879] ring-[#cfe0ef]",
  returned: "bg-[#eaf2f9] text-[#355879] ring-[#cfe0ef]",
  cleaning: "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]",
  closed: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
};

const hours = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

function parseSelectedDate(value?: string) {
  if (!value) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  return new Date(year, month - 1, day);
}

function parseView(value?: string): CalendarView {
  if (value === "day" || value === "week" || value === "month") {
    return value;
  }

  return "month";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getWeekStart(date: Date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return new Date(start.getFullYear(), start.getMonth(), start.getDate());
}

function getWeekEnd(date: Date) {
  return addDays(getWeekStart(date), 6);
}

function getDateRangeForView(date: Date, view: CalendarView) {
  if (view === "day") {
    return {
      start: date,
      end: date,
    };
  }

  if (view === "week") {
    return {
      start: getWeekStart(date),
      end: getWeekEnd(date),
    };
  }

  return {
    start: getMonthStart(date),
    end: getMonthEnd(date),
  };
}

function getPreviousDate(date: Date, view: CalendarView) {
  if (view === "day") {
    return addDays(date, -1);
  }

  if (view === "week") {
    return addDays(date, -7);
  }

  return addMonths(date, -1);
}

function getNextDate(date: Date, view: CalendarView) {
  if (view === "day") {
    return addDays(date, 1);
  }

  if (view === "week") {
    return addDays(date, 7);
  }

  return addMonths(date, 1);
}

function getNavigationLabel(view: CalendarView) {
  if (view === "day") {
    return {
      previous: "← Previous day",
      next: "Next day →",
    };
  }

  if (view === "week") {
    return {
      previous: "← Previous week",
      next: "Next week →",
    };
  }

  return {
    previous: "← Previous month",
    next: "Next month →",
  };
}

function formatPageTitle(date: Date, view: CalendarView) {
  if (view === "day") {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  if (view === "week") {
    const start = getWeekStart(date);
    const end = getWeekEnd(date);

    const startLabel = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(start);

    const endLabel = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(end);

    return `${startLabel} – ${endLabel}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatShortDay(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMoney(value: number | string | null | undefined) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numberValue);
}

function prettyStatus(status: string | null | undefined) {
  if (!status) {
    return "Unknown";
  }

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusClass(status: string | null | undefined) {
  if (!status) {
    return "bg-neutral-100 text-neutral-600 ring-neutral-200";
  }

  return (
    statusColors[status] || "bg-neutral-100 text-neutral-600 ring-neutral-200"
  );
}

function buildMonthDays(selectedDate: Date): CalendarDay[] {
  const todayIso = toIsoDate(new Date());
  const selectedIso = toIsoDate(selectedDate);

  const monthStart = getMonthStart(selectedDate);
  const monthEnd = getMonthEnd(selectedDate);

  const startDay = monthStart.getDay();
  const gridStart = addDays(monthStart, -startDay);

  const endDay = monthEnd.getDay();
  const gridEnd = addDays(monthEnd, 6 - endDay);

  const days: CalendarDay[] = [];
  let cursor = gridStart;

  while (cursor <= gridEnd) {
    const iso = toIsoDate(cursor);

    days.push({
      date: new Date(cursor),
      iso,
      dayNumber: cursor.getDate(),
      isCurrentMonth: cursor.getMonth() === selectedDate.getMonth(),
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
      isPast: iso < todayIso,
    });

    cursor = addDays(cursor, 1);
  }

  return days;
}

function buildWeekDays(selectedDate: Date): CalendarDay[] {
  const todayIso = toIsoDate(new Date());
  const selectedIso = toIsoDate(selectedDate);
  const weekStart = getWeekStart(selectedDate);

  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(weekStart, index);
    const iso = toIsoDate(date);

    return {
      date,
      iso,
      dayNumber: date.getDate(),
      isCurrentMonth: true,
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
      isPast: iso < todayIso,
    };
  });
}

function getBookingsForDate(bookings: any[], iso: string) {
  return bookings
    .filter((booking) => booking.event_date === iso)
    .sort((a, b) =>
      String(a.event_start_time || "").localeCompare(
        String(b.event_start_time || "")
      )
    );
}

function getBookingsForHour(bookings: any[], hour: string) {
  return bookings.filter((booking) => {
    const start = String(booking.event_start_time || "");
    return start.startsWith(hour.slice(0, 2));
  });
}

function getBookingProduct(booking: any) {
  return booking.booking_items?.[0]?.products || null;
}

function formatDisplayTime(value: string | null | undefined, timeFormat: TimeFormat) {
  const formatted = formatTime(value, timeFormat);
  return formatted || "—";
}

function formatDisplayTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
  timeFormat: TimeFormat
) {
  return `${formatDisplayTime(start, timeFormat)} - ${formatDisplayTime(end, timeFormat)}`;
}

function parseTimeToMinutes(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return null;
  }

  const hoursValue = Number(match[1]);
  const minutesValue = Number(match[2]);

  if (
    !Number.isFinite(hoursValue) ||
    !Number.isFinite(minutesValue) ||
    hoursValue < 0 ||
    hoursValue > 23 ||
    minutesValue < 0 ||
    minutesValue > 59
  ) {
    return null;
  }

  return hoursValue * 60 + minutesValue;
}

function buildDayTimelineLayout(params: {
  bookings: any[];
  dayStartMinutes: number;
  dayEndMinutes: number;
  pxPerMinute: number;
}) {
  const rows = params.bookings
    .map((booking) => {
      const startRaw = parseTimeToMinutes(booking.event_start_time);
      const endRaw = parseTimeToMinutes(booking.event_end_time);

      if (startRaw === null) {
        return null;
      }

      let endMinutes = endRaw === null ? startRaw + 60 : endRaw;

      if (endMinutes <= startRaw) {
        endMinutes += 24 * 60;
      }

      const start = Math.max(params.dayStartMinutes, Math.min(startRaw, params.dayEndMinutes));
      const end = Math.max(start + 30, Math.min(endMinutes, params.dayEndMinutes));

      if (end <= params.dayStartMinutes || start >= params.dayEndMinutes) {
        return null;
      }

      return {
        booking,
        startMinutes: start,
        endMinutes: end,
        column: 0,
        columnsInGroup: 1,
      };
    })
    .filter(Boolean) as Array<{
    booking: any;
    startMinutes: number;
    endMinutes: number;
    column: number;
    columnsInGroup: number;
  }>;

  rows.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) {
      return a.startMinutes - b.startMinutes;
    }

    return a.endMinutes - b.endMinutes;
  });

  let index = 0;

  while (index < rows.length) {
    let groupEnd = rows[index].endMinutes;
    let nextIndex = index + 1;

    while (nextIndex < rows.length && rows[nextIndex].startMinutes < groupEnd) {
      groupEnd = Math.max(groupEnd, rows[nextIndex].endMinutes);
      nextIndex += 1;
    }

    const groupRows = rows.slice(index, nextIndex);
    const active: Array<{ endMinutes: number; column: number }> = [];
    let maxColumns = 1;

    for (const row of groupRows) {
      for (let activeIndex = active.length - 1; activeIndex >= 0; activeIndex -= 1) {
        if (active[activeIndex].endMinutes <= row.startMinutes) {
          active.splice(activeIndex, 1);
        }
      }

      const occupied = new Set(active.map((item) => item.column));
      let column = 0;

      while (occupied.has(column)) {
        column += 1;
      }

      row.column = column;
      active.push({ endMinutes: row.endMinutes, column });
      maxColumns = Math.max(maxColumns, column + 1);
    }

    for (const row of groupRows) {
      row.columnsInGroup = maxColumns;
    }

    index = nextIndex;
  }

  return rows.map((row) => ({
    ...row,
    top: (row.startMinutes - params.dayStartMinutes) * params.pxPerMinute,
    height: Math.max(74, (row.endMinutes - row.startMinutes) * params.pxPerMinute),
  }));
}

function getViewHref(view: CalendarView, dateIso: string) {
  return `/admin/calendar?view=${view}&date=${dateIso}`;
}

function getNewBookingHref(dateIso: string, startTime: string) {
  const params = new URLSearchParams({ eventDate: dateIso, eventStartTime: startTime });
  return `/admin/bookings/new?${params.toString()}`;
}

function ViewSwitcher({
  currentView,
  selectedIso,
}: {
  currentView: CalendarView;
  selectedIso: string;
}) {
  const views: { id: CalendarView; label: string }[] = [
    {
      id: "day",
      label: "Day",
    },
    {
      id: "week",
      label: "Week",
    },
    {
      id: "month",
      label: "Month",
    },
  ];

  return (
    <div className="inline-flex w-full rounded-xl border border-[#d8cec0] bg-[#fcfaf7] p-1 sm:w-auto sm:rounded-full">
      {views.map((view) => {
        const active = currentView === view.id;

        return (
          <Link
            key={view.id}
            href={getViewHref(view.id, selectedIso)}
            className={[
              "flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:flex-none sm:rounded-full sm:px-5 sm:text-sm",
              active
                ? "bg-[#23313f] text-white shadow-sm"
                : "text-[#6c6258] hover:bg-white",
            ].join(" ")}
          >
            {view.label}
          </Link>
        );
      })}
    </div>
  );
}

function SmallBookingCard({
  booking,
  timeFormat,
}: {
  booking: any;
  timeFormat: TimeFormat;
}) {
  const product = getBookingProduct(booking);
  const markerColor = getBookingMarkerColor(booking, booking.booking_modifiers || []);

  return (
    <Link
      href={`/admin/bookings/${booking.id}`}
      className="block rounded-xl px-2.5 py-2 text-left shadow-sm ring-1 transition hover:shadow-md"
      style={{ backgroundColor: `${markerColor}18`, borderColor: `${markerColor}45` }}
    >
      <div className="truncate text-[12px] font-semibold text-[#1f1e1b]">
        {formatDisplayTime(booking.event_start_time, timeFormat)} · {product?.name || "Booking"}
      </div>

      <div className="mt-0.5 truncate text-[11px] text-[#6c6258]">
        {booking.customers?.full_name || "No client"}
      </div>
    </Link>
  );
}

function LargeBookingCard({
  booking,
  returnTo,
  timeFormat,
}: {
  booking: any;
  returnTo?: string;
  timeFormat: TimeFormat;
}) {
  const product = getBookingProduct(booking);
  const markerColor = getBookingMarkerColor(booking, booking.booking_modifiers || []);
  const cardReturnTo = returnTo || "/admin/calendar";
  const markerColorFormId = `marker-color-form-${booking.id}`;

  return (
    <Link
      href={`/admin/bookings/${booking.id}`}
      className="block rounded-[24px] border p-4 transition hover:bg-white hover:shadow-md"
      style={{ borderColor: `${markerColor}55`, backgroundColor: `${markerColor}10` }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6c6258]">
          <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/5" style={{ backgroundColor: markerColor }} />
          {getBookingMarkerLabel(booking, booking.booking_modifiers || [])} marker
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f7f6b]">
            Color
          </label>

          <input
            type="color"
            name="markerColor"
            defaultValue={markerColor}
            className="h-8 w-8 cursor-pointer rounded-full border border-[#d8cec0] bg-white p-0.5"
            aria-label="Change booking marker color"
            form={markerColorFormId}
          />
        </div>
      </div>

      <div className="flex gap-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-white"
          style={{ backgroundColor: `${markerColor}24` }}
        >
          {product?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[10px] text-[#9f9488]">No photo</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-[#1f1e1b]">
            {product?.name || "Booking"}
          </div>

          <div className="mt-1 text-sm text-[#6c6258]">
            {formatDisplayTimeRange(booking.event_start_time, booking.event_end_time, timeFormat)}
          </div>

          <div className="mt-1 truncate text-sm text-[#6c6258]">
            {booking.customers?.full_name || "No client"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span
          className={[
            "rounded-full px-3 py-1 text-xs font-semibold ring-1",
            getStatusClass(booking.status),
          ].join(" ")}
        >
          {prettyStatus(booking.status)}
        </span>

        <div className="text-sm font-semibold text-[#1f1e1b]">
          {formatMoney(booking.total_amount)}
        </div>
      </div>

      <form id={markerColorFormId} action={updateBookingMarkerColorAction} className="mt-3 flex items-center gap-2">
        <input type="hidden" name="bookingId" value={booking.id} />
        <input type="hidden" name="returnTo" value={cardReturnTo} />

        <button
          type="submit"
          className="rounded-full bg-[#23313f] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#18222d]"
        >
          Save
        </button>
      </form>

      <div className="mt-3 text-xs text-[#8f7f6b]">
        #{booking.booking_number || booking.id.slice(0, 8)} ·{" "}
        {[booking.setup_city, booking.setup_zip].filter(Boolean).join(", ") ||
          "No location"}
      </div>
    </Link>
  );
}

function MonthView({
  days,
  bookings,
  timeFormat,
}: {
  days: CalendarDay[];
  bookings: any[];
  timeFormat: TimeFormat;
}) {
  return (
    <>
      <div className="overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:hidden">
        <div className="grid grid-cols-7 border-b border-[#eee5d9] bg-[#fcfaf7] text-center text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
          {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
            <div key={`${day}-${index}`} className="py-2.5">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayBookings = getBookingsForDate(bookings, day.iso);

            return (
              <Link
                key={day.iso}
                href={getViewHref("day", day.iso)}
                className={[
                  "relative flex min-h-[68px] flex-col items-center justify-start border-b border-r border-[#f0e7dc] px-1 py-2 transition",
                  day.isSelected
                    ? "bg-[#eaf2f9]"
                    : day.isPast
                      ? "bg-[#fafafa]"
                      : "bg-white",
                  !day.isCurrentMonth ? "opacity-35" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-bold",
                    day.isSelected
                      ? "bg-[#23313f] text-white"
                      : day.isToday
                        ? "bg-[#c9964f] text-white"
                        : "text-[#302a25]",
                  ].join(" ")}
                >
                  {day.dayNumber}
                </span>

                {dayBookings.length > 0 ? (
                  <span className="mt-1.5 inline-flex min-w-7 items-center justify-center rounded-full bg-[#23313f] px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {dayBookings.length}
                  </span>
                ) : (
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#e6ddd3]" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="border-t border-[#eee5d9] bg-[#fcfaf7] px-3 py-2.5 text-center text-[11px] font-medium text-[#7a7066]">
          Tap a date to open its day schedule
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)] sm:block">
        <div className="grid grid-cols-7 border-b border-[#eee5d9] bg-[#fcfaf7] text-center text-xs font-semibold uppercase tracking-[0.14em] text-[#9a7a49]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="px-3 py-4">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayBookings = getBookingsForDate(bookings, day.iso);

            return (
              <Link
                key={day.iso}
                href={getViewHref("day", day.iso)}
                className={[
                  "min-h-[150px] border-b border-r border-[#f0e7dc] p-3 transition hover:bg-[#fcfaf7]",
                  day.isSelected ? "bg-[#eaf2f9]" : day.isPast ? "bg-[#f5f5f5]" : "bg-white",
                  !day.isCurrentMonth ? "opacity-45" : "",
                ].join(" ")}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div
                    className={[
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                      day.isSelected
                        ? "bg-[#23313f] text-white"
                        : day.isToday
                          ? "bg-[#c9964f] text-white"
                          : "bg-[#fcfaf7] text-[#3a342d] ring-1 ring-[#eee5d9]",
                    ].join(" ")}
                  >
                    {day.dayNumber}
                  </div>

                  {dayBookings.length > 0 && (
                    <div className="rounded-full bg-[#23313f] px-2 py-1 text-xs font-semibold text-white">
                      {dayBookings.length}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  {dayBookings.slice(0, 3).map((booking: any) => (
                    <SmallBookingCard
                      key={booking.id}
                      booking={booking}
                      timeFormat={timeFormat}
                    />
                  ))}

                  {dayBookings.length > 3 && (
                    <div className="rounded-xl bg-[#23313f] px-2.5 py-1.5 text-[11px] font-semibold text-white">
                      +{dayBookings.length - 3} more
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function WeekView({
  days,
  bookings,
  timeFormat,
}: {
  days: CalendarDay[];
  bookings: any[];
  timeFormat: TimeFormat;
}) {
  return (
    <>
      <div className="space-y-3 sm:hidden">
        <div className="overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.05)]">
          <div className="grid grid-cols-7 border-b border-[#eee5d9] bg-[#fcfaf7]">
            {days.map((day) => {
              const dayBookings = getBookingsForDate(bookings, day.iso);

              return (
                <Link
                  key={day.iso}
                  href={getViewHref("day", day.iso)}
                  className={[
                    "flex min-w-0 flex-col items-center gap-1 border-r border-[#eee5d9] px-1 py-2.5 text-center",
                    day.isSelected ? "bg-[#eaf2f9]" : "bg-white",
                  ].join(" ")}
                >
                  <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                    {new Intl.DateTimeFormat("en-US", {
                      weekday: "narrow",
                    }).format(day.date)}
                  </span>

                  <span
                    className={[
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                      day.isToday
                        ? "bg-[#c9964f] text-white"
                        : day.isSelected
                          ? "bg-[#23313f] text-white"
                          : "text-[#2c2824]",
                    ].join(" ")}
                  >
                    {day.dayNumber}
                  </span>

                  <span
                    className={[
                      "text-[9px] font-semibold",
                      dayBookings.length > 0
                        ? "text-[#23313f]"
                        : "text-[#b7ada3]",
                    ].join(" ")}
                  >
                    {dayBookings.length || "·"}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="px-3 py-2 text-[10px] font-medium text-[#7c7167]">
            Tap a day to open the full schedule
          </div>
        </div>

        <div className="space-y-3">
          {days.map((day) => {
            const dayBookings = getBookingsForDate(bookings, day.iso);

            return (
              <section
                key={`agenda-${day.iso}`}
                className="overflow-hidden rounded-[20px] border border-[#eadfd1] bg-white"
              >
                <Link
                  href={getViewHref("day", day.iso)}
                  className={[
                    "flex items-center justify-between gap-3 border-b border-[#eee5d9] px-4 py-3",
                    day.isToday ? "bg-[#fff8e8]" : "bg-[#fcfaf7]",
                  ].join(" ")}
                >
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49]">
                      {new Intl.DateTimeFormat("en-US", {
                        weekday: "long",
                      }).format(day.date)}
                    </div>
                    <div className="mt-0.5 text-base font-bold text-[#1f1e1b]">
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                      }).format(day.date)}
                    </div>
                  </div>

                  <span className="rounded-full bg-[#f4ede2] px-2.5 py-1 text-[10px] font-bold text-[#6c6258]">
                    {dayBookings.length} {dayBookings.length === 1 ? "booking" : "bookings"}
                  </span>
                </Link>

                {dayBookings.length > 0 ? (
                  <div className="divide-y divide-[#eee5d9]">
                    {dayBookings.map((booking: any) => {
                      const product = getBookingProduct(booking);
                      const markerColor = getBookingMarkerColor(
                        booking,
                        booking.booking_modifiers || [],
                      );

                      return (
                        <Link
                          key={booking.id}
                          href={`/admin/bookings/${booking.id}`}
                          className="flex items-start gap-3 px-4 py-3 transition active:bg-[#faf7f3]"
                        >
                          <div className="w-[62px] shrink-0 pt-0.5">
                            <div className="text-xs font-bold text-[#1f1e1b]">
                              {formatDisplayTime(
                                booking.event_start_time,
                                timeFormat,
                              )}
                            </div>
                            <div className="mt-0.5 text-[10px] text-[#8b8177]">
                              {formatDisplayTime(
                                booking.event_end_time,
                                timeFormat,
                              )}
                            </div>
                          </div>

                          <div
                            className="mt-1 h-10 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: markerColor }}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-[#1f1e1b]">
                              {product?.name || "Booking"}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-[#6c6258]">
                              {booking.customers?.full_name || "No client"}
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <span
                                className={[
                                  "rounded-full px-2 py-0.5 text-[9px] font-bold ring-1",
                                  getStatusClass(booking.status),
                                ].join(" ")}
                              >
                                {prettyStatus(booking.status)}
                              </span>
                              <span className="text-xs font-bold text-[#1f1e1b]">
                                {formatMoney(booking.total_amount)}
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-sm text-[#9a9188]">
                    No bookings
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)] sm:block">
        <div className="grid grid-cols-7 border-b border-[#eee5d9] bg-[#fcfaf7]">
          {days.map((day) => {
            const dayBookings = getBookingsForDate(bookings, day.iso);

            return (
              <Link
                key={day.iso}
                href={getViewHref("day", day.iso)}
                className={[
                  "border-r border-[#eee5d9] px-4 py-4 text-center transition hover:bg-white",
                  day.isSelected ? "bg-[#eaf2f9]" : "",
                ].join(" ")}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a7a49]">
                  {new Intl.DateTimeFormat("en-US", {
                    weekday: "short",
                  }).format(day.date)}
                </div>

                <div
                  className={[
                    "mx-auto mt-2 flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold",
                    day.isToday
                      ? "bg-[#c9964f] text-white"
                      : day.isSelected
                        ? "bg-[#23313f] text-white"
                        : "bg-white text-[#1f1e1b] ring-1 ring-[#eee5d9]",
                  ].join(" ")}
                >
                  {day.dayNumber}
                </div>

                <div className="mt-2 text-xs text-[#6c6258]">
                  {dayBookings.length} bookings
                </div>
              </Link>
            );
          })}
        </div>

        <div className="grid grid-cols-[80px_1fr]">
          <div className="border-r border-[#eee5d9] bg-[#fcfaf7]">
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-[86px] border-b border-[#eee5d9] px-3 py-3 text-xs font-semibold text-[#8f7f6b]"
              >
                {formatDisplayTime(hour, timeFormat)}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const dayBookings = getBookingsForDate(bookings, day.iso);

              return (
                <div key={day.iso} className="border-r border-[#eee5d9]">
                  {hours.map((hour) => {
                    const hourBookings = getBookingsForHour(dayBookings, hour);

                    return (
                      <div
                        key={`${day.iso}-${hour}`}
                        className="min-h-[86px] border-b border-[#eee5d9] p-2"
                      >
                        <div className="space-y-2">
                          {hourBookings.map((booking: any) => (
                            <SmallBookingCard
                              key={booking.id}
                              booking={booking}
                              timeFormat={timeFormat}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function DayView({
  selectedDate,
  bookings,
  timeFormat,
}: {
  selectedDate: Date;
  bookings: any[];
  timeFormat: TimeFormat;
}) {
  const selectedIso = toIsoDate(selectedDate);
  const dayBookings = getBookingsForDate(bookings, selectedIso);
  const revenue = dayBookings.reduce((sum: number, booking: any) => {
    return sum + Number(booking.total_amount || 0);
  }, 0);
  const firstHourMinutes = parseTimeToMinutes(hours[0]) || 6 * 60;
  const lastHourMinutes = parseTimeToMinutes(hours[hours.length - 1]) || 22 * 60;
  const dayStartMinutes = firstHourMinutes;
  const dayEndMinutes = lastHourMinutes + 60;

  const mobileHourHeight = 76;
  const mobileTimelineHeight = hours.length * mobileHourHeight;
  const mobileTimelineRows = buildDayTimelineLayout({
    bookings: dayBookings,
    dayStartMinutes,
    dayEndMinutes,
    pxPerMinute: mobileHourHeight / 60,
  });

  const desktopHourHeight = 90;
  const desktopTimelineHeight = hours.length * desktopHourHeight;
  const desktopTimelineRows = buildDayTimelineLayout({
    bookings: dayBookings,
    dayStartMinutes,
    dayEndMinutes,
    pxPerMinute: desktopHourHeight / 60,
  });

  return (
    <>
      <div className="overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:hidden">
        <div className="border-b border-[#eee5d9] bg-white px-4 py-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9a7a49]">
                Day schedule
              </div>
              <div className="mt-1 text-xl font-bold tracking-tight text-[#1f1e1b]">
                {formatShortDay(selectedDate)}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-bold text-[#1f1e1b]">
                {dayBookings.length} {dayBookings.length === 1 ? "booking" : "bookings"}
              </div>
              <div className="mt-0.5 text-[11px] text-[#7c7167]">
                {formatMoney(revenue)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[54px_1fr]">
          <div className="border-r border-[#eee5d9] bg-[#fcfaf7]">
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-[76px] border-b border-[#eee5d9] px-1.5 pt-2 text-right text-[10px] font-semibold text-[#8f7f6b]"
              >
                {formatDisplayTime(hour, timeFormat)}
              </div>
            ))}
          </div>

          <div
            className="relative"
            style={{ height: `${mobileTimelineHeight}px` }}
          >
            {hours.map((hour, hourIndex) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-b border-[#eee5d9]"
                style={{
                  top: `${hourIndex * mobileHourHeight}px`,
                  height: `${mobileHourHeight}px`,
                }}
              >
                <Link
                  href={getNewBookingHref(selectedIso, hour)}
                  className="block h-full w-full active:bg-[#fcfaf7]"
                  aria-label={`Create booking at ${formatDisplayTime(
                    hour,
                    timeFormat,
                  )}`}
                />
              </div>
            ))}

            <div className="pointer-events-none absolute inset-0 z-10">
              {mobileTimelineRows.map((item) => {
                const markerColor = getBookingMarkerColor(
                  item.booking,
                  item.booking.booking_modifiers || [],
                );
                const product = getBookingProduct(item.booking);

                return (
                  <Link
                    key={item.booking.id}
                    href={`/admin/bookings/${item.booking.id}`}
                    className="pointer-events-auto absolute overflow-hidden rounded-xl border px-2 py-1.5 shadow-sm"
                    style={{
                      top: `${item.top + 3}px`,
                      height: `${Math.max(48, item.height - 6)}px`,
                      left: `calc(${(100 / item.columnsInGroup) * item.column}% + 4px)`,
                      width: `calc(${100 / item.columnsInGroup}% - 8px)`,
                      borderColor: `${markerColor}70`,
                      backgroundColor: `${markerColor}18`,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: markerColor }}
                      />
                      <span className="truncate text-[11px] font-bold text-[#1f1e1b]">
                        {product?.name || "Booking"}
                      </span>
                    </div>

                    <div className="mt-0.5 truncate text-[9px] font-semibold text-[#6c6258]">
                      {formatDisplayTimeRange(
                        item.booking.event_start_time,
                        item.booking.event_end_time,
                        timeFormat,
                      )}
                    </div>

                    <div className="truncate text-[9px] text-[#6c6258]">
                      {item.booking.customers?.full_name || "No client"}
                    </div>
                  </Link>
                );
              })}

              {mobileTimelineRows.length === 0 && (
                <div className="pointer-events-auto absolute left-4 right-4 top-6 rounded-2xl border border-dashed border-[#d8cec0] bg-white/95 p-4 text-center shadow-sm">
                  <div className="text-sm font-bold text-[#1f1e1b]">
                    No bookings for this day
                  </div>
                  <Link
                    href="/admin/bookings/new"
                    className="mt-3 inline-flex rounded-full bg-[#c9964f] px-4 py-2 text-xs font-semibold text-white"
                  >
                    + New booking
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden sm:block">
        <div className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] bg-[#fcfaf7] px-6 py-5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7a49]">
              Day schedule
            </div>

            <h3 className="mt-2 text-xl font-semibold text-[#1f1e1b]">
              {formatShortDay(selectedDate)}
            </h3>

            <div className="mt-2 text-sm text-[#6c6258]">
              {dayBookings.length} bookings · {formatMoney(revenue)}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="grid min-w-[740px] grid-cols-[76px_1fr] sm:grid-cols-[90px_1fr]">
              <div className="border-r border-[#eee5d9] bg-[#fcfaf7]">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="h-[90px] border-b border-[#eee5d9] px-2 py-3 text-xs font-semibold text-[#8f7f6b] sm:px-4"
                  >
                    {formatDisplayTime(hour, timeFormat)}
                  </div>
                ))}
              </div>

              <div
                className="relative"
                style={{ height: `${desktopTimelineHeight}px` }}
              >
                {hours.map((hour, hourIndex) => {
                  const slotHref = getNewBookingHref(selectedIso, hour);

                  return (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-b border-[#eee5d9]"
                      style={{
                        top: `${hourIndex * desktopHourHeight}px`,
                        height: `${desktopHourHeight}px`,
                      }}
                    >
                      <Link
                        href={slotHref}
                        className="block h-full w-full cursor-pointer transition hover:bg-[#fcfaf7]"
                        aria-label={`Create booking at ${formatDisplayTime(
                          hour,
                          timeFormat,
                        )}`}
                      />
                    </div>
                  );
                })}

                <div className="pointer-events-none absolute inset-0 z-10">
                  {desktopTimelineRows.map((item) => {
                    const markerColor = getBookingMarkerColor(
                      item.booking,
                      item.booking.booking_modifiers || [],
                    );
                    const product = getBookingProduct(item.booking);
                    const markerColorFormId = `marker-color-form-day-${item.booking.id}`;

                    return (
                      <div
                        key={item.booking.id}
                        className="pointer-events-auto absolute overflow-hidden rounded-2xl border p-2.5 shadow-sm"
                        style={{
                          top: `${item.top + 4}px`,
                          height: `${Math.max(68, item.height - 8)}px`,
                          left: `calc(${(100 / item.columnsInGroup) * item.column}% + 6px)`,
                          width: `calc(${100 / item.columnsInGroup}% - 12px)`,
                          borderColor: `${markerColor}55`,
                          backgroundColor: `${markerColor}10`,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6c6258]">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: markerColor }}
                            />
                            {getBookingMarkerLabel(
                              item.booking,
                              item.booking.booking_modifiers || [],
                            )}
                          </div>

                          <input
                            type="color"
                            name="markerColor"
                            defaultValue={markerColor}
                            className="h-6 w-6 cursor-pointer rounded-full border border-[#d8cec0] bg-white p-0.5"
                            aria-label="Change booking marker color"
                            form={markerColorFormId}
                          />
                        </div>

                        <Link
                          href={`/admin/bookings/${item.booking.id}`}
                          className="mt-1.5 block truncate text-sm font-semibold text-[#1f1e1b] hover:underline"
                        >
                          {product?.name || "Booking"}
                        </Link>

                        <div className="mt-0.5 truncate text-xs text-[#6c6258]">
                          {formatDisplayTimeRange(
                            item.booking.event_start_time,
                            item.booking.event_end_time,
                            timeFormat,
                          )}
                        </div>

                        <div className="truncate text-xs text-[#6c6258]">
                          {item.booking.customers?.full_name || "No client"}
                        </div>

                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
                              getStatusClass(item.booking.status),
                            ].join(" ")}
                          >
                            {prettyStatus(item.booking.status)}
                          </span>

                          <span className="text-xs font-semibold text-[#1f1e1b]">
                            {formatMoney(item.booking.total_amount)}
                          </span>
                        </div>

                        <form
                          id={markerColorFormId}
                          action={updateBookingMarkerColorAction}
                          className="mt-1.5"
                        >
                          <input
                            type="hidden"
                            name="bookingId"
                            value={item.booking.id}
                          />
                          <input
                            type="hidden"
                            name="returnTo"
                            value={`/admin/calendar?view=day&date=${selectedIso}`}
                          />

                          <button
                            type="submit"
                            className="rounded-full bg-[#23313f] px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-[#18222d]"
                          >
                            Save
                          </button>
                        </form>
                      </div>
                    );
                  })}

                  {desktopTimelineRows.length === 0 && (
                    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center p-8">
                      <div className="rounded-[24px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] p-8 text-center">
                        <div className="text-sm font-semibold text-[#1f1e1b]">
                          No bookings for this day
                        </div>

                        <p className="mt-2 text-sm text-[#6c6258]">
                          Create a new booking or pick another date.
                        </p>

                        <Link
                          href="/admin/bookings/new"
                          className="mt-5 inline-flex rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
                        >
                          + New booking
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default async function AdminCalendarPage(props: PageProps) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const selectedDate = parseSelectedDate(searchParams.date);
  const selectedIso = toIsoDate(selectedDate);
  const view = parseView(searchParams.view);

  const range = getDateRangeForView(selectedDate, view);
  const queryStart = toIsoDate(addDays(range.start, -7));
  const queryEnd = toIsoDate(addDays(range.end, 7));

  const previousDateIso = toIsoDate(getPreviousDate(selectedDate, view));
  const nextDateIso = toIsoDate(getNextDate(selectedDate, view));
  const todayIso = toIsoDate(new Date());
  const navLabels = getNavigationLabel(view);

  const { supabase } = await requireAdminPermission("bookings.view");

  const [bookingsResult, settingsResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `
      id,
      booking_number,
      status,
      booking_source,
      payment_status,
      event_date,
      event_start_time,
      event_end_time,
      total_amount,
      balance_due,
      marker_color,
      setup_city,
      setup_zip,
      internal_notes,
      customers (
        id,
        full_name,
        phone,
        email
      ),
      booking_items (
        id,
        products (
          id,
          name,
          image_url,
          short_description
        )
      ),
      booking_modifiers (*),
      booking_price_calculations (
        id,
        calculation_snapshot,
        created_at
      )
    `
      )
      .gte("event_date", queryStart)
      .lte("event_date", queryEnd)
      .order("event_date", { ascending: true })
      .order("event_start_time", { ascending: true }),
    supabase
      .from("system_settings")
      .select("time_format")
      .limit(1)
      .maybeSingle(),
  ]);

  if (bookingsResult.error) {
    throw new Error(bookingsResult.error.message);
  }

  const timeFormat: TimeFormat = settingsResult.data?.time_format === "24h" ? "24h" : "12h";

  const bookings = (bookingsResult.data || []).filter((booking: any) => {
    const isUnpaidCustomerCheckoutHold =
      String(booking.booking_source || "").toLowerCase() === "customer_self_service" &&
      String(booking.status || "").toLowerCase() === "pending_deposit" &&
      Number(booking.amount_paid || 0) <= 0 &&
      ["", "unpaid"].includes(String(booking.payment_status || "").toLowerCase());

    return !isUnpaidCustomerCheckoutHold;
  });

  const rangeBookings = bookings.filter((booking: any) => {
    return (
      booking.event_date >= toIsoDate(range.start) &&
      booking.event_date <= toIsoDate(range.end)
    );
  });

  const rangeRevenue = rangeBookings.reduce((sum: number, booking: any) => {
    return sum + Number(booking.total_amount || 0);
  }, 0);

  const monthDays = buildMonthDays(selectedDate);
  const weekDays = buildWeekDays(selectedDate);

  return (
    <div className="space-y-4 pb-8 sm:space-y-6 sm:pb-0">
      <section className="overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_12px_36px_rgba(0,0,0,0.06)] sm:rounded-[32px] sm:shadow-[0_18px_70px_rgba(0,0,0,0.08)]">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="inline-flex rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Booking calendar
            </div>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#1f1e1b] sm:mt-4 sm:text-3xl lg:text-4xl">
              {formatPageTitle(selectedDate, view)}
            </h2>

            <p className="mt-3 hidden max-w-2xl text-sm leading-6 text-[#6c6258] sm:block">
              Switch between day, week and month views. Click any date in month
              or week view to open the day schedule.
            </p>

            <div className="mt-4 space-y-2.5 sm:mt-7 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:space-y-0">
              <ViewSwitcher currentView={view} selectedIso={selectedIso} />

              <div className="grid grid-cols-[44px_1fr_44px] gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                <Link
                  href={getViewHref(view, previousDateIso)}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white text-lg font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:h-auto sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                  aria-label={navLabels.previous}
                  title={navLabels.previous}
                >
                  <span className="sm:hidden">←</span>
                  <span className="hidden sm:inline">{navLabels.previous}</span>
                </Link>

                <Link
                  href={getViewHref(view, todayIso)}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-[#23313f] px-4 text-sm font-semibold text-white transition hover:bg-[#18222d] sm:h-auto sm:rounded-full sm:px-5 sm:py-3"
                >
                  Today
                </Link>

                <Link
                  href={getViewHref(view, nextDateIso)}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white text-lg font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:h-auto sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                  aria-label={navLabels.next}
                  title={navLabels.next}
                >
                  <span className="sm:hidden">→</span>
                  <span className="hidden sm:inline">{navLabels.next}</span>
                </Link>
              </div>

              <Link
                href="/admin/bookings/new"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#c9964f] px-5 text-sm font-semibold text-white transition hover:bg-[#b78744] sm:h-auto sm:w-auto sm:rounded-full sm:py-3"
              >
                + New booking
              </Link>
            </div>
          </div>

          <div className="bg-[#23313f] p-4 text-white sm:p-6 lg:p-8">
            <div className="text-sm font-medium text-white/55">
              {view === "day"
                ? "Day overview"
                : view === "week"
                  ? "Week overview"
                  : "Month overview"}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-1 sm:gap-4">
              <div className="min-w-0 rounded-[16px] bg-white/10 p-3 sm:rounded-[24px] sm:p-5">
                <div className="text-sm text-white/55">Bookings</div>
                <div className="mt-1 text-2xl font-semibold sm:mt-2 sm:text-4xl">
                  {rangeBookings.length}
                </div>
              </div>

              <div className="min-w-0 rounded-[16px] bg-white/10 p-3 sm:rounded-[24px] sm:p-5">
                <div className="text-sm text-white/55">Revenue</div>
                <div className="mt-1 truncate text-2xl font-semibold sm:mt-2 sm:text-4xl">
                  {formatMoney(rangeRevenue)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {view === "month" && <MonthView days={monthDays} bookings={bookings} timeFormat={timeFormat} />}

      {view === "week" && <WeekView days={weekDays} bookings={bookings} timeFormat={timeFormat} />}

      {view === "day" && <DayView selectedDate={selectedDate} bookings={bookings} timeFormat={timeFormat} />}
    </div>
  );
}
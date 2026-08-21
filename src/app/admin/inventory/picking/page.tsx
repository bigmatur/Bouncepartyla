import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getBookingMarkerColor } from "@/lib/booking/marker-color";
import { formatTime as formatSystemTime, type TimeFormat } from "@/lib/date-time-format";
import {
  setAllWarehousePickingItemsAction,
  toggleWarehousePickingItemAction,
} from "./actions";

type PageProps = {
  searchParams?: Promise<{ date?: string; view?: string }>;
};

type CalendarView = "week" | "month";

const statusColors: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  quote: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  booked: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  inventory_reserved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  scheduled: "bg-[#eaf2f9] text-[#355879] ring-[#cfe0ef]",
  picking: "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]",
  loaded: "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]",
  installed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  picked_up: "bg-[#eaf2f9] text-[#355879] ring-[#cfe0ef]",
  returned: "bg-[#eaf2f9] text-[#355879] ring-[#cfe0ef]",
  closed: "bg-neutral-100 text-neutral-600 ring-neutral-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseSelectedDate(value?: string) {
  const today = new Date();
  if (!value) return new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return new Date(year, month - 1, day);
}

function parseView(value?: string): CalendarView {
  return value === "week" ? "week" : "month";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getWeekStart(date: Date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return new Date(start.getFullYear(), start.getMonth(), start.getDate());
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function dateRange(date: Date, view: CalendarView) {
  if (view === "week") {
    const start = getWeekStart(date);
    return { start, end: addDays(start, 6) };
  }

  return { start: getMonthStart(date), end: getMonthEnd(date) };
}

function calendarDays(selectedDate: Date, view: CalendarView) {
  const selectedIso = toIsoDate(selectedDate);
  const todayIso = toIsoDate(new Date());

  if (view === "week") {
    const start = getWeekStart(selectedDate);
    return Array.from({ length: 7 }).map((_, index) => {
      const date = addDays(start, index);
      const iso = toIsoDate(date);
      return { date, iso, isSelected: iso === selectedIso, isToday: iso === todayIso, isCurrentMonth: true };
    });
  }

  const monthStart = getMonthStart(selectedDate);
  const monthEnd = getMonthEnd(selectedDate);
  let cursor = addDays(monthStart, -monthStart.getDay());
  const end = addDays(monthEnd, 6 - monthEnd.getDay());
  const days = [];

  while (cursor <= end) {
    const date = new Date(cursor);
    const iso = toIsoDate(date);
    days.push({
      date,
      iso,
      isSelected: iso === selectedIso,
      isToday: iso === todayIso,
      isCurrentMonth: date.getMonth() === selectedDate.getMonth(),
    });
    cursor = addDays(cursor, 1);
  }

  return days;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatTime(value: string | null | undefined, timeFormat: TimeFormat) {
  if (!value) return "-";
  return formatSystemTime(String(value).slice(0, 8), timeFormat) || String(value).slice(0, 5);
}

function prettyStatus(status: string | null | undefined) {
  return String(status || "unknown").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  return statusColors[String(status || "")] || "bg-neutral-100 text-neutral-600 ring-neutral-200";
}

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function bookingTitle(booking: any) {
  const products = (booking.booking_items || [])
    .map((item: any) => getOne(item.products)?.name)
    .filter(Boolean);

  return products.length > 0 ? products.slice(0, 2).join(" + ") : `Booking #${booking.booking_number || booking.id.slice(0, 8)}`;
}

function address(booking: any) {
  return [booking.setup_address, booking.setup_city, booking.setup_state, booking.setup_zip].filter(Boolean).join(", ");
}

function driverForBooking(booking: any) {
  const stop = (booking.route_stops || []).find((item: any) => item.stop_type === "delivery") || (booking.route_stops || [])[0];
  return String(stop?.driver_name || "Unassigned");
}

function stopForType(booking: any, type: "delivery" | "pickup") {
  return (booking.route_stops || []).find((item: any) => item.stop_type === type) || null;
}

function componentRows(booking: any) {
  return (booking.inventory_reservations || []).map((reservation: any) => {
    const item = getOne(reservation.inventory_items);
    const unit = getOne(reservation.inventory_units);
    return {
      id: String(reservation.id),
      name: item?.name || "Inventory item",
      imageUrl: item?.image_url || null,
      sku: item?.sku || null,
      quantity: Number(reservation.quantity || 1),
      status: String(reservation.status || "reserved"),
      unitCode: unit?.unit_code || null,
    };
  }).sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

    if (nameCompare !== 0) return nameCompare;

    return String(a.unitCode || "").localeCompare(String(b.unitCode || ""), undefined, { sensitivity: "base" });
  });
}

function progressForBooking(booking: any) {
  const rows = componentRows(booking).filter((row) => row.status !== "cancelled" && row.status !== "released");
  const total = rows.length;
  const done = rows.filter((row) => ["picked", "loaded", "installed", "returned", "consumed"].includes(row.status)).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const status = percent === 100 ? "Completed" : percent > 0 ? "Picking" : "Waiting";

  return { total, done, percent, status };
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-[#efe7dc]">
      <div className={percent === 100 ? "h-full bg-emerald-600" : "h-full bg-[#c9964f]"} style={{ width: `${percent}%` }} />
    </div>
  );
}

function Calendar({ bookings, days, selectedIso, view }: { bookings: any[]; days: ReturnType<typeof calendarDays>; selectedIso: string; view: CalendarView }) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-black/5 bg-white shadow-[0_10px_32px_rgba(0,0,0,0.04)]">
      <div className="grid grid-cols-7 border-b border-[#eee5d9] bg-[#fcfaf7] text-center text-[10px] font-bold uppercase tracking-[0.1em] text-[#9a7a49] sm:text-xs">
        {days.slice(0, 7).map((day) => (
          <div key={`head-${day.iso}`} className="py-2.5 sm:py-3">
            {new Intl.DateTimeFormat("en-US", { weekday: view === "week" ? "short" : "narrow" }).format(day.date)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayBookings = bookings.filter((booking) => booking.event_date === day.iso);
          return (
            <Link
              key={day.iso}
              href={`/admin/inventory/picking?view=${view}&date=${day.iso}`}
              className={[
                "min-h-[76px] border-b border-r border-[#f0e7dc] p-1.5 transition hover:bg-[#fcfaf7] sm:min-h-[130px] sm:p-3",
                day.isSelected ? "bg-[#eaf2f9]" : "bg-white",
                !day.isCurrentMonth ? "opacity-45" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={[
                  "flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-bold",
                  day.isSelected ? "bg-[#23313f] text-white" : day.isToday ? "bg-[#c9964f] text-white" : "text-[#302a25]",
                ].join(" ")}>{day.date.getDate()}</span>
                {dayBookings.length > 0 ? <span className="rounded-full bg-[#23313f] px-2 py-0.5 text-[10px] font-bold text-white">{dayBookings.length}</span> : null}
              </div>
              <div className="mt-2 hidden space-y-1 sm:block">
                {dayBookings.slice(0, 3).map((booking) => {
                  const markerColor = getBookingMarkerColor(booking, booking.booking_modifiers || []);
                  return (
                    <div key={booking.id} className="truncate rounded-lg px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: `${markerColor}18`, color: "#2f2a25" }}>
                      {booking.customers?.full_name || "Customer"}
                    </div>
                  );
                })}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function BookingCard({ booking, selectedIso, timeFormat }: { booking: any; selectedIso: string; timeFormat: TimeFormat }) {
  const markerColor = getBookingMarkerColor(booking, booking.booking_modifiers || []);
  const rows = componentRows(booking);
  const progress = progressForBooking(booking);
  const deliveryStop = stopForType(booking, "delivery");
  const pickupStop = stopForType(booking, "pickup");
  const isComplete = progress.percent === 100;

  return (
    <details className="overflow-hidden rounded-[24px] border bg-white shadow-[0_10px_32px_rgba(0,0,0,0.04)]" style={{ borderColor: `${markerColor}45` }}>
      <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: markerColor }} />
              <h3 className="truncate text-base font-bold text-[#1f1e1b] sm:text-lg">{bookingTitle(booking)}</h3>
              <span className={["rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 sm:text-xs", statusClass(booking.status)].join(" ")}>{prettyStatus(booking.status)}</span>
              <span className={isComplete ? "rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200" : "rounded-full bg-[#fff4d8] px-2.5 py-1 text-[10px] font-bold text-[#8a6b20] ring-1 ring-[#efd582]"}>{progress.status}</span>
            </div>
            <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">{booking.customers?.full_name || "No customer"}</div>
            <div className="mt-1 text-xs leading-5 text-[#6c6258]">{formatDate(booking.event_date)} · Event {formatTime(booking.event_start_time, timeFormat)} - {formatTime(booking.event_end_time, timeFormat)}</div>
            <div className="mt-1 text-xs leading-5 text-[#6c6258]">Delivery {formatTime(deliveryStop?.scheduled_start_time, timeFormat)} · Pickup {formatTime(pickupStop?.scheduled_start_time, timeFormat)} · Driver {driverForBooking(booking)}</div>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#8b8177]">{address(booking) || "No address"}</div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-bold text-[#6c6258]"><span>{progress.done}/{progress.total} items</span><span>{progress.percent}%</span></div>
            <ProgressBar percent={progress.percent} />
          </div>
        </div>
      </summary>

      <div className="border-t border-[#eee5d9] bg-[#fcfaf7] p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <form action={setAllWarehousePickingItemsAction}>
            <input type="hidden" name="bookingId" value={booking.id} />
            <input type="hidden" name="date" value={selectedIso} />
            <input type="hidden" name="picked" value={progress.percent === 100 ? "false" : "true"} />
            <button className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-bold text-white hover:bg-[#18222d]">
              {progress.percent === 100 ? "Clear all" : "Select all"}
            </button>
          </form>
          <Link href={`/admin/bookings/${booking.id}/inventory`} className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-bold text-[#23313f] hover:bg-white">Open inventory</Link>
        </div>
        <div className="grid gap-2">
          {rows.map((row) => {
            const picked = ["picked", "loaded", "installed", "returned", "consumed"].includes(row.status);
            return (
              <form key={row.id} action={toggleWarehousePickingItemAction} className={["grid grid-cols-[56px_1fr_64px] items-center gap-3 rounded-2xl border p-3 sm:grid-cols-[64px_1fr_90px]", picked ? "border-emerald-200 bg-emerald-50" : "border-[#eee5d9] bg-white"].join(" ")}>
                <input type="hidden" name="reservationId" value={row.id} />
                <input type="hidden" name="bookingId" value={booking.id} />
                <input type="hidden" name="date" value={selectedIso} />
                <input type="hidden" name="picked" value={picked ? "false" : "true"} />
                <div className="h-14 w-14 overflow-hidden rounded-xl bg-[#f1ebe3] sm:h-16 sm:w-16">
                  {row.imageUrl ? <img src={row.imageUrl} alt={row.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[#918579]">No photo</div>}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-[#1f1e1b]">{row.name}</div>
                  <div className="mt-0.5 text-xs text-[#6c6258]">Qty {row.quantity}{row.unitCode ? ` · ${row.unitCode}` : ""}{row.sku ? ` · ${row.sku}` : ""}</div>
                  {picked ? <div className="mt-1 text-xs font-bold text-emerald-700">Completed</div> : null}
                </div>
                <button className={["ml-auto flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold ring-1 sm:h-14 sm:w-14", picked ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-[#c2b8ad] ring-[#d8cec0]"].join(" ")} aria-label={picked ? "Mark not picked" : "Mark picked"}>
                  {picked ? "✓" : ""}
                </button>
              </form>
            );
          })}
          {rows.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d8cec0] bg-white px-4 py-8 text-center text-sm text-[#8b8177]">No inventory reservations for this booking.</div> : null}
        </div>
      </div>
    </details>
  );
}

export default async function WarehousePickingPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedDate = parseSelectedDate(params.date);
  const selectedIso = toIsoDate(selectedDate);
  const view = parseView(params.view);
  const range = dateRange(selectedDate, view);
  const rangeFrom = toIsoDate(range.start);
  const rangeTo = toIsoDate(range.end);
  const days = calendarDays(selectedDate, view);
  const { supabase } = await requireAdminPermission("inventory.view");

  const [bookingsResult, settingsResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(`
        id,
        booking_number,
        status,
        event_date,
        event_start_time,
        event_end_time,
        setup_address,
        setup_city,
        setup_state,
        setup_zip,
        marker_color,
        customers ( id, full_name, phone ),
        booking_items ( id, quantity, products ( id, name, image_url ) ),
        booking_modifiers ( id, modifier_group_option_id, notes ),
        route_stops ( id, stop_type, stop_date, scheduled_start_time, scheduled_end_time, driver_name, sort_order ),
        inventory_reservations (
          id,
          status,
          quantity,
          inventory_items ( id, name, sku, image_url, tracking_type ),
          inventory_units ( id, unit_code, status )
        )
      `)
      .gte("event_date", rangeFrom)
      .lte("event_date", rangeTo)
      .not("status", "in", "(cancelled,refunded)")
      .order("event_date", { ascending: true })
      .order("event_start_time", { ascending: true }),
    supabase.from("system_settings").select("time_format").limit(1).maybeSingle(),
  ]);

  if (bookingsResult.error) throw new Error(bookingsResult.error.message);

  const timeFormat: TimeFormat = settingsResult.data?.time_format === "24h" ? "24h" : "12h";
  const bookings = (bookingsResult.data || []).filter(
    (booking: any) => !["cancelled", "canceled", "refunded"].includes(String(booking.status || "").toLowerCase()),
  );
  const selectedBookings = bookings.filter((booking: any) => booking.event_date === selectedIso);
  const grouped = new Map<string, any[]>();

  for (const booking of selectedBookings) {
    const driver = driverForBooking(booking);
    const list = grouped.get(driver) || [];
    list.push(booking);
    grouped.set(driver, list);
  }

  const prevDate = view === "week" ? addDays(selectedDate, -7) : addMonths(selectedDate, -1);
  const nextDate = view === "week" ? addDays(selectedDate, 7) : addMonths(selectedDate, 1);

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <section className="rounded-[26px] border border-black/5 bg-white p-4 shadow-[0_10px_32px_rgba(0,0,0,0.035)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a723e]">Warehouse Picking</div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl">Pick orders for delivery</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">View-only booking calendar plus warehouse picking checklist. No prices, payments, deposits, balances or invoices are shown.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/inventory/picking?view=${view}&date=${toIsoDate(prevDate)}`} className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-sm font-bold text-[#23313f]">Previous</Link>
            <Link href={`/admin/inventory/picking?view=week&date=${selectedIso}`} className={view === "week" ? "rounded-full bg-[#23313f] px-4 py-2 text-sm font-bold text-white" : "rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-sm font-bold text-[#23313f]"}>Week</Link>
            <Link href={`/admin/inventory/picking?view=month&date=${selectedIso}`} className={view === "month" ? "rounded-full bg-[#23313f] px-4 py-2 text-sm font-bold text-white" : "rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-sm font-bold text-[#23313f]"}>Month</Link>
            <Link href={`/admin/inventory/picking?view=${view}&date=${toIsoDate(nextDate)}`} className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-sm font-bold text-[#23313f]">Next</Link>
          </div>
        </div>
      </section>

      <Calendar bookings={bookings} days={days} selectedIso={selectedIso} view={view} />

      <section className="space-y-5">
        {Array.from(grouped.entries()).map(([driver, driverBookings]) => {
          const completed = driverBookings.filter((booking) => progressForBooking(booking).percent === 100).length;
          const percent = driverBookings.length === 0 ? 0 : Math.round((completed / driverBookings.length) * 100);

          return (
            <section key={driver} className="space-y-3">
              <div className="rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_26px_rgba(0,0,0,0.03)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#9a723e]">Driver</div>
                    <h3 className="mt-1 text-xl font-bold text-[#1f1e1b]">{driver}</h3>
                  </div>
                  <div className="min-w-[180px]">
                    <div className="mb-1 flex justify-between text-xs font-bold text-[#6c6258]"><span>{completed}/{driverBookings.length} orders</span><span>{percent}%</span></div>
                    <ProgressBar percent={percent} />
                  </div>
                </div>
              </div>
              {driverBookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} selectedIso={selectedIso} timeFormat={timeFormat} />
              ))}
            </section>
          );
        })}

        {selectedBookings.length === 0 ? <div className="rounded-[24px] border border-dashed border-[#d8cec0] bg-white px-4 py-12 text-center text-sm text-[#8b8177]">No bookings for {formatDate(selectedIso)}.</div> : null}
      </section>
    </div>
  );
}
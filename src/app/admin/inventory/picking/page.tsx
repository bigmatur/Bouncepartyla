import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getBookingMarkerColor } from "@/lib/booking/marker-color";
import { formatTime as formatSystemTime, type TimeFormat } from "@/lib/date-time-format";
import {
  setAllWarehouseChecklistItemsAction,
  setAllWarehousePickingItemsAction,
} from "./actions";
import { PickingToggleButton } from "./PickingToggleButton";

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

function formatCalendarTitle(date: Date, view: CalendarView) {
  if (view === "month") {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
  }

  const start = getWeekStart(date);
  const end = addDays(start, 6);
  return `${formatShortDate(start)} – ${formatShortDate(end)}, ${end.getFullYear()}`;
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
  const stop = deliveryStopForBooking(booking);
  return String(stop?.driver_name || "Unassigned");
}

function truckForBooking(booking: any) {
  const stop = deliveryStopForBooking(booking);
  if (stop?.truck_name) return String(stop.truck_name);
  if (stop?.driver_name) return `${String(stop.driver_name)} route`;
  return "No vehicle assigned";
}

function deliveryStopForBooking(booking: any) {
  return (booking.route_stops || []).find((item: any) => item.stop_type === "delivery") || (booking.route_stops || [])[0] || null;
}

function pickingDateForBooking(booking: any) {
  return String(deliveryStopForBooking(booking)?.stop_date || "");
}

function stopForType(booking: any, type: "delivery" | "pickup") {
  return (booking.route_stops || []).find((item: any) => item.stop_type === type) || null;
}

function visibleChecklistItems(checklist: any[]) {
  const bookingItemIdsWithPhysicalRows = new Set(
    checklist
      .filter((item: any) => String(item.item_type || "").toLowerCase() !== "equipment")
      .map((item: any) => String(item.booking_item_id || ""))
      .filter(Boolean),
  );

  return checklist.filter((item: any) => {
    const isBookingEquipment = String(item.item_type || "").toLowerCase() === "equipment";
    const bookingItemId = String(item.booking_item_id || "");

    return !(isBookingEquipment && bookingItemId && bookingItemIdsWithPhysicalRows.has(bookingItemId));
  });
}

function componentRows(booking: any) {
  const checklist = Array.isArray(booking.booking_checklist_items)
    ? booking.booking_checklist_items
    : [];

  if (checklist.length > 0) {
    const visibleChecklist = visibleChecklistItems(checklist);
    const bookingItemImages = new Map<string, string | null>();
    const modifierParentsByInventoryItem = new Map<string, Set<string>>();
    for (const item of booking.booking_items || []) {
      bookingItemImages.set(String(item.id), getOne(item.products)?.image_url || null);
    }
    for (const modifier of booking.booking_modifiers || []) {
      const inventoryItemId = String(modifier.inventory_item_id || "");
      const bookingItemId = String(modifier.booking_item_id || "");
      if (!inventoryItemId || !bookingItemId) continue;
      const parents = modifierParentsByInventoryItem.get(inventoryItemId) || new Set<string>();
      parents.add(bookingItemId);
      modifierParentsByInventoryItem.set(inventoryItemId, parents);
    }

    return visibleChecklist.map((item: any) => {
      const inventoryItem = getOne(item.inventory_items);
      const unit = getOne(item.inventory_units);
      const inventoryItemId = String(item.inventory_item_id || inventoryItem?.id || "");
      const explicitBookingItemId = String(item.booking_item_id || "");
      const modifierParents = modifierParentsByInventoryItem.get(inventoryItemId);
      const inferredBookingItemId = modifierParents?.size === 1
        ? Array.from(modifierParents)[0]
        : "";
      const bookingItemId = explicitBookingItemId || inferredBookingItemId;
      return {
        id: String(item.id),
        kind: "checklist" as const,
        bookingItemId,
        inventoryItemId,
        isAdditional: Boolean(
          inventoryItemId && bookingItemId &&
          (booking.booking_modifiers || []).some((modifier: any) =>
            String(modifier.booking_item_id || "") === bookingItemId &&
            String(modifier.inventory_item_id || "") === inventoryItemId,
          )
        ),
        name: String(item.title || inventoryItem?.name || "Checklist item"),
        imageUrl: inventoryItem?.image_url || bookingItemImages.get(String(item.booking_item_id || "")) || null,
        sku: inventoryItem?.sku || null,
        quantity: Number(item.quantity || 1),
        status: item.loaded ? "loaded" : "reserved",
        unitCode: unit?.unit_code || unit?.serial_number || null,
        itemType: String(item.item_type || item.source || "item").replace(/_/g, " "),
      };
    }).sort((a: any, b: any) => {
      const left = visibleChecklist.find((item: any) => String(item.id) === a.id);
      const right = visibleChecklist.find((item: any) => String(item.id) === b.id);
      return Number(left?.sort_order || 100) - Number(right?.sort_order || 100);
    });
  }

  return (booking.inventory_reservations || []).map((reservation: any) => {
    const item = getOne(reservation.inventory_items);
    const unit = getOne(reservation.inventory_units);
    return {
      id: String(reservation.id),
      kind: "reservation" as const,
      bookingItemId: String(reservation.booking_item_id || ""),
      inventoryItemId: String(reservation.inventory_item_id || item?.id || ""),
      isAdditional: String(reservation.requirement_type || "") === "modifier",
      name: item?.name || "Inventory item",
      imageUrl: item?.image_url || null,
      sku: item?.sku || null,
      quantity: Number(reservation.quantity || 1),
      status: String(reservation.status || "reserved"),
      unitCode: unit?.unit_code || null,
      itemType: "inventory",
    };
  }).sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

    if (nameCompare !== 0) return nameCompare;

    return String(a.unitCode || "").localeCompare(String(b.unitCode || ""), undefined, { sensitivity: "base" });
  });
}

function componentGroups(booking: any, rows: ReturnType<typeof componentRows>) {
  const groups: Array<{
    key: string;
    name: string;
    imageUrl: string | null;
    rows: ReturnType<typeof componentRows>;
    additionalRows: ReturnType<typeof componentRows>;
  }> = [];
  const assigned = new Set<string>();

  for (const [index, bookingItem] of (booking.booking_items || []).entries()) {
    const bookingItemId = String(bookingItem.id || "");
    const product = getOne(bookingItem.products);
    const allGroupedRows = rows.filter((row) => row.bookingItemId === bookingItemId);
    if (allGroupedRows.length === 0) continue;
    const groupedRows = allGroupedRows.filter((row) => !row.isAdditional);
    const additionalRows = allGroupedRows.filter((row) => row.isAdditional);

    allGroupedRows.forEach((row) => assigned.add(row.id));
    groups.push({
      key: bookingItemId || `product-${index}`,
      name: String(product?.name || `Product ${index + 1}`),
      imageUrl: product?.image_url || null,
      rows: groupedRows,
      additionalRows,
    });
  }

  const additionalRows = rows.filter((row) => !assigned.has(row.id));
  if (additionalRows.length > 0) {
    groups.push({
      key: "additional",
      name: "Additional booking items",
      imageUrl: null,
      rows: additionalRows,
      additionalRows: [],
    });
  }

  return groups;
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
    <>
      <section className="overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)] sm:hidden">
        <div className="grid grid-cols-7 border-b border-[#eee5d9] bg-[#fcfaf7] text-center text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
          {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
            <div key={`${label}-${index}`} className="py-2.5">{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayBookings = bookings.filter((booking) => pickingDateForBooking(booking) === day.iso);
            return (
              <Link
                key={day.iso}
                href={`/admin/inventory/picking?view=${view}&date=${day.iso}`}
                className={[
                  "relative flex min-h-[68px] min-w-0 flex-col items-center justify-start border-b border-r border-[#f0e7dc] px-1 py-2 transition",
                  day.isSelected ? "bg-[#eaf2f9]" : "bg-white",
                  !day.isCurrentMonth ? "opacity-35" : "",
                ].join(" ")}
              >
                <span className={[
                  "flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-bold",
                  day.isSelected ? "bg-[#23313f] text-white" : day.isToday ? "bg-[#c9964f] text-white" : "text-[#302a25]",
                ].join(" ")}>{day.date.getDate()}</span>
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
          Tap a date to open its delivery load
        </div>
      </section>

      <section className="hidden overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)] sm:block">
        <div className="grid grid-cols-7 border-b border-[#eee5d9] bg-[#fcfaf7] text-center text-xs font-semibold uppercase tracking-[0.14em] text-[#9a7a49]">
          {days.slice(0, 7).map((day) => (
            <div key={`head-${day.iso}`} className="px-3 py-4">
              {new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day.date)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayBookings = bookings.filter((booking) => pickingDateForBooking(booking) === day.iso);
            return (
              <Link
                key={day.iso}
                href={`/admin/inventory/picking?view=${view}&date=${day.iso}`}
                className={[
                  "flex min-h-[150px] min-w-0 flex-col border-b border-r border-[#f0e7dc] p-3 transition hover:bg-[#fcfaf7]",
                  day.isSelected ? "bg-[#eaf2f9]" : "bg-white",
                  !day.isCurrentMonth ? "opacity-45" : "",
                ].join(" ")}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className={[
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                    day.isSelected ? "bg-[#23313f] text-white" : day.isToday ? "bg-[#c9964f] text-white" : "bg-[#fcfaf7] text-[#3a342d] ring-1 ring-[#eee5d9]",
                  ].join(" ")}>{day.date.getDate()}</span>
                  {dayBookings.length > 0 ? <span className="rounded-full bg-[#23313f] px-2 py-1 text-xs font-semibold text-white">{dayBookings.length}</span> : null}
                </div>
                <div className="min-w-0 space-y-1.5">
                  {dayBookings.slice(0, 2).map((booking) => {
                    const markerColor = getBookingMarkerColor(booking, booking.booking_modifiers || []);
                    return (
                      <div key={booking.id} className="truncate rounded-xl px-2.5 py-2 text-[11px] font-semibold text-[#2f2a25] shadow-sm ring-1 ring-black/5" style={{ backgroundColor: `${markerColor}18` }}>
                        {booking.customers?.full_name || "Customer"}
                      </div>
                    );
                  })}
                  {dayBookings.length > 2 ? <div className="rounded-xl bg-[#23313f] px-2.5 py-1.5 text-[11px] font-semibold text-white">+{dayBookings.length - 2} more</div> : null}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}

function BookingCard({ booking, selectedIso, timeFormat, sequence }: { booking: any; selectedIso: string; timeFormat: TimeFormat; sequence: number }) {
  const markerColor = getBookingMarkerColor(booking, booking.booking_modifiers || []);
  const rows = componentRows(booking);
  const itemGroups = componentGroups(booking, rows);
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
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#23313f] px-2 text-xs font-black text-white">{sequence}</span>
              <h3 className="min-w-0 flex-1 basis-[calc(100%-90px)] whitespace-normal break-words text-sm font-bold leading-5 text-[#1f1e1b] sm:basis-auto sm:text-lg sm:leading-6">{bookingTitle(booking)}</h3>
              <span className={["rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 sm:text-xs", statusClass(booking.status)].join(" ")}>{prettyStatus(booking.status)}</span>
              <span className={isComplete ? "rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200" : "rounded-full bg-[#fff4d8] px-2.5 py-1 text-[10px] font-bold text-[#8a6b20] ring-1 ring-[#efd582]"}>{progress.status}</span>
            </div>
            <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">{booking.customers?.full_name || "No customer"}</div>
            <div className="mt-1 text-xs leading-5 text-[#6c6258]">Delivery {formatDate(deliveryStop?.stop_date)} · {formatTime(deliveryStop?.scheduled_start_time, timeFormat)}{deliveryStop?.scheduled_end_time ? ` - ${formatTime(deliveryStop.scheduled_end_time, timeFormat)}` : ""}</div>
            <div className="mt-1 text-xs leading-5 text-[#6c6258]">Event {formatDate(booking.event_date)} · {formatTime(booking.event_start_time, timeFormat)} - {formatTime(booking.event_end_time, timeFormat)} · Driver {driverForBooking(booking)}</div>
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
          <form action={rows[0]?.kind === "checklist" ? setAllWarehouseChecklistItemsAction : setAllWarehousePickingItemsAction}>
            <input type="hidden" name="bookingId" value={booking.id} />
            <input type="hidden" name="date" value={selectedIso} />
            {rows[0]?.kind === "checklist" ? (
              <input type="hidden" name="loaded" value={progress.percent === 100 ? "false" : "true"} />
            ) : (
              <input type="hidden" name="picked" value={progress.percent === 100 ? "false" : "true"} />
            )}
            <button className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-bold text-white hover:bg-[#18222d]">
              {progress.percent === 100 ? "Clear all" : "Select all"}
            </button>
          </form>
          <Link href={`/admin/bookings/${booking.id}/inventory`} className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-bold text-[#23313f] hover:bg-white">Open inventory</Link>
        </div>
        <div className="grid gap-3">
          {itemGroups.map((group, groupIndex) => (
            <section key={group.key} className="overflow-hidden rounded-[20px] border border-[#d9c8af] bg-[#f7f0e6] shadow-sm">
              <div className="flex items-center gap-3 border-b border-[#dfd1bf] bg-[#efe3d2] px-3 py-3 sm:px-4">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                  {group.imageUrl ? <img src={group.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[9px] font-bold text-[#9a8a78]">ITEM</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-[#9a723e]">Product {groupIndex + 1}</div>
                  <h4 className="whitespace-normal break-words text-sm font-black leading-5 text-[#23313f] sm:text-base">{group.name}</h4>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-[#6c6258]">{group.rows.length + group.additionalRows.length}</span>
              </div>
              <div className="grid gap-2 p-2 sm:p-3">
                {group.rows.map((row) => {
                  const picked = ["picked", "loaded", "installed", "returned", "consumed"].includes(row.status);
                  return (
                    <div key={row.id} className={["grid grid-cols-[56px_1fr_64px] items-center gap-3 rounded-2xl border p-3 sm:grid-cols-[64px_1fr_90px]", picked ? "border-emerald-200 bg-emerald-50" : "border-[#eee5d9] bg-white"].join(" ")}>
                      <div className="h-14 w-14 overflow-hidden rounded-xl bg-[#f1ebe3] sm:h-16 sm:w-16">
                        {row.imageUrl ? <img src={row.imageUrl} alt={row.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[#918579]">No photo</div>}
                      </div>
                      <div className="min-w-0">
                        <div className="line-clamp-2 whitespace-normal break-words text-[13px] font-bold leading-4 text-[#1f1e1b] sm:text-sm sm:leading-5">{row.name}</div>
                        <div className="mt-0.5 text-xs text-[#6c6258]">Qty {row.quantity}{row.unitCode ? ` · ${row.unitCode}` : ""}{row.sku ? ` · ${row.sku}` : ""}</div>
                        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a723e]">{row.itemType}</div>
                        {picked ? <div className="mt-1 text-xs font-bold text-emerald-700">Completed</div> : null}
                      </div>
                      <PickingToggleButton
                        kind={row.kind}
                        itemId={row.id}
                        bookingId={booking.id}
                        date={selectedIso}
                        initialChecked={picked}
                      />
                    </div>
                  );
                })}
                {group.additionalRows.length > 0 ? (
                  <div className="mt-1 rounded-xl bg-[#23313f] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#f0c987]">
                    Additional booking items
                  </div>
                ) : null}
                {group.additionalRows.map((row) => {
                  const picked = ["picked", "loaded", "installed", "returned", "consumed"].includes(row.status);
                  return (
                    <div key={row.id} className={["grid grid-cols-[56px_1fr_64px] items-center gap-3 rounded-2xl border p-3 sm:grid-cols-[64px_1fr_90px]", picked ? "border-emerald-200 bg-emerald-50" : "border-[#d9c8af] bg-[#fffdf9]"].join(" ")}>
                      <div className="h-14 w-14 overflow-hidden rounded-xl bg-[#f1ebe3] sm:h-16 sm:w-16">
                        {row.imageUrl ? <img src={row.imageUrl} alt={row.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[#918579]">No photo</div>}
                      </div>
                      <div className="min-w-0">
                        <div className="line-clamp-2 whitespace-normal break-words text-[13px] font-bold leading-4 text-[#1f1e1b] sm:text-sm sm:leading-5">{row.name}</div>
                        <div className="mt-0.5 text-xs text-[#6c6258]">Qty {row.quantity}{row.unitCode ? ` · ${row.unitCode}` : ""}{row.sku ? ` · ${row.sku}` : ""}</div>
                        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a723e]">{row.itemType}</div>
                        {picked ? <div className="mt-1 text-xs font-bold text-emerald-700">Completed</div> : null}
                      </div>
                      <PickingToggleButton kind={row.kind} itemId={row.id} bookingId={booking.id} date={selectedIso} initialChecked={picked} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
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

  const [routeStopsResult, settingsResult] = await Promise.all([
    supabase
      .from("route_stops")
      .select("id, booking_id, stop_type, stop_date, scheduled_start_time, scheduled_end_time, driver_name, truck_name, sort_order, created_at")
      .gte("stop_date", rangeFrom)
      .lte("stop_date", rangeTo)
      .eq("stop_type", "delivery")
      .order("stop_date", { ascending: true })
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("scheduled_start_time", { ascending: true }),
    supabase.from("system_settings").select("time_format").limit(1).maybeSingle(),
  ]);

  if (routeStopsResult.error) throw new Error(routeStopsResult.error.message);

  const deliveryStops = (routeStopsResult.data || []).filter((stop: any) => stop.booking_id);
  const bookingIds = Array.from(new Set(deliveryStops.map((stop: any) => String(stop.booking_id))));
  const [bookingsResult, checklistResult] = bookingIds.length > 0
    ? await Promise.all([
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
            booking_modifiers ( id, booking_item_id, inventory_item_id, modifier_group_option_id, notes ),
            inventory_reservations (
              id,
              booking_item_id,
              inventory_item_id,
              requirement_type,
              status,
              quantity,
              inventory_items ( id, name, sku, image_url, tracking_type ),
              inventory_units ( id, unit_code, serial_number, status )
            )
          `)
          .in("id", bookingIds)
          .not("status", "in", "(cancelled,refunded)"),
        supabase
          .from("booking_checklist_items")
          .select(`
            id,
            booking_id,
            booking_item_id,
            inventory_item_id,
            inventory_unit_id,
            title,
            item_type,
            source,
            quantity,
            loaded,
            loaded_at,
            sort_order,
            inventory_items ( id, name, sku, image_url ),
            inventory_units ( id, unit_code, serial_number, status )
          `)
          .in("booking_id", bookingIds)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ])
    : [{ data: [], error: null } as any, { data: [], error: null } as any];

  if (bookingsResult.error) throw new Error(bookingsResult.error.message);
  if (checklistResult.error) throw new Error(checklistResult.error.message);

  const timeFormat: TimeFormat = settingsResult.data?.time_format === "24h" ? "24h" : "12h";
  const stopsByBookingId = new Map<string, any[]>();
  for (const stop of deliveryStops) {
    const key = String(stop.booking_id);
    const rows = stopsByBookingId.get(key) || [];
    rows.push(stop);
    stopsByBookingId.set(key, rows);
  }

  const checklistByBookingId = new Map<string, any[]>();
  for (const item of checklistResult.data || []) {
    const key = String((item as any).booking_id);
    const rows = checklistByBookingId.get(key) || [];
    rows.push(item);
    checklistByBookingId.set(key, rows);
  }

  const bookings = (bookingsResult.data || [])
    .filter((booking: any) => !["cancelled", "canceled", "refunded"].includes(String(booking.status || "").toLowerCase()))
    .map((booking: any) => ({
      ...booking,
      route_stops: stopsByBookingId.get(String(booking.id)) || [],
      booking_checklist_items: checklistByBookingId.get(String(booking.id)) || [],
    }));
  const selectedBookings = bookings
    .filter((booking: any) => pickingDateForBooking(booking) === selectedIso)
    .sort((left: any, right: any) => {
      const leftStop = deliveryStopForBooking(left);
      const rightStop = deliveryStopForBooking(right);
      const orderDifference = Number(leftStop?.sort_order ?? Number.MAX_SAFE_INTEGER) - Number(rightStop?.sort_order ?? Number.MAX_SAFE_INTEGER);
      if (orderDifference !== 0) return orderDifference;
      return String(leftStop?.scheduled_start_time || "").localeCompare(String(rightStop?.scheduled_start_time || ""));
    });
  const grouped = new Map<string, any[]>();

  for (const booking of selectedBookings) {
    const vehicle = truckForBooking(booking);
    const list = grouped.get(vehicle) || [];
    list.push(booking);
    grouped.set(vehicle, list);
  }

  const prevDate = view === "week" ? addDays(selectedDate, -7) : addMonths(selectedDate, -1);
  const nextDate = view === "week" ? addDays(selectedDate, 7) : addMonths(selectedDate, 1);
  const todayIso = toIsoDate(new Date());

  return (
    <div className="min-w-0 space-y-5 pb-10">
      <section className="rounded-[26px] border border-black/5 bg-white p-4 shadow-[0_10px_32px_rgba(0,0,0,0.035)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#9a723e]">Warehouse Picking</div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl">Pick orders for delivery</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">Load each vehicle in route order and mark the same checklist the driver sees. Prices, payments, deposits, balances and invoices are not shown.</p>
            <div className="mt-3 text-lg font-bold text-[#1f1e1b]">{formatCalendarTitle(selectedDate, view)}</div>
          </div>
          <div className="w-full space-y-2 lg:w-auto lg:min-w-[320px]">
            <div className="inline-flex w-full rounded-xl border border-[#d8cec0] bg-[#fcfaf7] p-1">
              <Link href={`/admin/inventory/picking?view=week&date=${selectedIso}`} className={view === "week" ? "flex-1 rounded-lg bg-[#23313f] px-4 py-2.5 text-center text-xs font-bold text-white shadow-sm" : "flex-1 rounded-lg px-4 py-2.5 text-center text-xs font-bold text-[#6c6258] hover:bg-white"}>Week</Link>
              <Link href={`/admin/inventory/picking?view=month&date=${selectedIso}`} className={view === "month" ? "flex-1 rounded-lg bg-[#23313f] px-4 py-2.5 text-center text-xs font-bold text-white shadow-sm" : "flex-1 rounded-lg px-4 py-2.5 text-center text-xs font-bold text-[#6c6258] hover:bg-white"}>Month</Link>
            </div>
            <div className="grid grid-cols-[44px_1fr_44px] gap-2">
              <Link href={`/admin/inventory/picking?view=${view}&date=${toIsoDate(prevDate)}`} className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white text-lg font-bold text-[#23313f]" aria-label="Previous period">←</Link>
              <Link href={`/admin/inventory/picking?view=${view}&date=${todayIso}`} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#23313f] px-4 text-sm font-bold text-white">Today</Link>
              <Link href={`/admin/inventory/picking?view=${view}&date=${toIsoDate(nextDate)}`} className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white text-lg font-bold text-[#23313f]" aria-label="Next period">→</Link>
            </div>
          </div>
        </div>
      </section>

      <Calendar bookings={bookings} days={days} selectedIso={selectedIso} view={view} />

      <section className="space-y-5">
        {Array.from(grouped.entries()).map(([vehicle, vehicleBookings]) => {
          const completed = vehicleBookings.filter((booking) => progressForBooking(booking).percent === 100).length;
          const percent = vehicleBookings.length === 0 ? 0 : Math.round((completed / vehicleBookings.length) * 100);
          const drivers = Array.from(new Set(vehicleBookings.map((booking) => driverForBooking(booking))));

          return (
            <section key={vehicle} className="space-y-3">
              <div className="rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_26px_rgba(0,0,0,0.03)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#9a723e]">Vehicle / load</div>
                    <h3 className="mt-1 text-xl font-bold text-[#1f1e1b]">{vehicle}</h3>
                    <p className="mt-1 text-xs font-semibold text-[#6c6258]">Driver: {drivers.join(", ")}</p>
                  </div>
                  <div className="min-w-[180px]">
                    <div className="mb-1 flex justify-between text-xs font-bold text-[#6c6258]"><span>{completed}/{vehicleBookings.length} orders</span><span>{percent}%</span></div>
                    <ProgressBar percent={percent} />
                  </div>
                </div>
              </div>
              {vehicleBookings.map((booking, index) => (
                <BookingCard key={booking.id} booking={booking} selectedIso={selectedIso} timeFormat={timeFormat} sequence={index + 1} />
              ))}
            </section>
          );
        })}

        {selectedBookings.length === 0 ? <div className="rounded-[24px] border border-dashed border-[#d8cec0] bg-white px-4 py-12 text-center text-sm text-[#8b8177]">No delivery routes for {formatDate(selectedIso)}.</div> : null}
      </section>
    </div>
  );
}

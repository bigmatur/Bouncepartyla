import { createClient } from "@/lib/supabase/server";
import {
  completeCurrentAndGoNextDriverStopAction,
  markDriverStopArrivedAction,
  markDriverStopPaymentCollectedAction,
  saveDriverStopNotesAction,
  updateDriverStopStatusAction,
} from "./actions";
import { bookingItemsProductSummary } from "@/lib/booking/booking-items-summary";
import DriverStopPhotoButtons from "./DriverStopPhotoButtons";

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function timeValue(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function formatTime(value: string | null | undefined) {
  const cleanValue = timeValue(value);

  if (!cleanValue) return "Any time";

  const date = new Date(`2000-01-01T${cleanValue}:00`);

  if (Number.isNaN(date.getTime())) return cleanValue;

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Scheduled";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  const value = String(status || "");

  if (["completed", "installed", "picked_up"].includes(value)) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (["arrived", "on_the_way"].includes(value)) {
    return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
  }

  if (["failed", "cancelled"].includes(value)) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
}

function stopTypeLabel(value: string | null | undefined) {
  if (value === "delivery") return "Delivery";
  if (value === "pickup") return "Pickup";
  if (value === "service") return "Service";
  if (value === "warehouse") return "Warehouse";
  return "Other";
}

function typeClass(stopType: string | null | undefined) {
  if (stopType === "pickup") {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  if (stopType === "delivery") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-[#f4ede2] text-[#6c6258] ring-1 ring-[#d8cec0]";
}

function phoneUrl(phone: string | null | undefined) {
  const cleanPhone = String(phone || "").replace(/[^\d+]/g, "");
  return cleanPhone ? `tel:${cleanPhone}` : "";
}

function isMissingColumnError(error: any, tableName: string, columnName: string) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  if (code === "42703") return true;

  return (
    message.includes("column") &&
    message.includes(String(columnName).toLowerCase()) &&
    message.includes(String(tableName).toLowerCase())
  );
}

function mapUrl(stop: any) {
  const address = [stop.address, stop.city, stop.state, stop.zip]
    .filter(Boolean)
    .join(", ");

  if (!address) return "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
}

function mainProductName(stop: any) {
  const booking = getOne(stop.bookings);
  const bookingItems = booking?.booking_items || [];

  return bookingItemsProductSummary(
    bookingItems,
    stop.items_summary?.split("\n")[0] || "Route stop",
  );
}

function bookingCustomer(stop: any) {
  const booking = getOne(stop.bookings);
  const customer = getOne(booking?.customers);

  return {
    name: customer?.full_name || stop.customer_name || "Customer",
    phone: customer?.phone || stop.customer_phone || "",
    email: customer?.email || "",
  };
}

function partyWindow(stop: any) {
  const booking = getOne(stop.bookings);

  if (!booking?.event_start_time && !booking?.event_end_time) {
    return "No party time";
  }

  return `${formatTime(booking?.event_start_time)} — ${formatTime(
    booking?.event_end_time
  )}`;
}

function routeWindow(stop: any) {
  const start = formatTime(stop.scheduled_start_time);
  const end = stop.scheduled_end_time ? formatTime(stop.scheduled_end_time) : "";

  if (stop.stop_type === "pickup") {
    return `Pickup time: ${start}${end ? ` — ${end}` : ""}`;
  }

  if (stop.stop_type === "delivery") {
    return `Delivery time: ${start}${end ? ` — ${end}` : ""}`;
  }

  return `Route time: ${start}${end ? ` — ${end}` : ""}`;
}

function addressText(stop: any) {
  return (
    [stop.address, stop.city, stop.state, stop.zip].filter(Boolean).join(", ") ||
    "No address"
  );
}

function canCompleteStop(stop: any) {
  const balanceDue = Number(stop.balance_due || 0);
  const paymentOk = balanceDue <= 0 || Boolean(stop.payment_collected);
  const proofOk = Boolean(stop.proof_photo_uploaded);

  return paymentOk && proofOk;
}

function cleanDetailText(value: string | null | undefined) {
  return String(value || "")
    .replace(/^(?:\[[^\]]+\])+\s*/g, "")
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/\s+·\s+.*$/, "")
    .trim();
}

function componentTitle(item: any) {
  const inventoryItem = getOne(item.inventory_items);
  const unit = getOne(item.inventory_units);

  const pieces = [cleanDetailText(item.title) || inventoryItem?.name || "Component"];

  if (item.quantity) {
    pieces.push(`x ${item.quantity}`);
  }

  if (unit?.unit_code) {
    pieces.push(unit.unit_code);
  }

  return pieces.join(" · ");
}

function optionTitle(item: any) {
  const label = cleanDetailText(item.label) || cleanDetailText(item.notes) || "Option";
  const pieces = [label];

  if (item.quantity) {
    pieces.push(`x ${item.quantity}`);
  }

  return pieces.join(" · ");
}

function isCompleted(stop: any) {
  return ["completed", "installed", "picked_up"].includes(String(stop.status || ""));
}

function isBreakStop(stop: any) {
  return (
    /\bbreak\b/i.test(String(stop.customer_name || "")) ||
    /\bbreak\b/i.test(String(stop.items_summary || "")) ||
    /\bbreak\b/i.test(String(stop.setup_notes || ""))
  );
}

function CompactPaymentForm({ stop }: { stop: any }) {
  if (Number(stop.balance_due || 0) <= 0) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
        No payment due
      </div>
    );
  }

  if (stop.payment_collected) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
        <div className="text-xs font-semibold uppercase tracking-[0.14em]">
          Payment collected
        </div>
        <div className="mt-1 text-xl font-semibold">
          {money(stop.payment_collected_amount || stop.balance_due)}
        </div>
        <div className="mt-1 text-xs">
          {prettyStatus(stop.payment_collected_method || "cash")}
          {stop.payment_collected_by ? ` · ${stop.payment_collected_by}` : ""}
          {stop.payment_collected_at ? ` · ${formatDateTime(stop.payment_collected_at)}` : ""}
        </div>
      </div>
    );
  }

  return (
    <form
      action={markDriverStopPaymentCollectedAction}
      className="rounded-2xl bg-[#fff8e8] p-4 ring-1 ring-[#ead6a8]"
    >
      <input type="hidden" name="stopId" value={stop.id} />
      <input type="hidden" name="bookingId" value={stop.booking_id || ""} />
      <input type="hidden" name="date" value={stop.stop_date || ""} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
            Collect payment
          </div>
          <div className="mt-1 text-2xl font-semibold text-[#8a6b20]">
            {money(stop.balance_due)}
          </div>
        </div>

        <button
          type="submit"
          className="rounded-full bg-[#c9964f] px-4 py-2 text-xs font-semibold text-white"
        >
          Mark paid
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_1fr] gap-2">
        <input
          name="amount"
          type="number"
          step="0.01"
          defaultValue={String(Number(stop.balance_due || 0))}
          className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-xs"
        />

        <select
          name="method"
          defaultValue="cash"
          className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-xs"
        >
          <option value="cash">Cash</option>
          <option value="zelle">Zelle</option>
          <option value="venmo">Venmo</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>

        <input
          name="collectedBy"
          defaultValue={stop.driver_name || ""}
          placeholder="Collected by"
          className="col-span-2 rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-xs"
        />
      </div>
    </form>
  );
}

export default async function DriverStopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const stopId = resolvedParams.id;

  const supabase = await createClient();

  const fullStopSelect = `
      id,
      booking_id,
      stop_date,
      stop_type,
      status,
      customer_name,
      customer_phone,
      address,
      city,
      state,
      zip,
      scheduled_start_time,
      scheduled_end_time,
      driver_name,
      truck_name,
      items_summary,
      surface,
      gate_code,
      parking_notes,
      setup_notes,
      pickup_notes,
      balance_due,
      sort_order,
      arrived_at,
      completed_at,
      created_at,
      updated_at,
      payment_collected,
      payment_collected_amount,
      payment_collected_method,
      payment_collected_at,
      payment_collected_by,
      driver_notes,
      proof_photo_required,
      proof_photo_uploaded,
      bookings (
        id,
        booking_number,
        balance_due,
        event_date,
        event_start_time,
        event_end_time,
        setup_address,
        setup_city,
        setup_state,
        setup_zip,
        customers (
          id,
          full_name,
          phone,
          email
        ),
        booking_items (
          id,
          quantity,
          products (
            id,
            name,
            image_url
          )
        )
      )
    `;

  const stopSelectWithoutNewColumns = `
      id,
      booking_id,
      stop_date,
      stop_type,
      status,
      customer_name,
      customer_phone,
      address,
      city,
      state,
      zip,
      scheduled_start_time,
      scheduled_end_time,
      driver_name,
      truck_name,
      items_summary,
      surface,
      gate_code,
      parking_notes,
      setup_notes,
      pickup_notes,
      balance_due,
      sort_order,
      arrived_at,
      completed_at,
      created_at,
      updated_at,
      payment_collected,
      proof_photo_uploaded,
      bookings (
        id,
        booking_number,
        balance_due,
        event_date,
        event_start_time,
        event_end_time,
        setup_address,
        setup_city,
        setup_state,
        setup_zip,
        customers (
          id,
          full_name,
          phone,
          email
        ),
        booking_items (
          id,
          quantity,
          products (
            id,
            name,
            image_url
          )
        )
      )
    `;

  const stopSelectLegacy = `
      id,
      booking_id,
      stop_date,
      stop_type,
      status,
      customer_name,
      customer_phone,
      address,
      city,
      state,
      zip,
      scheduled_start_time,
      scheduled_end_time,
      driver_name,
      truck_name,
      items_summary,
      surface,
      gate_code,
      parking_notes,
      setup_notes,
      pickup_notes,
      balance_due,
      sort_order,
      arrived_at,
      completed_at,
      created_at,
      updated_at,
      bookings (
        id,
        booking_number,
        balance_due,
        event_date,
        event_start_time,
        event_end_time,
        setup_address,
        setup_city,
        setup_state,
        setup_zip,
        customers (
          id,
          full_name,
          phone,
          email
        ),
        booking_items (
          id,
          quantity,
          products (
            id,
            name,
            image_url
          )
        )
      )
    `;

  let stopResult = await supabase
    .from("route_stops")
    .select(fullStopSelect)
    .eq("id", stopId)
    .maybeSingle();

  if (
    stopResult.error &&
    (isMissingColumnError(stopResult.error, "route_stops", "driver_notes") ||
      isMissingColumnError(stopResult.error, "route_stops", "proof_photo_required") ||
      isMissingColumnError(stopResult.error, "route_stops", "payment_collected_amount") ||
      isMissingColumnError(stopResult.error, "route_stops", "payment_collected_method") ||
      isMissingColumnError(stopResult.error, "route_stops", "payment_collected_at") ||
      isMissingColumnError(stopResult.error, "route_stops", "payment_collected_by"))
  ) {
    stopResult = await supabase
      .from("route_stops")
      .select(stopSelectWithoutNewColumns)
      .eq("id", stopId)
      .maybeSingle();
  }

  if (
    stopResult.error &&
    isMissingColumnError(stopResult.error, "route_stops", "proof_photo_uploaded")
  ) {
    stopResult = await supabase
      .from("route_stops")
      .select(stopSelectLegacy)
      .eq("id", stopId)
      .maybeSingle();
  }

  const { data: stop, error: stopError } = stopResult;

  if (stopError) {
    throw new Error(stopError.message);
  }

  if (!stop) {
    return (
      <div className="min-h-screen bg-[#f5efe6] px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-[28px] bg-white p-8 text-center shadow">
          <div className="text-lg font-semibold text-[#1f1e1b]">Stop not found</div>
          <a
            href="/admin/routes/driver"
            className="mt-5 inline-flex rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white"
          >
            Back to driver route
          </a>
        </div>
      </div>
    );
  }

  if (isBreakStop(stop)) {
    return (
      <div className="min-h-screen bg-[#f5efe6] px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-[28px] bg-white p-8 shadow">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
            Break
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
            {mainProductName(stop)}
          </h1>
          <div className="mt-4 rounded-2xl bg-[#fffaf2] p-4 text-lg font-semibold text-[#6c6258] ring-1 ring-[#e4d7c8]">
            {formatTime(stop.scheduled_start_time)}
            {stop.scheduled_end_time ? ` — ${formatTime(stop.scheduled_end_time)}` : ""}
          </div>
          <a
            href={`/admin/routes/driver?date=${stop.stop_date || ""}${
              stop.driver_name ? `&driver=${encodeURIComponent(stop.driver_name)}` : ""
            }`}
            className="mt-5 inline-flex rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white"
          >
            Back to route
          </a>
        </div>
      </div>
    );
  }

  let checklistItems: any[] = [];
  let modifiers: any[] = [];
  let proofPhotos: any[] = [];

  if (stop.booking_id) {
    const [checklistResult, modifiersResult, proofPhotosResult] = await Promise.all([
      supabase
        .from("booking_checklist_items")
        .select(
          `
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
          installed,
          picked_up,
          returned,
          needs_cleaning,
          damaged,
          missing,
          checked_by,
          notes,
          sort_order,
          inventory_items (
            id,
            name,
            sku
          ),
          inventory_units (
            id,
            unit_code,
            serial_number,
            barcode,
            status,
            condition
          )
        `
        )
        .eq("booking_id", stop.booking_id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase.from("booking_modifiers").select("*").eq("booking_id", stop.booking_id),

      supabase
        .from("booking_photos")
        .select("id, booking_id, route_stop_id, photo_url, caption, taken_by, created_at")
        .eq("booking_id", stop.booking_id)
        .eq("route_stop_id", stop.id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (!checklistResult.error) {
      checklistItems = checklistResult.data || [];
    }

    if (!modifiersResult.error) {
      modifiers = modifiersResult.data || [];
    }

    if (!proofPhotosResult.error) {
      proofPhotos = proofPhotosResult.data || [];
    }
  }

  const siblingsResult = await supabase
    .from("route_stops")
    .select(
      `
      id,
      customer_name,
      items_summary,
      setup_notes,
      stop_date,
      driver_name,
      stop_type,
      status,
      scheduled_start_time,
      sort_order,
      created_at
    `
    )
    .eq("stop_date", stop.stop_date)
    .order("sort_order", { ascending: true })
    .order("scheduled_start_time", { ascending: true })
    .order("created_at", { ascending: true });

  const siblings = siblingsResult.data || [];
  const sameDriverSiblings = siblings.filter((item: any) => {
    if (!stop.driver_name) return true;
    return String(item.driver_name || "") === String(stop.driver_name || "");
  });

  const routeSiblings = sameDriverSiblings.filter((item: any) => !isBreakStop(item));
  const routeIndex = routeSiblings.findIndex((item: any) => item.id === stop.id);
  const currentIndex = sameDriverSiblings.findIndex((item: any) => item.id === stop.id);

  const nextStop =
    currentIndex >= 0 && currentIndex < sameDriverSiblings.length - 1
      ? sameDriverSiblings[currentIndex + 1]
      : null;

  const customer = bookingCustomer(stop);
  const phone = phoneUrl(customer.phone);
  const maps = mapUrl(stop);
  const booking = getOne(stop.bookings);
  const bookingBalanceDue = Number(booking?.balance_due || 0);
  const normalizedBookingBalance = Number.isFinite(bookingBalanceDue)
    ? Math.max(bookingBalanceDue, 0)
    : 0;
  const effectiveBalanceDue =
    String(stop.stop_type || "").toLowerCase() === "delivery"
      ? normalizedBookingBalance
      : Number(stop.balance_due || 0);
  const stopWithFreshBalance = {
    ...stop,
    balance_due: Number(effectiveBalanceDue.toFixed(2)),
  };

  const completeOk = canCompleteStop(stopWithFreshBalance);
  const balanceDue = Number(stopWithFreshBalance.balance_due || 0);
  const paymentOk = balanceDue <= 0 || Boolean(stop.payment_collected);
  const proofOk = Boolean(stop.proof_photo_uploaded);
  const components = checklistItems.filter((item) => item.item_type !== "addon");
  const problemItems = checklistItems.filter(
    (item) => item.needs_cleaning || item.damaged || item.missing
  );

  return (
    <div className="min-h-screen bg-[#f5efe6]">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-[#23313f] px-4 py-4 text-white shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c9964f]">
                Driver stop
              </div>

              <h1 className="mt-1 text-2xl font-semibold">
                Stop #{routeIndex >= 0 ? routeIndex + 1 : currentIndex + 1}
              </h1>

              <p className="mt-1 text-sm text-white/65">
                {stopTypeLabel(stop.stop_type)} · {routeWindow(stop)}
              </p>
            </div>

            <a
              href={`/admin/routes/driver?date=${stop.stop_date || ""}${
                stop.driver_name ? `&driver=${encodeURIComponent(stop.driver_name)}` : ""
              }`}
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/10"
            >
              Route
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.055)]">
          <div className="border-b border-[#eee5d9] bg-[#fcfaf7] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  typeClass(stop.stop_type),
                ].join(" ")}
              >
                {stopTypeLabel(stop.stop_type)}
              </span>

              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  statusClass(stop.status),
                ].join(" ")}
              >
                {prettyStatus(stop.status)}
              </span>

              {stop.driver_name && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#d8cec0]">
                  {stop.driver_name}
                </span>
              )}
            </div>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              {mainProductName(stop)}
            </h2>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                  Route time
                </div>
                <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                  {routeWindow(stop)}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                  Party time
                </div>
                <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                  {partyWindow(stop)}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-[24px] bg-[#fcfaf7] p-5 ring-1 ring-[#eee5d9]">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Customer
              </div>

              <div className="mt-2 text-xl font-semibold text-[#1f1e1b]">
                {customer.name}
              </div>

              {customer.phone && (
                <a href={phone} className="mt-1 block text-sm font-semibold text-emerald-700">
                  {customer.phone}
                </a>
              )}

              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Address
              </div>

              <div className="mt-2 text-sm font-semibold text-[#1f1e1b]">
                {addressText(stop)}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {maps && (
                <a
                  href={maps}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#23313f] px-5 py-3 text-center text-sm font-semibold text-white"
                >
                  Navigate
                </a>
              )}

              {phone && (
                <a
                  href={phone}
                  className="rounded-full bg-emerald-600 px-5 py-3 text-center text-sm font-semibold text-white"
                >
                  Call customer
                </a>
              )}

              <form action={markDriverStopArrivedAction}>
                <input type="hidden" name="stopId" value={stop.id} />
                <input type="hidden" name="bookingId" value={stop.booking_id || ""} />
                <input type="hidden" name="date" value={stop.stop_date || ""} />

                <button
                  type="submit"
                  className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-center text-sm font-semibold text-white"
                >
                  I arrived
                </button>
              </form>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                      Proof photo
                    </div>
                    <div
                      className={[
                        "mt-1 text-sm font-semibold",
                        proofOk ? "text-emerald-700" : "text-[#8a6b20]",
                      ].join(" ")}
                    >
                      {proofOk ? "Uploaded" : "Required"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <DriverStopPhotoButtons
                    stopId={stop.id}
                    bookingId={stop.booking_id}
                    stopDate={stop.stop_date}
                    driverName={stop.driver_name}
                    stopType={stop.stop_type}
                    mode="take"
                  />
                  <DriverStopPhotoButtons
                    stopId={stop.id}
                    bookingId={stop.booking_id}
                    stopDate={stop.stop_date}
                    driverName={stop.driver_name}
                    stopType={stop.stop_type}
                    mode="upload"
                  />
                </div>

                <div className="mt-2 text-xs text-[#8b8177]">
                  Photo upload automatically marks this stop as{" "}
                  {stop.stop_type === "pickup" ? "Picked up" : "Installed"}.
                </div>
              </div>

              <CompactPaymentForm stop={stopWithFreshBalance} />
            </div>

            {proofPhotos.length > 0 && (
              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                      Uploaded proof photos
                    </div>
                    <div className="mt-1 text-sm text-[#6c6258]">
                      Linked to this stop and booking.
                    </div>
                  </div>

                  {stop.booking_id && (
                    <a
                      href={`/admin/bookings/${stop.booking_id}/photos`}
                      className="rounded-full border border-[#d8cec0] bg-white px-3 py-1.5 text-xs font-semibold text-[#23313f]"
                    >
                      Open booking photos
                    </a>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {proofPhotos.map((photo: any) => (
                    <a
                      key={photo.id}
                      href={photo.photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-xl bg-[#fcfaf7] ring-1 ring-[#eee5d9]"
                    >
                      <img
                        src={photo.photo_url}
                        alt={photo.caption || "Proof photo"}
                        className="h-28 w-full object-cover"
                      />

                      <div className="space-y-1 px-2.5 py-2 text-[11px] text-[#6c6258]">
                        <div className="line-clamp-2 font-semibold text-[#1f1e1b]">
                          {photo.caption || "Driver proof photo"}
                        </div>
                        <div>
                          {photo.taken_by || "Driver"}
                        </div>
                        <div>
                          {formatDateTime(photo.created_at)}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {!completeOk && (
              <div className="rounded-[24px] bg-red-50 p-4 text-sm font-semibold text-red-700 ring-1 ring-red-100">
                To finish this stop: {proofOk ? "" : "upload proof photo"}
                {!proofOk && !paymentOk ? " and " : ""}
                {paymentOk ? "" : "mark payment collected"}.
              </div>
            )}
          </div>
        </section>

        <details className="rounded-[30px] border border-black/5 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.04)]">
          <summary className="cursor-pointer px-5 py-4 text-lg font-semibold text-[#23313f]">
            Details
          </summary>

          <div className="space-y-4 border-t border-[#eee5d9] p-5">
            {stop.gate_code && (
              <div className="rounded-2xl bg-[#fff8e8] p-4 text-[#8a6b20] ring-1 ring-[#ead6a8]">
                <div className="text-xs font-semibold uppercase tracking-[0.14em]">
                  Gate code
                </div>
                <div className="mt-1 text-lg font-semibold">{stop.gate_code}</div>
              </div>
            )}

            {components.length > 0 && (
              <div className="rounded-2xl bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]">
                <div className="text-sm font-semibold text-[#1f1e1b]">
                  Components
                </div>

                <div className="mt-3 space-y-2 text-sm text-[#6c6258]">
                  {components.map((item) => (
                    <div key={item.id} className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#eee5d9]">
                      {componentTitle(item)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {modifiers.length > 0 && (
              <div className="rounded-2xl bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]">
                <div className="text-sm font-semibold text-[#1f1e1b]">
                  Options
                </div>

                <div className="mt-3 space-y-2 text-sm text-[#6c6258]">
                  {modifiers.map((item) => (
                    <div key={item.id} className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#eee5d9]">
                      {optionTitle(item)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stop.items_summary && components.length === 0 && (
              <div className="rounded-2xl bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]">
                <div className="text-sm font-semibold text-[#1f1e1b]">Items</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#6c6258]">
                  {stop.items_summary}
                </div>
              </div>
            )}

            {(stop.surface || stop.parking_notes || stop.setup_notes || stop.pickup_notes) && (
              <div className="grid gap-3">
                {stop.surface && (
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                    <div className="font-semibold text-[#1f1e1b]">Surface</div>
                    <div className="mt-1 text-sm text-[#6c6258]">{stop.surface}</div>
                  </div>
                )}

                {stop.parking_notes && (
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                    <div className="font-semibold text-[#1f1e1b]">Parking notes</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#6c6258]">
                      {stop.parking_notes}
                    </div>
                  </div>
                )}

                {stop.setup_notes && (
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                    <div className="font-semibold text-[#1f1e1b]">Setup notes</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#6c6258]">
                      {stop.setup_notes}
                    </div>
                  </div>
                )}

                {stop.pickup_notes && (
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                    <div className="font-semibold text-[#1f1e1b]">Pickup notes</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#6c6258]">
                      {stop.pickup_notes}
                    </div>
                  </div>
                )}
              </div>
            )}

            {problemItems.length > 0 && (
              <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-100">
                <div className="font-semibold">Reported problems</div>

                <div className="mt-2 space-y-1">
                  {problemItems.map((item) => (
                    <div key={item.id}>
                      - {cleanDetailText(item.title)}{" "}
                      {item.damaged ? "damaged " : ""}
                      {item.missing ? "missing " : ""}
                      {item.needs_cleaning ? "needs cleaning " : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
                {stop.stop_type === "delivery" && stop.booking_id && (
          <section className="overflow-hidden rounded-[30px] border border-[#e7d8bf] bg-[#fffaf2] shadow-[0_10px_35px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                Customer document
              </div>

              <div className="mt-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-[#1f1e1b]">
                    Equipment Handover
                  </h3>

                  <p className="mt-1 text-sm leading-6 text-[#6c6258]">
                    Review delivered products, components and options with the
                    customer, then collect acknowledgement and signature.
                  </p>
                </div>

                <span className="shrink-0 rounded-full bg-[#fff4d8] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a6b20] ring-1 ring-[#efd582]">
                  Delivery
                </span>
              </div>
            </div>

            <div className="p-5">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-3 ring-1 ring-[#eee5d9]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                    Products
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[#1f1e1b]">
                    {booking?.booking_items?.length || 0}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-3 ring-1 ring-[#eee5d9]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                    Components
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[#1f1e1b]">
                    {components.length}
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-3 ring-1 ring-[#eee5d9]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                    Options
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[#1f1e1b]">
                    {modifiers.length}
                  </div>
                </div>
              </div>

              <a
                href={`/admin/routes/driver/stops/${stop.id}/handover`}
                className="mt-4 flex min-h-[50px] w-full items-center justify-center rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
              >
                Open handover document
              </a>

              <p className="mt-3 text-xs leading-5 text-[#8b8177]">
                This is a separate delivery acceptance document and does not
                modify the rental contract.
              </p>
            </div>
          </section>
        )}

        <section className="rounded-[30px] border border-black/5 bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,0.04)]">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">Driver notes</h3>

          <form action={saveDriverStopNotesAction} className="mt-4 grid gap-3">
            <input type="hidden" name="stopId" value={stop.id} />
            <input type="hidden" name="bookingId" value={stop.booking_id || ""} />
            <input type="hidden" name="date" value={stop.stop_date || ""} />

            <textarea
              name="driverNotes"
              rows={3}
              defaultValue={stop.driver_notes || ""}
              placeholder="Example: customer paid cash, setup was near pool, one item needs cleaning..."
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />

            <button
              type="submit"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white"
            >
              Save notes
            </button>
          </form>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <a
            href={`/admin/routes/driver?date=${stop.stop_date || ""}${
              stop.driver_name ? `&driver=${encodeURIComponent(stop.driver_name)}` : ""
            }`}
            className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-center text-sm font-semibold text-[#23313f]"
          >
            Back to route
          </a>

          {nextStop ? (
            <form action={completeCurrentAndGoNextDriverStopAction}>
              <input type="hidden" name="currentStopId" value={stop.id} />
              <input type="hidden" name="nextStopId" value={nextStop.id} />

              <button
                type="submit"
                disabled={!completeOk}
                className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Finish & go next
              </button>
            </form>
          ) : (
            <form action={completeCurrentAndGoNextDriverStopAction}>
              <input type="hidden" name="currentStopId" value={stop.id} />

              <button
                type="submit"
                disabled={!completeOk || isCompleted(stop)}
                className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Finish route
              </button>
            </form>
          )}
        </section>

        <details className="rounded-[30px] border border-black/5 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.04)]">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-[#23313f]">
            Manual status override
          </summary>

          <div className="grid gap-2 border-t border-[#eee5d9] p-5 sm:grid-cols-2">
            {[
              ["on_the_way", "On the way"],
              ["arrived", "Arrived"],
              ["installed", "Installed"],
              ["picked_up", "Picked up"],
              ["completed", "Completed"],
              ["failed", "Failed"],
            ].map(([status, label]) => (
              <form key={status} action={updateDriverStopStatusAction}>
                <input type="hidden" name="stopId" value={stop.id} />
                <input type="hidden" name="bookingId" value={stop.booking_id || ""} />
                <input type="hidden" name="date" value={stop.stop_date || ""} />
                <input type="hidden" name="status" value={status} />

                <button
                  type="submit"
                  className={[
                    "w-full rounded-full px-4 py-3 text-sm font-semibold transition",
                    stop.status === status
                      ? "bg-[#23313f] text-white"
                      : "bg-white text-[#23313f] ring-1 ring-[#d8cec0] hover:bg-[#faf8f5]",
                  ].join(" ")}
                >
                  {label}
                </button>
              </form>
            ))}
          </div>
        </details>
      </main>
    </div>
  );
}

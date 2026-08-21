import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth/require-admin";
import {
  quickToggleDriverChecklistItemAction,
  updateDriverRouteStopStatusAction,
  uploadDriverChecklistPhotoAction,
} from "./actions";

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No date";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "No date";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  if (!value) return "Any time";

  const cleanValue = String(value).slice(0, 5);
  const date = new Date(`2000-01-01T${cleanValue}:00`);

  if (Number.isNaN(date.getTime())) return cleanValue;

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

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

function mapUrl(stop: any) {
  const address = [stop.address, stop.city, stop.state, stop.zip]
    .filter(Boolean)
    .join(", ");

  if (!address) return "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
}

function phoneUrl(phone: string | null | undefined) {
  const cleanPhone = String(phone || "").replace(/[^\d+]/g, "");

  if (!cleanPhone) return "";

  return `tel:${cleanPhone}`;
}

function isMissingTableError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42p01" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation")
  );
}

function isOptionalReadError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    isMissingTableError(error) ||
    code === "42501" ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  );
}

function safeBookingNumber(booking: any) {
  return (
    booking?.booking_number ||
    booking?.reference_number ||
    booking?.confirmation_number ||
    booking?.id?.slice(0, 8) ||
    "Booking"
  );
}

function mainProductsSummary(bookingItems: any[]) {
  const parts = bookingItems
    .slice(0, 3)
    .map((item) => {
      const product = getOne(item.products);
      const quantity = Number(item.quantity || 1);
      return `${product?.name || "Product"} x ${quantity}`;
    });

  if (bookingItems.length > 3) {
    parts.push(`+${bookingItems.length - 3} more`);
  }

  return parts.join(" · ") || "No products";
}

function partyTimeLabel(booking: any) {
  if (!booking?.event_date) {
    return "Party: no date";
  }

  return `Party: ${formatDate(booking.event_date)} · ${formatTime(
    booking.event_start_time
  )}${booking.event_end_time ? ` — ${formatTime(booking.event_end_time)}` : ""}`;
}

function deliveryTimeLabel(stop: any) {
  return `${stopTypeLabel(stop.stop_type)}: ${formatDate(stop.stop_date)} · ${formatTime(
    stop.scheduled_start_time
  )}${stop.scheduled_end_time ? ` — ${formatTime(stop.scheduled_end_time)}` : ""}`;
}

function cleanGeneratedText(value: string | null | undefined) {
  return String(value || "")
    .replace(/^(?:\[[^\]]+\]\s*)+/g, "")
    .trim();
}

function optionDisplayName(item: any, modifier: any) {
  const raw =
    String(item.option_name || "").trim() ||
    String(item.label || "").trim() ||
    String(item.modifier_name || "").trim() ||
    String(item.modifier_group_option_name || "").trim() ||
    cleanGeneratedText(String(item.notes || "")).trim() ||
    String(modifier?.name || "").trim() ||
    "Option";

  const clean = cleanGeneratedText(raw);
  const colonIndex = clean.lastIndexOf(":");

  if (colonIndex >= 0) {
    const tail = clean.slice(colonIndex + 1).trim();
    if (tail) return tail;
  }

  return clean || "Option";
}

function optionContextLabel(item: any, modifier: any) {
  const raw =
    cleanGeneratedText(String(item.notes || "")) ||
    cleanGeneratedText(String(item.option_name || "")) ||
    cleanGeneratedText(String(item.modifier_name || "")) ||
    cleanGeneratedText(String(modifier?.name || ""));

  if (!raw) return "";

  const colonIndex = raw.lastIndexOf(":");

  if (colonIndex >= 0) {
    const head = raw.slice(0, colonIndex).trim();
    if (head) return head;
  }

  return raw;
}

function extractSnapshotModifiers(booking: any) {
  const rows = Array.isArray(booking?.booking_price_calculations)
    ? [...booking.booking_price_calculations]
    : [];

  rows.sort((left: any, right: any) => {
    const leftTime = Number(new Date(String(left?.created_at || "")).getTime() || 0);
    const rightTime = Number(new Date(String(right?.created_at || "")).getTime() || 0);

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });

  for (const row of rows) {
    const rootOptions = Array.isArray(row?.calculation_snapshot?.options)
      ? row.calculation_snapshot.options
      : [];

    const productOptions = Array.isArray(row?.calculation_snapshot?.products)
      ? row.calculation_snapshot.products.flatMap((product: any) =>
          Array.isArray(product?.options) ? product.options : []
        )
      : [];

    const options = [...rootOptions, ...productOptions];

    if (options.length === 0) {
      continue;
    }

    return options.map((option: any, index: number) => ({
      id: `snapshot-option-${String(booking?.id || "unknown")}-${index}`,
      booking_id: String(booking?.id || ""),
      quantity: Number(option?.selected_quantity || option?.quantity || 1),
      option_name:
        String(
          option?.option_name ||
          option?.modifier_group_option_name ||
            option?.name ||
            option?.label ||
            "Option"
        ).trim(),
      modifier_name:
        String(option?.modifier_group_name || option?.group_name || "").trim() || null,
      notes: String(option?.notes || "").trim() || null,
      image_url: null,
      modifiers: {
        id: null,
        name: String(option?.modifier_group_name || "").trim() || null,
        image_url: null,
      },
    }));
  }

  return [];
}

function imageCard(url: string | null | undefined, alt: string) {
  if (!url) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f4ede2] text-[10px] font-semibold text-[#8b8177] ring-1 ring-[#e5d8c6]">
        No image
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className="h-12 w-12 rounded-xl object-cover ring-1 ring-[#e5d8c6]"
    />
  );
}

function ToggleButton({
  bookingId,
  checklistItemId,
  field,
  active,
  label,
  date,
  danger,
}: {
  bookingId: string;
  checklistItemId: string;
  field: string;
  active: boolean;
  label: string;
  date: string;
  danger?: boolean;
}) {
  return (
    <form action={quickToggleDriverChecklistItemAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="checklistItemId" value={checklistItemId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={active ? "false" : "true"} />
      <input type="hidden" name="date" value={date} />

      <button
        type="submit"
        className={[
          "rounded-full px-3 py-2 text-xs font-semibold transition",
          active && danger
            ? "bg-red-600 text-white"
            : active
              ? "bg-emerald-600 text-white"
              : "bg-[#f4ede2] text-[#6c6258] hover:bg-[#eadfce]",
        ].join(" ")}
      >
        {label}: {active ? "Yes" : "No"}
      </button>
    </form>
  );
}

function RouteStatusButton({
  stop,
  status,
  label,
  date,
}: {
  stop: any;
  status: string;
  label: string;
  date: string;
}) {
  const active = stop.status === status;

  return (
    <form action={updateDriverRouteStopStatusAction}>
      <input type="hidden" name="stopId" value={stop.id} />
      <input type="hidden" name="bookingId" value={stop.booking_id || ""} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="date" value={date} />

      <button
        type="submit"
        className={[
          "rounded-full px-4 py-2 text-xs font-semibold transition",
          active
            ? "bg-[#23313f] text-white"
            : "bg-white text-[#23313f] ring-1 ring-[#d8cec0] hover:bg-[#faf8f5]",
        ].join(" ")}
      >
        {label}
      </button>
    </form>
  );
}

function PhotoUploadBox({
  bookingId,
  routeStopId,
  photoType,
  label,
  date,
  defaultCaption,
}: {
  bookingId: string;
  routeStopId?: string;
  photoType: string;
  label: string;
  date: string;
  defaultCaption?: string;
}) {
  return (
    <form
      action={uploadDriverChecklistPhotoAction}
      className="rounded-2xl border border-[#eee5d9] bg-white p-4"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="routeStopId" value={routeStopId || ""} />
      <input type="hidden" name="photoType" value={photoType} />
      <input type="hidden" name="date" value={date} />

      <div className="text-sm font-semibold text-[#1f1e1b]">{label}</div>

      <div className="mt-3 grid gap-3">
        <input
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          required
          className="w-full rounded-xl border border-[#d8cec0] bg-[#fcfaf7] px-3 py-2 text-xs text-[#6c6258]"
        />

        <input
          name="takenBy"
          placeholder="Taken by"
          className="w-full rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-xs outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />

        <textarea
          name="caption"
          rows={2}
          defaultValue={defaultCaption || ""}
          placeholder="Caption / note"
          className="w-full rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-xs outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />

        <button
          type="submit"
          className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#18222d]"
        >
          Upload photo
        </button>
      </div>
    </form>
  );
}

export default async function DriverChecklistPage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
    driver?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const selectedDate = String(resolvedSearchParams?.date || todayISO());
  const selectedDriver = String(resolvedSearchParams?.driver || "").trim();

  const { supabase, access } = await requireAdminUser();

  if (!access.can("routes.view") && access.role !== "driver") {
    redirect("/unauthorized");
  }

  const isLockedDriverScope = access.role === "driver";
  let forcedDriverName = "";

  if (isLockedDriverScope) {
    const userId = String(access.user?.id || "").trim();
    const userEmail = String(access.user?.email || "").trim().toLowerCase();

    const linkedDriverResult = await supabase
      .from("route_drivers")
      .select("name, active, deleted_at")
      .or(`auth_user_id.eq.${userId},account_email.eq.${userEmail}`)
      .limit(1)
      .maybeSingle();

    if (linkedDriverResult.error) {
      throw new Error(linkedDriverResult.error.message);
    }

    if (
      !linkedDriverResult.data ||
      linkedDriverResult.data.active === false ||
      linkedDriverResult.data.deleted_at
    ) {
      redirect("/unauthorized");
    }

    forcedDriverName = String(linkedDriverResult.data.name || "").trim();
  }

  const effectiveSelectedDriver = forcedDriverName || selectedDriver;

  let stopsRequest = supabase
    .from("route_stops")
    .select(
      `
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
      updated_at
    `
    )
    .eq("stop_date", selectedDate)
    .in("stop_type", ["delivery", "pickup"])
    .order("sort_order", { ascending: true })
    .order("scheduled_start_time", { ascending: true })
    .order("created_at", { ascending: true });

  if (effectiveSelectedDriver) {
    stopsRequest = stopsRequest.eq("driver_name", effectiveSelectedDriver);
  }

  const stopsResult = await stopsRequest;

  if (stopsResult.error) {
    throw new Error(stopsResult.error.message);
  }

  const stops = (stopsResult.data || []) as any[];

  const bookingIds = Array.from(
    new Set(
      stops
        .map((stop) => String(stop.booking_id || ""))
        .filter(Boolean)
    )
  );

  const [bookingsResult, checklistResult, modifiersResult, photosResult, stopsBookingsFallbackResult, bookingItemsFallbackResult] =
    bookingIds.length > 0
      ? await Promise.all([
          supabase
            .from("bookings")
            .select(
              `
              id,
              booking_number,
              event_date,
              event_start_time,
              event_end_time,
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
              ),
              booking_price_calculations (
                id,
                calculation_snapshot,
                created_at
              )
            `
            )
            .in("id", bookingIds),
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
                sku,
                image_url
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
            .in("booking_id", bookingIds)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("booking_modifiers")
            .select("*, modifiers (id, name, image_url)")
            .in("booking_id", bookingIds),
          supabase
            .from("booking_photos")
            .select("id, booking_id, photo_type, photo_url, caption, created_at")
            .in("booking_id", bookingIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("route_stops")
            .select(
              `
              booking_id,
              bookings (
                id,
                booking_number,
                event_date,
                event_start_time,
                event_end_time,
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
                ),
                booking_modifiers (
                  id,
                  booking_item_id,
                  modifier_group_option_id,
                  quantity,
                  unit_price,
                  notes,
                  modifiers (
                    id,
                    name,
                    image_url
                  )
                ),
                booking_price_calculations (
                  id,
                  calculation_snapshot,
                  created_at
                )
              )
            `
            )
            .in("booking_id", bookingIds)
            .eq("stop_date", selectedDate)
            .in("stop_type", ["delivery", "pickup"]),
          supabase
            .from("booking_items")
            .select("id, booking_id")
            .in("booking_id", bookingIds),
        ])
      : [
          { data: [], error: null } as any,
          { data: [], error: null } as any,
          { data: [], error: null } as any,
          { data: [], error: null } as any,
          { data: [], error: null } as any,
          { data: [], error: null } as any,
        ];

  if (bookingsResult.error) {
    throw new Error(bookingsResult.error.message);
  }

  if (checklistResult.error) {
    throw new Error(checklistResult.error.message);
  }

  if (modifiersResult.error) {
    throw new Error(modifiersResult.error.message);
  }

  if (photosResult.error && !isMissingTableError(photosResult.error)) {
    throw new Error(photosResult.error.message);
  }

  if (stopsBookingsFallbackResult.error && !isOptionalReadError(stopsBookingsFallbackResult.error)) {
    throw new Error(stopsBookingsFallbackResult.error.message);
  }

  if (bookingItemsFallbackResult.error && !isOptionalReadError(bookingItemsFallbackResult.error)) {
    throw new Error(bookingItemsFallbackResult.error.message);
  }

  const bookingsById = new Map<string, any>();
  for (const booking of (bookingsResult.data || []) as any[]) {
    bookingsById.set(String(booking.id), booking);
  }

  for (const stop of (stopsBookingsFallbackResult.data || []) as any[]) {
    const booking = getOne(stop?.bookings);
    const bookingId = String(booking?.id || stop?.booking_id || "").trim();

    if (!bookingId || bookingsById.has(bookingId)) {
      continue;
    }

    bookingsById.set(bookingId, booking);
  }

  const checklistByBookingId = new Map<string, any[]>();
  for (const item of (checklistResult.data || []) as any[]) {
    const bookingId = String(item.booking_id || "");
    const queue = checklistByBookingId.get(bookingId) || [];
    queue.push(item);
    checklistByBookingId.set(bookingId, queue);
  }

  const modifiersByBookingId = new Map<string, any[]>();
  for (const item of (modifiersResult.data || []) as any[]) {
    const bookingId = String(item.booking_id || "");
    const queue = modifiersByBookingId.get(bookingId) || [];
    queue.push(item);
    modifiersByBookingId.set(bookingId, queue);
  }

  const bookingItemIdToBookingId = new Map<string, string>();
  const allBookingItemIds: string[] = [];

  for (const row of (bookingItemsFallbackResult.error ? [] : bookingItemsFallbackResult.data || []) as any[]) {
    const bookingItemId = String(row?.id || "").trim();
    const bookingId = String(row?.booking_id || "").trim();

    if (!bookingItemId || !bookingId || bookingItemIdToBookingId.has(bookingItemId)) {
      continue;
    }

    bookingItemIdToBookingId.set(bookingItemId, bookingId);
    allBookingItemIds.push(bookingItemId);
  }

  for (const [bookingId, booking] of bookingsById.entries()) {
    const bookingItems = Array.isArray(booking?.booking_items)
      ? booking.booking_items
      : [];

    for (const item of bookingItems) {
      const bookingItemId = String(item?.id || "").trim();

      if (!bookingItemId || bookingItemIdToBookingId.has(bookingItemId)) {
        continue;
      }

      bookingItemIdToBookingId.set(bookingItemId, bookingId);
      allBookingItemIds.push(bookingItemId);
    }
  }

  if (allBookingItemIds.length > 0) {
    const modifiersByItemResult = await supabase
      .from("booking_modifiers")
      .select("*, modifiers (id, name, image_url)")
      .in("booking_item_id", allBookingItemIds);

    if (modifiersByItemResult.error) {
      throw new Error(modifiersByItemResult.error.message);
    }

    for (const item of (modifiersByItemResult.data || []) as any[]) {
      let bookingId = String(item.booking_id || "").trim();

      if (!bookingId) {
        const bookingItemId = String(item.booking_item_id || "").trim();
        bookingId = bookingItemIdToBookingId.get(bookingItemId) || "";
      }

      if (!bookingId) {
        continue;
      }

      const queue = modifiersByBookingId.get(bookingId) || [];

      if (queue.some((row: any) => String(row?.id || "") === String(item?.id || ""))) {
        continue;
      }

      queue.push({
        ...item,
        booking_id: bookingId,
      });
      modifiersByBookingId.set(bookingId, queue);
    }
  }

  for (const [bookingId, booking] of bookingsById.entries()) {
    const current = modifiersByBookingId.get(bookingId) || [];

    if (current.length > 0) {
      continue;
    }

    const nestedModifiers = Array.isArray(booking?.booking_modifiers)
      ? booking.booking_modifiers
      : [];

    if (nestedModifiers.length > 0) {
      modifiersByBookingId.set(bookingId, nestedModifiers);
    }
  }

  for (const [bookingId, booking] of bookingsById.entries()) {
    const current = modifiersByBookingId.get(bookingId) || [];

    if (current.length > 0) {
      continue;
    }

    const snapshotModifiers = extractSnapshotModifiers(booking);

    if (snapshotModifiers.length > 0) {
      modifiersByBookingId.set(bookingId, snapshotModifiers);
    }
  }

  const photosByBookingId = new Map<string, any[]>();
  for (const photo of (photosResult.error ? [] : photosResult.data || []) as any[]) {
    const bookingId = String(photo.booking_id || "");
    const queue = photosByBookingId.get(bookingId) || [];
    queue.push(photo);
    photosByBookingId.set(bookingId, queue);
  }

  const totalStops = stops.length;
  const completedStops = stops.filter((stop) =>
    ["installed", "picked_up", "completed"].includes(String(stop.status || ""))
  ).length;

  const totalChecklistItems = (checklistResult.data || []).length;
  const loadedItems = (checklistResult.data || []).filter((item: any) => item.loaded).length;
  const returnedItems = (checklistResult.data || []).filter((item: any) => item.returned).length;
  const problemItems = (checklistResult.data || []).filter(
    (item: any) => item.damaged || item.missing || item.needs_cleaning
  ).length;

  return (
    <div className="space-y-5">
      <section className="rounded-[30px] border border-black/5 bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Driver mobile view
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Driver Checklist
            </h2>

            <p className="mt-2 text-sm leading-6 text-[#6c6258]">
              {formatDate(selectedDate)} · {totalStops} stops · {completedStops} completed
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/admin/routes/driver"
              className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              Driver view
            </a>

            <a
              href={isLockedDriverScope ? "/driver/routes" : "/admin/routes"}
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Route board
            </a>
          </div>
        </div>

        <form className="mt-5 grid gap-3 md:grid-cols-[180px_1fr_120px]">
          <input
            type="date"
            name="date"
            defaultValue={selectedDate}
            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
          />

          {isLockedDriverScope ? (
            <input
              name="driver"
              value={effectiveSelectedDriver}
              readOnly
              className="w-full rounded-2xl border border-[#d8cec0] bg-[#f5efe6] px-4 py-3 text-sm text-[#1f1e1b]"
            />
          ) : (
            <input
              name="driver"
              defaultValue={effectiveSelectedDriver}
              placeholder="Filter by driver..."
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />
          )}

          <button
            type="submit"
            className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
          >
            Filter
          </button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-[24px] bg-white p-4 ring-1 ring-black/5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
            Stops
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
            {completedStops}/{totalStops}
          </div>
        </div>

        <div className="rounded-[24px] bg-white p-4 ring-1 ring-black/5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
            Loaded
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
            {loadedItems}/{totalChecklistItems}
          </div>
        </div>

        <div className="rounded-[24px] bg-white p-4 ring-1 ring-black/5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
            Returned
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
            {returnedItems}/{totalChecklistItems}
          </div>
        </div>

        <div className="rounded-[24px] bg-white p-4 ring-1 ring-black/5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
            Problems
          </div>
          <div className="mt-2 text-2xl font-semibold text-red-700">
            {problemItems}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {stops.map((stop: any, index: number) => {
          const bookingId = String(stop.booking_id || "");
          const booking = bookingsById.get(bookingId) || null;
          const allChecklistItems = checklistByBookingId.get(bookingId) || [];
          const modifiers = modifiersByBookingId.get(bookingId) || [];
          const photos = (photosByBookingId.get(bookingId) || []).slice(0, 6);
          const bookingItems = Array.isArray(booking?.booking_items) ? booking.booking_items : [];
          const customer = getOne(booking?.customers);
          const maps = mapUrl(stop);
          const phone = phoneUrl(customer?.phone || stop.customer_phone);
          const items = allChecklistItems.filter((item: any) => {
            const type = String(item.item_type || "").toLowerCase();
            const source = String(item.source || "").toLowerCase();

            return type !== "equipment" && source !== "booking_item";
          });
          const loadedCount = items.filter((item: any) => item.loaded).length;
          const returnedCount = items.filter((item: any) => item.returned).length;
          const stopProblems = items.filter(
            (item: any) => item.damaged || item.missing || item.needs_cleaning
          ).length;

          return (
            <details
              key={stop.id}
              className="group overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]"
            >
              <summary className="cursor-pointer list-none bg-[#fcfaf7] p-5 transition hover:bg-[#faf5ec]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#23313f] px-3 py-1 text-xs font-semibold text-white">
                        #{index + 1}
                      </span>

                      <span className="rounded-full bg-[#eaf2f9] px-3 py-1 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
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

                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#d8cec0]">
                        {safeBookingNumber(booking)}
                      </span>
                    </div>

                    <h3 className="mt-3 text-2xl font-semibold text-[#1f1e1b]">
                      {customer?.full_name || stop.customer_name || "Customer"}
                    </h3>

                    <div className="mt-1 text-sm font-semibold text-[#9a723e]">
                      {deliveryTimeLabel(stop)}
                    </div>

                    <div className="mt-1 text-sm text-[#6c6258]">
                      {partyTimeLabel(booking)}
                    </div>

                    <div className="mt-2 text-sm font-semibold text-[#1f1e1b]">
                      {mainProductsSummary(bookingItems)}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-white px-3 py-2 text-[#6c6258] ring-1 ring-[#e5d8c6]">
                      Products {bookingItems.length}
                    </span>
                    <span className="rounded-full bg-white px-3 py-2 text-[#6c6258] ring-1 ring-[#e5d8c6]">
                      Options {modifiers.length}
                    </span>
                    <span className="rounded-full bg-white px-3 py-2 text-[#6c6258] ring-1 ring-[#e5d8c6]">
                      Components {items.length}
                    </span>
                    <span className="rounded-full bg-white px-3 py-2 text-[#6c6258] ring-1 ring-[#e5d8c6]">
                      Photos {photos.length}
                    </span>
                    <span className="rounded-full bg-white px-3 py-2 text-[#6c6258] ring-1 ring-[#e5d8c6] group-open:bg-[#23313f] group-open:text-white">
                      Open
                    </span>
                  </div>
                </div>
              </summary>

              <div className="space-y-5 border-t border-[#eee5d9] p-5">
                <div className="flex flex-wrap gap-2">
                  {maps && (
                    <a
                      href={maps}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-[#23313f] px-4 py-2 text-sm font-semibold text-white"
                    >
                      Maps
                    </a>
                  )}

                  {phone && (
                    <a
                      href={phone}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Call
                    </a>
                  )}

                  {bookingId && (
                    <>
                      <a
                        href={`/admin/bookings/${bookingId}/checklist`}
                        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-sm font-semibold text-[#2b2a28]"
                      >
                        Full checklist
                      </a>

                      <a
                        href={`/admin/bookings/${bookingId}/photos`}
                        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-sm font-semibold text-[#2b2a28]"
                      >
                        Photos
                      </a>
                    </>
                  )}
                </div>

                <div className="grid gap-2 md:grid-cols-5">
                  <RouteStatusButton stop={stop} status="on_the_way" label="On the way" date={selectedDate} />
                  <RouteStatusButton stop={stop} status="arrived" label="Arrived" date={selectedDate} />
                  <RouteStatusButton stop={stop} status="installed" label="Installed" date={selectedDate} />
                  <RouteStatusButton stop={stop} status="picked_up" label="Picked up" date={selectedDate} />
                  <RouteStatusButton stop={stop} status="completed" label="Completed" date={selectedDate} />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-[#fcfaf7] p-3 text-sm ring-1 ring-[#eee5d9]">
                    Loaded: <span className="font-semibold">{loadedCount}/{items.length}</span>
                  </div>
                  <div className="rounded-2xl bg-[#fcfaf7] p-3 text-sm ring-1 ring-[#eee5d9]">
                    Returned: <span className="font-semibold">{returnedCount}/{items.length}</span>
                  </div>
                  <div className="rounded-2xl bg-[#fcfaf7] p-3 text-sm ring-1 ring-[#eee5d9]">
                    Problems: <span className="font-semibold text-red-700">{stopProblems}</span>
                  </div>
                </div>

                {photos.length > 0 && (
                  <section className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                      Recent photos
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                      {photos.map((photo: any) => (
                        <a
                          key={photo.id}
                          href={photo.photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="overflow-hidden rounded-[22px] bg-white ring-1 ring-[#eee5d9]"
                        >
                          <img
                            src={photo.photo_url}
                            alt={photo.caption || photo.photo_type || "Photo"}
                            className="h-20 w-full object-cover"
                          />
                          <div className="p-3">
                            <div className="text-xs font-semibold text-[#1f1e1b]">
                              {prettyStatus(photo.photo_type)}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[11px] text-[#6c6258]">
                              {photo.caption || "Open photo"}
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                {bookingItems.length > 0 && (
                  <section className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                      Products
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {bookingItems.map((item: any) => {
                        const product = getOne(item.products);
                        return (
                          <div
                            key={item.id}
                            className="flex gap-3 rounded-[20px] bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9]"
                          >
                            {imageCard(product?.image_url || null, product?.name || "Product")}
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-[#1f1e1b]">
                                {product?.name || "Product"}
                              </div>
                              <div className="mt-1 text-sm text-[#6c6258]">
                                Qty {Number(item.quantity || 1)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {modifiers.length > 0 && (
                  <section className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                      Options
                    </div>
                    <div className="space-y-3">
                      {modifiers.map((item: any) => {
                        const modifier = getOne(item.modifiers);
                        const label = optionDisplayName(item, modifier);
                        return (
                          <div
                            key={item.id}
                            className="flex gap-3 rounded-[20px] bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9]"
                          >
                            {imageCard(item.image_url || modifier?.image_url || null, label)}
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-[#1f1e1b]">{label}</div>
                            </div>
                            <div className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6c6258] ring-1 ring-[#e5d8c6]">
                              Qty {Number(item.quantity || 1)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                <section className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                    Components checklist
                  </div>

                  {items.length > 0 ? (
                    <div className="space-y-3">
                      {items.map((item: any) => {
                        const inventoryItem = getOne(item.inventory_items);
                        const unit = getOne(item.inventory_units);

                        return (
                          <details
                            key={item.id}
                            className="rounded-[24px] bg-[#fcfaf7] ring-1 ring-[#eee5d9]"
                          >
                            <summary className="flex cursor-pointer items-start justify-between gap-4 p-4 list-none">
                              <div className="flex gap-3">
                                {imageCard(inventoryItem?.image_url || null, item.title || inventoryItem?.name || "Component")}
                                <div>
                                  <div className="font-semibold text-[#1f1e1b]">
                                    {item.title || inventoryItem?.name || "Component"}
                                  </div>
                                  <div className="mt-1 text-sm text-[#6c6258]">
                                    Qty {item.quantity || 1} · {prettyStatus(item.item_type)}
                                  </div>
                                  {unit && (
                                    <div className="mt-1 text-xs text-[#8b8177]">
                                      Unit: {unit.unit_code || unit.serial_number || unit.barcode || "—"}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap justify-end gap-1">
                                {item.needs_cleaning && (
                                  <span className="rounded-full bg-[#fff4d8] px-2 py-1 text-[11px] font-semibold text-[#8a6b20] ring-1 ring-[#efd582]">
                                    Needs cleaning
                                  </span>
                                )}
                                {item.damaged && (
                                  <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                                    Damaged
                                  </span>
                                )}
                                {item.missing && (
                                  <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                                    Missing
                                  </span>
                                )}
                              </div>
                            </summary>

                            <div className="space-y-4 border-t border-[#eee5d9] p-4">
                              <div className="flex flex-wrap gap-2">
                                <ToggleButton bookingId={bookingId} checklistItemId={item.id} field="loaded" active={Boolean(item.loaded)} label="Loaded" date={selectedDate} />
                                <ToggleButton bookingId={bookingId} checklistItemId={item.id} field="installed" active={Boolean(item.installed)} label="Installed" date={selectedDate} />
                                <ToggleButton bookingId={bookingId} checklistItemId={item.id} field="picked_up" active={Boolean(item.picked_up)} label="Picked up" date={selectedDate} />
                                <ToggleButton bookingId={bookingId} checklistItemId={item.id} field="returned" active={Boolean(item.returned)} label="Returned" date={selectedDate} />
                                <ToggleButton bookingId={bookingId} checklistItemId={item.id} field="needs_cleaning" active={Boolean(item.needs_cleaning)} label="Needs cleaning" date={selectedDate} danger />
                                <ToggleButton bookingId={bookingId} checklistItemId={item.id} field="damaged" active={Boolean(item.damaged)} label="Damaged" date={selectedDate} danger />
                                <ToggleButton bookingId={bookingId} checklistItemId={item.id} field="missing" active={Boolean(item.missing)} label="Missing" date={selectedDate} danger />
                              </div>

                              <div className="grid gap-3 md:grid-cols-3">
                                <PhotoUploadBox
                                  bookingId={bookingId}
                                  routeStopId={stop.id}
                                  photoType="inventory"
                                  label="Item photo"
                                  date={selectedDate}
                                  defaultCaption={`Inventory photo: ${item.title || inventoryItem?.name || "Component"}`}
                                />
                                <PhotoUploadBox
                                  bookingId={bookingId}
                                  routeStopId={stop.id}
                                  photoType="damage"
                                  label="Damage photo"
                                  date={selectedDate}
                                  defaultCaption={`Damage photo: ${item.title || inventoryItem?.name || "Component"}`}
                                />
                                <PhotoUploadBox
                                  bookingId={bookingId}
                                  routeStopId={stop.id}
                                  photoType="cleaning"
                                  label="Cleaning photo"
                                  date={selectedDate}
                                  defaultCaption={`Cleaning photo: ${item.title || inventoryItem?.name || "Component"}`}
                                />
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#d8cec0] bg-white px-5 py-8 text-center text-sm text-[#6c6258]">
                      No checklist items for this booking yet.
                    </div>
                  )}
                </section>

                {((stop.gate_code || stop.parking_notes || stop.setup_notes || stop.pickup_notes) || bookingId) && (
                  <details className="rounded-[24px] bg-[#fcfaf7] ring-1 ring-[#eee5d9]">
                    <summary className="cursor-pointer list-none px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                            Extra details
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                            Notes and photo uploads
                          </div>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#e5d8c6]">
                          Open
                        </span>
                      </div>
                    </summary>

                    <div className="space-y-4 border-t border-[#eee5d9] p-4">
                      {(stop.gate_code || stop.parking_notes || stop.setup_notes || stop.pickup_notes) && (
                        <section className="grid gap-3 md:grid-cols-2">
                          {stop.gate_code && (
                            <div className="rounded-2xl bg-[#fff4d8] p-4 text-sm text-[#8a6b20] ring-1 ring-[#efd582]">
                              <div className="font-semibold">Gate code</div>
                              <div className="mt-1">{stop.gate_code}</div>
                            </div>
                          )}

                          {stop.parking_notes && (
                            <div className="rounded-2xl bg-white p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                              <div className="font-semibold text-[#1f1e1b]">Parking</div>
                              <div className="mt-1 whitespace-pre-wrap">{stop.parking_notes}</div>
                            </div>
                          )}

                          {stop.setup_notes && (
                            <div className="rounded-2xl bg-white p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                              <div className="font-semibold text-[#1f1e1b]">Setup notes</div>
                              <div className="mt-1 whitespace-pre-wrap">{stop.setup_notes}</div>
                            </div>
                          )}

                          {stop.pickup_notes && (
                            <div className="rounded-2xl bg-white p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                              <div className="font-semibold text-[#1f1e1b]">Pickup notes</div>
                              <div className="mt-1 whitespace-pre-wrap">{stop.pickup_notes}</div>
                            </div>
                          )}
                        </section>
                      )}

                      {bookingId && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <PhotoUploadBox
                            bookingId={bookingId}
                            routeStopId={stop.id}
                            photoType={stop.stop_type === "pickup" ? "pickup" : "delivery_setup"}
                            label={stop.stop_type === "pickup" ? "Upload pickup photo" : "Upload setup photo"}
                            date={selectedDate}
                            defaultCaption={stop.stop_type === "pickup" ? "Pickup photo from driver checklist" : "Setup proof from driver checklist"}
                          />

                          <PhotoUploadBox
                            bookingId={bookingId}
                            routeStopId={stop.id}
                            photoType="general"
                            label="Upload general stop photo"
                            date={selectedDate}
                            defaultCaption="Driver stop photo"
                          />
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </details>
          );
        })}

        {stops.length === 0 && (
          <section className="rounded-[30px] border border-black/5 bg-white px-6 py-16 text-center shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="text-lg font-semibold text-[#1f1e1b]">
              No driver stops for this date
            </div>

            <p className="mt-2 text-sm text-[#6c6258]">
              Create route stops from booking or route board first.
            </p>
          </section>
        )}
      </section>
    </div>
  );
}

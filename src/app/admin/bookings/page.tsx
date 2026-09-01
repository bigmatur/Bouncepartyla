import { createClient } from "@/lib/supabase/server";
import { getBookingMarkerColor } from "@/lib/booking/marker-color";
import { getUnifiedAccess } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import { archiveSelectedBookingsAction } from "./actions";
import { restoreArchivedBookingAction } from "./[id]/booking-admin-actions";
import {
  formatTime as formatSystemTime,
  type TimeFormat,
} from "@/lib/date-time-format";

function isMissingArchivedAtError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42703" ||
    (message.includes("archived_at") && message.includes("bookings"))
  );
}

function isMissingArchiveReasonError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    (code === "pgrst204" && message.includes("archive_reason")) ||
    (code === "42703" && message.includes("archive_reason")) ||
    message.includes("archive_reason")
  );
}

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined, timeFormat: TimeFormat) {
  if (!value) return "—";
  const formatted = formatSystemTime(String(value).slice(0, 8), timeFormat);
  return formatted || String(value).slice(0, 5);
}

function formatMoney(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  const value = String(status || "");

  if (["booked", "scheduled", "inventory_reserved", "installed", "closed", "completed", "paid"].includes(value)) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (["cancelled", "canceled", "failed", "refunded"].includes(value)) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
}

function buildBookingProductGroups(
  booking: any,
  productComponentsByProductId: Map<
    string,
    Array<{
      inventoryItemId: string;
      name: string;
      quantityPerProduct: number;
      required: boolean;
    }>
  >
) {
  const modifiersByBookingItemId = new Map<string, any[]>();

  for (const modifier of booking.booking_modifiers || []) {
    const bookingItemId = String(modifier.booking_item_id || "");
    const queue = modifiersByBookingItemId.get(bookingItemId) || [];
    queue.push(modifier);
    modifiersByBookingItemId.set(bookingItemId, queue);
  }

  return (booking.booking_items || []).map((item: any) => {
    const product = getOne(item.products);
    const productId = String(product?.id || "");
    const bookingItemId = String(item.id || "");
    const itemQty = Math.max(1, Number(item.quantity || 1));

    const components = (productComponentsByProductId.get(productId) || [])
      .map((component) => ({
        key: component.inventoryItemId || component.name,
        name: component.name,
        quantity: Number((component.quantityPerProduct * itemQty).toFixed(2)),
      }))
      .filter((component) => component.quantity > 0);

    const options = (modifiersByBookingItemId.get(bookingItemId) || []).map(
      (modifier: any) => {
        const modifierEntity = getOne(modifier.modifiers);
        const nameFromNotes = String(modifier.notes || "")
          .split(":")
          .slice(-1)[0]
          .trim();

        return {
          key: String(modifier.id || `${bookingItemId}-${nameFromNotes}`),
          name: String(modifierEntity?.name || nameFromNotes || "Option"),
          quantity: Math.max(1, Number(modifier.quantity || 1)),
          unitPrice: Number(modifier.unit_price || 0),
        };
      }
    );

    return {
      bookingItemId,
      productId,
      productName: String(product?.name || "Product"),
      productImageUrl: product?.image_url || null,
      productQuantity: itemQty,
      components,
      options,
    };
  });
}

function SummaryCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_8px_22px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a723e] sm:text-xs sm:tracking-[0.16em]">
        {label}
      </div>
      <div className="mt-1.5 truncate text-xl font-bold tracking-tight text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 truncate text-[10px] text-[#6c6258] sm:text-xs">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; date?: string; view?: string; saved?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const query = String(resolvedSearchParams?.q || "").trim();
  const selectedStatus = String(resolvedSearchParams?.status || "all");
  const selectedDate = String(resolvedSearchParams?.date || "").trim();
  const selectedView = String(resolvedSearchParams?.view || "active").trim();
  const saved = String(resolvedSearchParams?.saved || "").trim();

  const returnParams = new URLSearchParams();

  if (query) returnParams.set("q", query);
  if (selectedStatus && selectedStatus !== "all") returnParams.set("status", selectedStatus);
  if (selectedDate) returnParams.set("date", selectedDate);
  if (selectedView && selectedView !== "active") returnParams.set("view", selectedView);

  const returnTo = `/admin/bookings${returnParams.toString() ? `?${returnParams.toString()}` : ""}`;

  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user) {
    redirect("/login");
  }

  if (!access.isActive || !access.can("bookings.view")) {
    redirect("/unauthorized");
  }

  const bookingSelectWithArchive = `
      id,
      booking_number,
      status,
      booking_source,
      event_date,
      event_start_time,
      event_end_time,
      setup_address,
      setup_city,
      setup_state,
      setup_zip,
      marker_color,
      internal_notes,
      total_amount,
      deposit_amount,
      amount_paid,
      balance_due,
      payment_status,
      archived_at,
      archive_reason,
      created_at,
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
          name
        )
      ),
      booking_price_calculations (
        id,
        calculation_snapshot,
        created_at
      )
    `;
  const bookingSelectWithoutArchiveReason = bookingSelectWithArchive
    .replace(",\n      archive_reason", "");
  const bookingSelectWithoutArchive = bookingSelectWithoutArchiveReason
    .replace(",\n      archived_at", "");

  function buildBookingsRequest(selectClause: string) {
    let request = supabase
      .from("bookings")
      .select(selectClause)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);

    if (selectedStatus !== "all") {
      request = request.eq("status", selectedStatus);
    }

    if (selectedDate) {
      request = request.eq("event_date", selectedDate);
    }

    return request;
  }

  const [firstBookingsResult, settingsResult] = await Promise.all([
    buildBookingsRequest(bookingSelectWithArchive),
    supabase.from("system_settings").select("time_format").limit(1).maybeSingle(),
  ]);

  let bookingsResult = firstBookingsResult;

  if (bookingsResult.error && isMissingArchiveReasonError(bookingsResult.error)) {
    bookingsResult = await buildBookingsRequest(bookingSelectWithoutArchiveReason);
  }

  if (bookingsResult.error && isMissingArchivedAtError(bookingsResult.error)) {
    bookingsResult = await buildBookingsRequest(bookingSelectWithoutArchive);
  }

  if (bookingsResult.error) {
    throw new Error(bookingsResult.error.message);
  }

  const allBookings = bookingsResult.data || [];
  const timeFormat: TimeFormat =
    settingsResult.data?.time_format === "24h" ? "24h" : "12h";

  const scopedBookings = allBookings.filter((booking: any) => {
    const archived = Boolean(booking.archived_at);
    const isUnpaidCustomerCheckoutHold =
      String(booking.booking_source || "").toLowerCase() === "customer_self_service" &&
      String(booking.status || "").toLowerCase() === "pending_deposit" &&
      Number(booking.amount_paid || 0) <= 0 &&
      ["", "unpaid"].includes(String(booking.payment_status || "").toLowerCase());

    if (selectedView === "archived") {
      return archived;
    }

    if (selectedView === "all") {
      return true;
    }

    // A self-service Stripe booking is only a temporary inventory checkout hold
    // until the deposit is actually confirmed. Do not show it as an active
    // booking. It will automatically appear after Stripe finalizes it to booked.
    return !archived && !isUnpaidCustomerCheckoutHold;
  });

  const bookings = query
    ? scopedBookings.filter((booking: any) => {
        const customer = getOne(booking.customers);
        const products = (booking.booking_items || [])
          .map((item: any) => getOne(item.products)?.name)
          .filter(Boolean)
          .join(" ");

        const text = [
          booking.booking_number,
          booking.status,
          booking.setup_address,
          booking.setup_city,
          booking.setup_zip,
          booking.archive_reason,
          customer?.full_name,
          customer?.phone,
          customer?.email,
          products,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return text.includes(query.toLowerCase());
      })
    : scopedBookings;

  const productIds = Array.from(
    new Set(
      scopedBookings
        .flatMap((booking: any) => booking.booking_items || [])
        .map((item: any) => String(getOne(item.products)?.id || ""))
        .filter(Boolean)
    )
  );

  const productComponentsByProductId = new Map<
    string,
    Array<{
      inventoryItemId: string;
      name: string;
      quantityPerProduct: number;
      required: boolean;
    }>
  >();

  if (productIds.length > 0) {
    const productComponentsResult = await supabase
      .from("product_inventory_components")
      .select(
        `
        *,
        inventory_items (
          id,
          name
        )
      `
      )
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });

    if (productComponentsResult.error) {
      throw new Error(productComponentsResult.error.message);
    }

    for (const component of productComponentsResult.data || []) {
      const productId = String((component as any).product_id || "");
      if (!productId) continue;

      const relation = getOne((component as any).inventory_items);
      const inventoryItemId = String((component as any).inventory_item_id || relation?.id || "");
      if (!inventoryItemId) continue;

      const quantityPerProduct = Math.max(
        0,
        Number((component as any).quantity ?? (component as any).quantity_required ?? 1)
      );

      const queue = productComponentsByProductId.get(productId) || [];
      queue.push({
        inventoryItemId,
        name: String(relation?.name || (component as any).component_name || "Component"),
        quantityPerProduct,
        required: (component as any).required !== false,
      });
      productComponentsByProductId.set(productId, queue);
    }
  }

  const today = todayISO();
  const todayBookings = scopedBookings.filter((booking: any) => booking.event_date === today);
  const openBookings = scopedBookings.filter((booking: any) => !["cancelled", "canceled", "closed", "refunded"].includes(String(booking.status || "")));
  const totalBalance = bookings.reduce((sum: number, booking: any) => sum + Number(booking.balance_due || 0), 0);

  const statusOptions = [
    "draft",
    "quote",
    "pending_deposit",
    "booked",
    "scheduled",
    "inventory_reserved",
    "installed",
    "pickup_scheduled",
    "picked_up",
    "closed",
    "cancelled",
    "refunded",
  ];

  return (
    <div className="min-w-0 space-y-4 pb-6 sm:space-y-6 sm:pb-0">
      <section className="rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a723e] sm:text-xs sm:tracking-[0.18em]">Booking operations</div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">Bookings</h2>
            <p className="mt-1.5 hidden max-w-4xl text-sm leading-6 text-[#6c6258] sm:block">
              Bookings, customers, dates, totals, statuses, and quick access to booking details.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <a href="/admin/bookings/new" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c9964f] px-3 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm">
              + New
            </a>
            <a href="/admin/bookings?view=archived" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm">
              Archive
            </a>
            <a href="/admin/calendar" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm">
              Calendar
            </a>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
        <SummaryCard label="Loaded bookings" value={allBookings.length} />
        <SummaryCard label="Today" value={todayBookings.length} hint={formatDate(today)} />
        <SummaryCard label="Open" value={openBookings.length} />
        <SummaryCard label="Balance due" value={formatMoney(totalBalance)} />
      </section>

      <section className="min-w-0 overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.04)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3 py-3.5 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">Bookings list</h3>
              <p className="mt-0.5 text-xs text-[#6c6258] sm:mt-1 sm:text-sm">Search and open booking details.</p>
            </div>
          </div>

          <details className="mt-3 rounded-2xl border border-[#e7ddd1] bg-[#fcfaf7] sm:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-bold text-[#23313f] [&::-webkit-details-marker]:hidden">
              <span>Filters</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#6c6258] ring-1 ring-[#e7ddd1]">
                {selectedDate || "Any date"} · {selectedStatus === "all" ? "All" : prettyStatus(selectedStatus)}
              </span>
            </summary>

            <form className="grid grid-cols-2 gap-2 border-t border-[#e7ddd1] p-3">
              <input type="date" name="date" defaultValue={selectedDate} className="col-span-2 min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />

              <select name="status" defaultValue={selectedStatus} className="min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]">
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{prettyStatus(status)}</option>
                ))}
              </select>

              <select name="view" defaultValue={selectedView} className="min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]">
                <option value="active">Active only</option>
                <option value="archived">Archive only</option>
                <option value="all">All bookings</option>
              </select>

              <input name="q" defaultValue={query} placeholder="Customer, phone, booking #..." className="col-span-2 min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />

              <button type="submit" className="col-span-2 rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#18222d]">
                Apply filters
              </button>
            </form>
          </details>

          <form className="mt-5 hidden gap-3 sm:grid xl:grid-cols-[180px_220px_180px_1fr_120px]">
            <input type="date" name="date" defaultValue={selectedDate} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />

            <select name="status" defaultValue={selectedStatus} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]">
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{prettyStatus(status)}</option>
              ))}
            </select>

            <select name="view" defaultValue={selectedView} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]">
              <option value="active">Active only</option>
              <option value="archived">Archive only</option>
              <option value="all">All bookings</option>
            </select>

            <input name="q" defaultValue={query} placeholder="Search customer, phone, booking number, address..." className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />

            <button type="submit" className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]">
              Filter
            </button>
          </form>
        </div>

        {saved === "bulk-archived" && (
          <div className="mx-3 mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:mx-6">
            Selected bookings were archived.
          </div>
        )}

        {saved === "bulk-archive-empty" && (
          <div className="mx-3 mt-3 rounded-2xl bg-[#fff4d8] px-4 py-3 text-sm font-semibold text-[#8a6b20] ring-1 ring-[#efd582] sm:mx-6">
            Select at least one booking to archive.
          </div>
        )}

        {saved === "bulk-archive-error" && (
          <div className="mx-3 mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200 sm:mx-6">
            Could not archive selected bookings. Try again.
          </div>
        )}

        <form action={archiveSelectedBookingsAction} className="pb-2">
          <input
            type="hidden"
            name="returnTo"
            value={selectedView === "archived" ? "/admin/bookings?view=archived" : returnTo}
          />

          {selectedView !== "archived" ? (
            <div className="mx-3 mt-3 flex flex-col gap-2 rounded-2xl border border-[#e7ddd1] bg-[#fcfaf7] p-3 sm:mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                Bulk actions
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  name="archiveReason"
                  defaultValue="Archived from bookings list"
                  placeholder="Archive reason"
                  className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-xs outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:w-64"
                />

                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#23313f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#18222d]"
                >
                  Archive selected
                </button>
              </div>
            </div>
          ) : null}

        <div className="divide-y divide-[#eee5d9]">
          {bookings.map((booking: any) => {
            const customer = getOne(booking.customers);
            const bookingItems = booking.booking_items || [];
            const products = bookingItems
              .map((item: any) => {
                const product = getOne(item.products);

                if (!product) {
                  return null;
                }

                return {
                  id: String(product.id || item.id || ""),
                  name: String(product.name || "Product"),
                  imageUrl: product.image_url || null,
                  quantity: Math.max(1, Number(item.quantity || 1)),
                };
              })
              .filter(Boolean) as Array<{
                id: string;
                name: string;
                imageUrl: string | null;
                quantity: number;
              }>;
            const markerColor = getBookingMarkerColor(booking, booking.booking_modifiers || []);
            const address = [booking.setup_address, booking.setup_city, booking.setup_state, booking.setup_zip].filter(Boolean).join(", ");
            const productGroups = buildBookingProductGroups(
              booking,
              productComponentsByProductId
            );
            const hasBalance = Number(booking.balance_due || 0) > 0;
            const visibleProducts = products.slice(0, 3);
            const totalProductLines = products.length;
            const totalProductQuantity = products.reduce(
              (sum, item) => sum + item.quantity,
              0
            );
            const visibleProductNames = products.slice(0, 2).map((item) => item.name);
            const remainingProductNames = Math.max(0, products.length - visibleProductNames.length);
            const compactProductTitle =
              visibleProductNames.length > 0
                ? `${visibleProductNames.join(" + ")}${
                    remainingProductNames > 0 ? ` +${remainingProductNames} more` : ""
                  }`
                : "Booking";
            const isArchived = Boolean(booking.archived_at);

            return (
              <div key={booking.id} className="flex items-start gap-2 px-2.5 py-1 sm:gap-3 sm:px-6">
                <div className="pt-4 sm:pt-5">
                  <input
                    type="checkbox"
                    name="bookingIds"
                    value={booking.id}
                    disabled={isArchived}
                    aria-label={`Select booking ${booking.booking_number || booking.id.slice(0, 8)}`}
                    className="h-4 w-4 rounded border-[#cbb69d] text-[#23313f] focus:ring-[#d8e8f7] disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </div>

              <details className="group w-full">
                <summary
                  className="list-none cursor-pointer rounded-[18px] border px-3 py-3 transition [&::-webkit-details-marker]:hidden sm:rounded-2xl sm:py-4"
                  style={{
                    borderColor: `${markerColor}45`,
                    backgroundColor: `${markerColor}10`,
                  }}
                >
                  <div className="grid min-w-0 grid-cols-[68px_1fr] gap-2.5 sm:grid-cols-[96px_1fr] sm:gap-4 xl:grid-cols-[112px_1fr_170px_150px] xl:items-center">
                    <div className="flex min-h-14 items-center pl-0 sm:min-h-16 sm:pl-1">
                      {visibleProducts.length > 0 ? (
                        <div className="flex items-center">
                          {visibleProducts.map((item, index) => (
                            <div
                              key={`${item.id}-${index}`}
                              className="relative h-14 w-14 overflow-hidden rounded-xl ring-2 ring-white shadow-sm sm:h-16 sm:w-16 sm:rounded-2xl"
                              style={{
                                backgroundColor: `${markerColor}22`,
                                marginLeft: index === 0 ? 0 : -20,
                                zIndex: visibleProducts.length - index,
                              }}
                            >
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-[#f1ebe3] px-1 text-center text-[9px] font-semibold text-[#918579]">
                                  No photo
                                </div>
                              )}
                            </div>
                          ))}

                          {products.length > visibleProducts.length && (
                            <div
                              className="relative -ml-[18px] flex h-14 w-14 items-center justify-center rounded-xl bg-[#23313f] text-[11px] font-bold text-white ring-2 ring-white shadow-sm sm:-ml-5 sm:h-16 sm:w-16 sm:rounded-2xl sm:text-xs"
                              style={{ zIndex: 0 }}
                            >
                              +{products.length - visibleProducts.length}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="flex h-14 w-14 items-center justify-center rounded-xl text-[9px] font-semibold text-[#918579] ring-2 ring-white shadow-sm sm:h-16 sm:w-16 sm:rounded-2xl sm:text-[10px]"
                          style={{ backgroundColor: `${markerColor}22` }}
                        >
                          No photo
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/5" style={{ backgroundColor: markerColor }} />
                        <div className="text-sm font-bold text-[#1f1e1b] sm:text-base sm:font-semibold">#{booking.booking_number || booking.id.slice(0, 8)}</div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold sm:px-3 sm:py-1 sm:text-xs ${statusClass(booking.status)}`}>{prettyStatus(booking.status)}</span>
                        {booking.archived_at ? (
                          <span className="rounded-full bg-[#23313f] px-3 py-1 text-xs font-semibold text-white">
                            Archived
                          </span>
                        ) : null}
                        {booking.archived_at && booking.archive_reason ? (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#d8cec0]">
                            {booking.archive_reason}
                          </span>
                        ) : null}
                        {totalProductLines > 1 && (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
                            {totalProductLines} products
                          </span>
                        )}
                        {totalProductQuantity > totalProductLines && (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#8a6b20] ring-1 ring-[#efd582]">
                            {totalProductQuantity} total units
                          </span>
                        )}
                        <span className="ml-1 text-xs font-semibold text-[#9a723e] transition group-open:rotate-180">▾</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[13px] font-semibold leading-5 text-[#1f1e1b] sm:text-sm">
                        {compactProductTitle}
                      </div>
                      <div className="mt-1 truncate text-xs text-[#6c6258] sm:text-sm">{customer?.full_name || "No customer"} · {customer?.phone || "No phone"}</div>
                      {address && <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#8b8177]">{address}</div>}
                    </div>

                    <div className="col-span-2 grid grid-cols-2 gap-2 border-t border-black/5 pt-2.5 text-xs text-[#6c6258] sm:col-span-1 sm:col-start-2 sm:block sm:border-0 sm:pt-0 sm:text-sm xl:col-start-auto">
                      <div>
                        <div className="font-bold text-[#1f1e1b] sm:font-semibold">{formatDate(booking.event_date)}</div>
                        <div className="mt-0.5">{formatTime(booking.event_start_time, timeFormat)} — {formatTime(booking.event_end_time, timeFormat)}</div>
                      </div>

                      <div className="text-right sm:hidden">
                        <div className="font-bold text-[#1f1e1b]">{formatMoney(booking.total_amount)}</div>
                        <div className={hasBalance ? "text-red-700" : "text-emerald-700"}>
                          Due {formatMoney(booking.balance_due)}
                        </div>
                      </div>
                    </div>

                    <div className="hidden text-sm sm:col-start-2 sm:block xl:col-start-auto xl:text-right">
                      <div className="font-semibold text-[#1f1e1b]">{formatMoney(booking.total_amount)}</div>
                      <div className={hasBalance ? "text-red-700" : "text-emerald-700"}>
                        Balance: {formatMoney(booking.balance_due)}
                      </div>
                    </div>
                  </div>
                </summary>

                <div
                  className="mb-3 rounded-[18px] border p-2.5 sm:mb-4 sm:rounded-2xl sm:p-4"
                  style={{
                    borderColor: `${markerColor}45`,
                    backgroundColor: `${markerColor}10`,
                  }}
                >
                  <div className="space-y-3">
                    {productGroups.map((group: any, groupIndex: number) => (
                      <section
                        key={group.bookingItemId || `${group.productId}-${groupIndex}`}
                        className="rounded-xl bg-white p-2.5 ring-1 ring-[#eee5d9] sm:p-3"
                      >
                        <div className="flex items-center gap-3 border-b border-[#eee5d9] pb-3">
                          <div className="h-11 w-11 overflow-hidden rounded-xl bg-[#f1ebe3]">
                            {group.productImageUrl ? (
                              <img
                                src={group.productImageUrl}
                                alt={group.productName}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div>
                            <div className="font-semibold text-[#1f1e1b]">
                              {group.productName}
                            </div>
                            <div className="text-xs text-[#8b8177]">
                              Product quantity: {group.productQuantity}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          <div className="rounded-xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9]">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                              Components for this product
                            </div>
                            <div className="mt-2 space-y-1 text-sm text-[#6c6258]">
                              {group.components.length > 0 ? (
                                group.components.map((component: any) => (
                                  <div key={component.key}>
                                    • {component.name} x {component.quantity}
                                  </div>
                                ))
                              ) : (
                                <div>No components</div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9]">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                              Options for this product
                            </div>
                            <div className="mt-2 space-y-1 text-sm text-[#6c6258]">
                              {group.options.length > 0 ? (
                                group.options.map((option: any) => (
                                  <div key={option.key}>
                                    • {option.name} x {option.quantity}
                                    {option.unitPrice > 0
                                      ? ` (${formatMoney(option.unitPrice)})`
                                      : ""}
                                  </div>
                                ))
                              ) : (
                                <div>No options selected</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:flex-wrap">
                    <a
                      href={`/admin/bookings/${booking.id}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-center text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-4 sm:text-sm"
                    >
                      Open booking
                    </a>

                    {isArchived ? (
                      <button
                        type="submit"
                        name="bookingId"
                        value={booking.id}
                        formAction={restoreArchivedBookingAction}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#23313f] px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-4 sm:text-sm"
                      >
                        Restore
                      </button>
                    ) : (
                      <a
                        href={hasBalance ? `/admin/bookings/${booking.id}?pos=1#payment` : "#"}
                        className={[
                          "inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-center text-xs font-semibold text-white transition sm:rounded-full sm:px-4 sm:text-sm",
                          hasBalance ? "bg-[#23313f] hover:bg-[#18222d]" : "cursor-not-allowed bg-[#9ca3af]",
                        ].join(" ")}
                        aria-disabled={!hasBalance}
                      >
                        Pay (POS)
                      </a>
                    )}
                  </div>
                </div>
              </details>
              </div>
            );
          })}

          {bookings.length === 0 && (
            <div className="px-4 py-10 text-center sm:px-6 sm:py-16">
              <div className="text-base font-bold text-[#1f1e1b] sm:text-lg sm:font-semibold">No bookings found</div>
              <p className="mt-2 text-sm text-[#6c6258]">Try another date, status, or search query.</p>
            </div>
          )}
        </div>
        </form>
      </section>
    </div>
  );
}

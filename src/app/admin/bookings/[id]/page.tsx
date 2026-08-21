import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBookingMarkerColor, getBookingMarkerLabel } from "@/lib/booking/marker-color";
import {
  addPaymentAction,
  updateBookingDiscountAction,
  resendUpdatedContractManualAction,
  updateBookingCustomerAction,
  updateBookingScheduleQuickAction,
} from "./actions";
import CustomerTypeahead from "./CustomerTypeahead";
import PaymentPosPanel from "./PaymentPosPanel";
import BookingDiscountEditor from "./BookingDiscountEditor";
import BookingDangerZone from "./BookingDangerZone";
import CompletionLinkBanner from "./CompletionLinkBanner";
import BookingHero from "./components/BookingHero";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    saved?: string;
    resign?: string;
    inventory?: string;
    pos?: string;
    completionUrl?: string;
    completionEmail?: string;
  }>;
};

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  if (!status) return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";

  if (
    [
      "confirmed",
      "paid",
      "completed",
      "active",
      "available",
      "returned",
      "closed",
      "booked",
      "scheduled",
      "inventory_reserved",
      "out_for_delivery",
      "installed",
      "pickup_scheduled",
      "picked_up",
    ].includes(status)
  ) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (
    [
      "pending",
      "draft",
      "quote",
      "pending_deposit",
      "reserved",
      "picked",
      "loaded",
      "cleaning",
    ].includes(status)
  ) {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (
    [
      "cancelled",
      "canceled",
      "failed",
      "damaged",
      "lost",
      "retired",
      "refunded",
    ].includes(status)
  ) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const raw = String(value).trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value: number | string | null | undefined) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numberValue);
}

function numberOrZero(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getItemIndexFromModifierNotes(value: string | null | undefined) {
  const text = String(value || "");
  const match = text.match(/\[idx:(\d+)\]/i);

  if (!match) {
    return null;
  }

  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function normalizeTimeValue(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return raw.slice(0, 5);
  }

  if (/^\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }

  return raw.slice(0, 5);
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9] sm:rounded-2xl sm:p-4">
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a7a49] sm:text-xs sm:tracking-[0.12em]">
        {label}
      </div>

      <div className="mt-1.5 min-w-0 break-words text-sm font-semibold leading-5 text-[#1f1e1b] sm:mt-2">
        {value || "—"}
      </div>
    </div>
  );
}

export default async function BookingDetailsPage(props: PageProps) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const bookingId = params.id;

  if (bookingId === "new") {
    redirect("/admin/bookings/new");
  }

  if (!isUuid(bookingId)) {
    notFound();
  }

  const supabase = await createClient();

  const [
    bookingResult,
    bookingModifiersResult,
    reservationsResult,
    movementsResult,
    contractsResult,
    handoversResult,
    customersListResult,
    paymentMethodsResult,
    paymentPosSettingsResult,
    discountSecurityResult,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `
        id,
        booking_number,
        status,
        event_date,
        event_start_time,
        event_end_time,
        setup_city,
        setup_address,
        setup_state,
        setup_zip,
        internal_notes,
        subtotal,
        delivery_fee,
        tax_rate,
        tax_amount,
        total_amount,
        deposit_amount,
        balance_due,
        discount_amount,
        created_at,
        updated_at,
        customers (
          id,
          full_name,
          phone,
          email
        ),
        booking_items (
          id,
          quantity,
          unit_price,
          subtotal,
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
      .eq("id", bookingId)
      .single(),

    supabase
      .from("booking_modifiers")
      .select("*")
      .eq("booking_id", bookingId),

    supabase
      .from("inventory_reservations")
      .select(
        `
        id,
        status,
        quantity,
        reserved_from,
        reserved_until,
        picked_at,
        loaded_at,
        installed_at,
        picked_up_at,
        returned_at,
        inventory_items (
          id,
          name,
          sku,
          tracking_type
        ),
        inventory_units (
          id,
          unit_code,
          status,
          condition,
          warehouse_locations (
            id,
            name
          )
        ),
        booking_items (
          id,
          products (
            id,
            name
          )
        )
      `
      )
      .eq("booking_id", bookingId)
      .order("reserved_from", { ascending: true }),

    supabase
      .from("inventory_movements")
      .select(
        `
        id,
        movement_type,
        quantity,
        from_status,
        to_status,
        reason,
        notes,
        created_at,
        inventory_items (
          id,
          name
        ),
        inventory_units (
          id,
          unit_code
        )
      `
      )
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(10),

    supabase
      .from("contracts")
      .select("id, status, signed_at, viewed_at, sent_at, pdf_url, created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1),

    supabase
      .from("handover_documents")
      .select("id, status, signer_name, signed_at, rendered_html, created_at")
      .eq("booking_id", bookingId)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .limit(1),

    supabase
      .from("customers")
      .select("id, full_name, phone, email")
      .order("full_name", { ascending: true })
      .limit(300),

    supabase
      .from("payment_method_settings")
      .select("method, display_name, is_enabled, sort_order")
      .order("sort_order", { ascending: true }),

    supabase
      .from("payment_pos_settings")
      .select(
        "tips_enabled, allow_custom_tip, tip_mode, default_tip_percent, default_tip_amount, tip_percent_options, tip_amount_options"
      )
      .limit(1)
      .maybeSingle(),

    // security-definer RPC: the raw table only allows super_admin SELECT,
    // which would hide the password requirement from other staff roles.
    supabase
      .rpc("get_discount_security_settings")
      .maybeSingle(),
  ]);

  if (bookingResult.error) {
    throw new Error(bookingResult.error.message);
  }

  if (!bookingResult.data) {
    notFound();
  }

  if (reservationsResult.error) {
    throw new Error(reservationsResult.error.message);
  }

  if (bookingModifiersResult.error) {
    throw new Error(bookingModifiersResult.error.message);
  }

  if (movementsResult.error) {
    throw new Error(movementsResult.error.message);
  }

  if (contractsResult.error && !isMissingTableError(contractsResult.error)) {
    throw new Error(contractsResult.error.message);
  }

  if (handoversResult.error && !isMissingTableError(handoversResult.error)) {
    throw new Error(handoversResult.error.message);
  }

  if (customersListResult.error) {
    throw new Error(customersListResult.error.message);
  }

  if (paymentMethodsResult.error && !isMissingTableError(paymentMethodsResult.error)) {
    throw new Error(paymentMethodsResult.error.message);
  }

  if (paymentPosSettingsResult.error && !isMissingTableError(paymentPosSettingsResult.error)) {
    throw new Error(paymentPosSettingsResult.error.message);
  }

  if (discountSecurityResult.error && !isMissingTableError(discountSecurityResult.error)) {
    throw new Error(discountSecurityResult.error.message);
  }

  const booking = bookingResult.data as any;
  const customer = getOne(booking.customers);
  const bookingItems = booking.booking_items || [];
  const bookingModifiers = bookingModifiersResult.data || [];
  const markerColor = getBookingMarkerColor(booking, bookingModifiers);
  const markerLabel = getBookingMarkerLabel(booking, bookingModifiers);
  const reservations = reservationsResult.data || [];
  const movements = movementsResult.data || [];
  const latestContract = (contractsResult.data || [])[0] || null;
  const latestHandover = handoversResult.error ? null : (handoversResult.data || [])[0] || null;
  const customersList = customersListResult.data || [];
  const paymentMethods = (paymentMethodsResult.data || []) as any[];
  const discountSecurityRow = discountSecurityResult.data as
    | { discount_password_enabled: boolean; discount_password_hint: string | null }
    | null;
  const discountSecurity =
    discountSecurityResult.error || !discountSecurityRow
      ? {
          enabled: false,
          hint: "",
        }
      : {
          enabled: discountSecurityRow.discount_password_enabled === true,
          hint: String(discountSecurityRow.discount_password_hint || ""),
        };

  const tipSettings: {
    tipsEnabled: boolean;
    allowCustomTip: boolean;
    tipMode: "percent" | "amount";
    defaultTipPercent: number;
    defaultTipAmount: number;
    tipPercentOptions: number[];
    tipAmountOptions: number[];
  } =
    paymentPosSettingsResult.error || !paymentPosSettingsResult.data
      ? {
          tipsEnabled: true,
          allowCustomTip: true,
          tipMode: "percent" as "percent" | "amount",
          defaultTipPercent: 15,
          defaultTipAmount: 10,
          tipPercentOptions: [10, 15, 20],
          tipAmountOptions: [5, 10, 20],
        }
      : {
          tipsEnabled: paymentPosSettingsResult.data.tips_enabled !== false,
          allowCustomTip: paymentPosSettingsResult.data.allow_custom_tip !== false,
          tipMode:
            paymentPosSettingsResult.data.tip_mode === "amount"
              ? "amount"
              : "percent",
          defaultTipPercent: Number(
            paymentPosSettingsResult.data.default_tip_percent || 15
          ),
          defaultTipAmount: Number(
            paymentPosSettingsResult.data.default_tip_amount || 10
          ),
          tipPercentOptions: String(
            paymentPosSettingsResult.data.tip_percent_options || "10,15,20"
          )
            .split(",")
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isFinite(item) && item >= 0 && item <= 100),
          tipAmountOptions: String(
            paymentPosSettingsResult.data.tip_amount_options || "5,10,20"
          )
            .split(",")
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isFinite(item) && item >= 0),
        };

  if (tipSettings.tipPercentOptions.length === 0) {
    tipSettings.tipPercentOptions = [10, 15, 20];
  }

  if (tipSettings.tipAmountOptions.length === 0) {
    tipSettings.tipAmountOptions = [5, 10, 20];
  }

  const productIds = Array.from(
    new Set(
      bookingItems
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

    if (productComponentsResult.error && !isMissingTableError(productComponentsResult.error)) {
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

  const enabledPaymentMethods =
    paymentMethods.filter((row: any) => row.is_enabled !== false).length > 0
      ? paymentMethods.filter((row: any) => row.is_enabled !== false)
      : [
          { method: "cash", display_name: "Cash" },
          { method: "zelle", display_name: "Zelle" },
          { method: "venmo", display_name: "Venmo" },
          { method: "card", display_name: "Card" },
        ];

  const modifiersSubtotal = bookingModifiers.reduce((sum: number, row: any) => {
    const subtotal = Number(
      (row as any).subtotal ??
        (row as any).line_total ??
        Number((row as any).unit_price || 0) * Number((row as any).quantity || 1)
    );

    return sum + (Number.isFinite(subtotal) ? subtotal : 0);
  }, 0);

  const productsSubtotal = Math.max(0, Number(booking.subtotal || 0) - modifiersSubtotal);

  const modifierIds = Array.from(
    new Set(
      bookingModifiers
        .map((item: any) => String((item as any).modifier_id || ""))
        .filter(Boolean)
    )
  );

  const modifierOptionIds = Array.from(
    new Set(
      bookingModifiers
        .map((item: any) => String((item as any).modifier_group_option_id || ""))
        .filter(Boolean)
    )
  );

  const modifiersById = new Map<string, any>();
  const modifierOptionsById = new Map<string, any>();

  if (modifierIds.length > 0) {
    const modifierCatalogResult = await supabase
      .from("modifiers")
      .select("id, name, image_url")
      .in("id", modifierIds);

    if (!modifierCatalogResult.error) {
      for (const row of modifierCatalogResult.data || []) {
        modifiersById.set(String((row as any).id), row);
      }
    }
  }

  if (modifierOptionIds.length > 0) {
    const modifierOptionsResult = await supabase
      .from("modifier_group_options")
      .select("id, name")
      .in("id", modifierOptionIds);

    if (!modifierOptionsResult.error) {
      for (const row of modifierOptionsResult.data || []) {
        modifierOptionsById.set(String((row as any).id), row);
      }
    }
  }

  const bookingItemIdsByProductId = new Map<string, string[]>();
  const bookingItemIdsByIndex = new Map<number, string>();

  for (let itemIndex = 0; itemIndex < bookingItems.length; itemIndex += 1) {
    const item = bookingItems[itemIndex];
    const product = getOne((item as any).products);
    const productId = String(product?.id || "");
    const bookingItemId = String((item as any).id || "");

    if (!productId || !bookingItemId) {
      continue;
    }

    bookingItemIdsByIndex.set(itemIndex, bookingItemId);

    const queue = bookingItemIdsByProductId.get(productId) || [];
    queue.push(bookingItemId);
    bookingItemIdsByProductId.set(productId, queue);
  }

  const productRoundRobinIndex = new Map<string, number>();
  const modifiersByBookingItemId = new Map<string, any[]>();

  for (const modifier of bookingModifiers) {
    let bookingItemId = String((modifier as any).booking_item_id || "");

    if (!bookingItemId) {
      const productId = String((modifier as any).product_id || "");
      const bookingItemIds = bookingItemIdsByProductId.get(productId) || [];

      if (bookingItemIds.length > 0) {
        const nextIndex = productRoundRobinIndex.get(productId) || 0;
        bookingItemId = bookingItemIds[nextIndex % bookingItemIds.length] || "";
        productRoundRobinIndex.set(productId, nextIndex + 1);
      }
    }

    if (!bookingItemId) {
      const itemIndexFromNotes = getItemIndexFromModifierNotes(
        String((modifier as any).notes || "")
      );

      if (itemIndexFromNotes !== null) {
        bookingItemId = bookingItemIdsByIndex.get(itemIndexFromNotes) || "";
      }
    }

    if (!bookingItemId) {
      continue;
    }

    const queue = modifiersByBookingItemId.get(bookingItemId) || [];
    queue.push(modifier);
    modifiersByBookingItemId.set(bookingItemId, queue);
  }

  const primaryPhoto =
    bookingItems
      .map((item: any) => getOne(item.products)?.image_url)
      .find((value: string | null | undefined) => Boolean(value)) || null;

  const reservationsByProduct = new Map<string, any[]>();
  const componentReservationsByBookingItemId = new Map<
    string,
    Map<string, { name: string; quantity: number }>
  >();

  for (const reservation of reservations) {
    const bookingItem = getOne((reservation as any).booking_items);
    const product = getOne(bookingItem?.products);
    const groupName = String(product?.name || "General reservations");
    const queue = reservationsByProduct.get(groupName) || [];
    queue.push(reservation);
    reservationsByProduct.set(groupName, queue);

    const bookingItemId = String(bookingItem?.id || "");
    if (!bookingItemId) {
      continue;
    }

    const inventoryItem = getOne((reservation as any).inventory_items);
    const inventoryItemId = String(inventoryItem?.id || "");
    const inventoryItemName = String(inventoryItem?.name || "Component");
    const quantity = Math.max(0, numberOrZero((reservation as any).quantity || 0));

    if (!inventoryItemId || quantity <= 0) {
      continue;
    }

    const byInventoryItem =
      componentReservationsByBookingItemId.get(bookingItemId) || new Map();
    const current = byInventoryItem.get(inventoryItemId);

    byInventoryItem.set(inventoryItemId, {
      name: inventoryItemName,
      quantity: (current?.quantity || 0) + quantity,
    });

    componentReservationsByBookingItemId.set(bookingItemId, byInventoryItem);
  }

  const rawAddress = String(booking.setup_address || "").trim();
  const hasExpandedAddressParts =
    rawAddress.includes(String(booking.setup_city || "")) ||
    rawAddress.includes(String(booking.setup_zip || ""));

  const fullAddress = rawAddress
    ? hasExpandedAddressParts
      ? rawAddress
      : [rawAddress, booking.setup_city, booking.setup_state, booking.setup_zip]
          .filter(Boolean)
          .join(", ")
    : [booking.setup_city, booking.setup_state, booking.setup_zip]
        .filter(Boolean)
        .join(", ");

  const savedValue = String(searchParams?.saved || "");
  const showSavedBanner = Boolean(savedValue);
  const showResignBanner = String(searchParams?.resign || "") === "1";
  const showInventoryWarning = String(searchParams?.inventory || "") === "warning";
  const autoOpenPos = String(searchParams?.pos || "") === "1";
  const completionUrl = String(searchParams?.completionUrl || "");
  const completionEmailStatus = String(searchParams?.completionEmail || "");

  return (
    <div className="min-w-0 space-y-4 pb-8 sm:space-y-6 sm:pb-0">
      {completionUrl ? (
        <CompletionLinkBanner
          url={completionUrl}
          emailStatus={completionEmailStatus}
        />
      ) : null}
      <BookingHero
        bookingId={booking.id}
        bookingNumber={booking.booking_number || booking.id.slice(0, 8)}
        statusLabel={prettyStatus(booking.status)}
        statusClassName={statusClass(booking.status)}
        eventDateLabel={formatDate(booking.event_date)}
        customerName={customer?.full_name || "No customer"}
        fullAddress={fullAddress || "No address"}
        primaryPhoto={primaryPhoto || null}
        markerColor={markerColor}
        markerLabel={markerLabel}
      />

      {showSavedBanner && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
          {savedValue === "payment-added"
            ? "Payment saved successfully."
            : savedValue === "contract-resend"
              ? "Contract was sent for re-signature manually."
              : "Changes saved successfully."}
        </section>
      )}

      {showResignBanner && (
        <section className="rounded-2xl border border-[#efd582] bg-[#fff4d8] px-5 py-3 text-sm text-[#8a6b20]">
          Contract marked for re-signature because booking has substantial changes.
        </section>
      )}

      {showInventoryWarning && (
        <section className="rounded-2xl border border-[#efd582] bg-[#fff4d8] px-5 py-3 text-sm text-[#8a6b20]">
          Booking saved, but some inventory reservations could not be rebuilt for selected date/time.
        </section>
      )}

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <DetailCard label="Event date" value={formatDate(booking.event_date)} />
        <DetailCard
          label="Start time"
          value={normalizeTimeValue(booking.event_start_time) || "—"}
        />
        <DetailCard label="End time" value={normalizeTimeValue(booking.event_end_time) || "—"} />
        <DetailCard label="Address" value={booking.setup_address || "—"} />
        <DetailCard label="City" value={booking.setup_city || "—"} />
        <DetailCard label="ZIP" value={booking.setup_zip || "—"} />
      </section>

      <section className="min-w-0 rounded-[20px] border border-black/5 bg-white p-3.5 shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-5 sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-lg sm:font-semibold">Quick edit date and time</h3>
        <p className="mt-1 hidden text-sm text-[#6c6258] sm:block">
          Fast inline update for schedule only.
        </p>

        <form action={updateBookingScheduleQuickAction} className="mt-3 grid grid-cols-2 gap-2.5 sm:mt-4 sm:gap-3 md:grid-cols-4">
          <input type="hidden" name="bookingId" value={booking.id} />

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              Event date
            </span>
            <input
              type="date"
              name="eventDate"
              defaultValue={booking.event_date || ""}
              className="block w-full max-w-[210px] min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:max-w-none sm:rounded-2xl sm:px-4 sm:py-3"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              Start time
            </span>
            <input
              type="time"
              name="eventStartTime"
              defaultValue={normalizeTimeValue(booking.event_start_time)}
              className="block w-full max-w-[150px] min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:max-w-none sm:rounded-2xl sm:px-4 sm:py-3"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              End time
            </span>
            <input
              type="time"
              name="eventEndTime"
              defaultValue={normalizeTimeValue(booking.event_end_time)}
              className="block w-full max-w-[150px] min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:max-w-none sm:rounded-2xl sm:px-4 sm:py-3"
            />
          </label>

          <div className="col-span-2 flex items-end md:col-span-1">
            <button
              type="submit"
              className="w-full rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3"
            >
              Save time only
            </button>
          </div>
        </form>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0 space-y-4 sm:space-y-6">
          <section id="payment" className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Customer
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2.5 p-3.5 sm:gap-4 sm:p-6 md:grid-cols-3">
              <DetailCard label="Name" value={customer?.full_name || "—"} />
              <DetailCard label="Phone" value={customer?.phone || "—"} />
              <div className="col-span-2 md:col-span-1"><DetailCard label="Email" value={customer?.email || "—"} /></div>
            </div>

            <form action={updateBookingCustomerAction} className="border-t border-[#eee5d9] p-3.5 sm:p-6">
              <input type="hidden" name="bookingId" value={booking.id} />

              <CustomerTypeahead
                customers={customersList}
                currentCustomerId={String(customer?.id || "")}
              />

              <div className="mt-3 grid gap-2.5 sm:gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Name
                  </span>
                  <input
                    name="customerName"
                    defaultValue={customer?.full_name || ""}
                    className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Phone
                  </span>
                  <input
                    name="customerPhone"
                    defaultValue={customer?.phone || ""}
                    className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Email
                  </span>
                  <input
                    name="customerEmail"
                    defaultValue={customer?.email || ""}
                    className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                  />
                </label>
              </div>

              <div className="mt-4">
                <button
                  type="submit"
                  className="w-full rounded-xl border border-[#d8cec0] bg-white px-4 py-2.5 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:w-auto sm:rounded-full sm:px-5 sm:py-2"
                >
                  Save customer
                </button>
              </div>
            </form>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Booking items
              </h3>

              <p className="mt-1 hidden text-sm text-[#6c6258] sm:block">
                Products and services attached to this booking.
              </p>
            </div>

            <div className="min-w-0 overflow-visible sm:overflow-x-auto">
              <table className="block w-full border-collapse text-sm sm:table sm:min-w-[760px]">
                <thead className="hidden sm:table-header-group">
                  <tr className="border-b border-[#eee5d9] bg-[#fcfaf7] text-left text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                    <th className="px-5 py-4">Product</th>
                    <th className="px-5 py-4 text-right">Qty</th>
                    <th className="px-5 py-4 text-right">Unit price</th>
                    <th className="px-5 py-4 text-right">Line total</th>
                  </tr>
                </thead>

                <tbody className="block space-y-2.5 p-2.5 sm:table-row-group sm:space-y-0 sm:p-0 sm:divide-y sm:divide-[#f0e7dc]">
                  {bookingItems.map((item: any) => {
                    const product = getOne(item.products);
                    const itemModifiers = modifiersByBookingItemId.get(String(item.id)) || [];
                    const qty = numberOrZero(item.quantity || 1);
                    const unitPrice = numberOrZero(item.unit_price);
                    const lineTotal = numberOrZero(item.subtotal) || qty * unitPrice;
                    const configuredComponents = productComponentsByProductId.get(
                      String(product?.id || "")
                    ) || [];
                    const reservedComponentsByInventoryId =
                      componentReservationsByBookingItemId.get(String(item.id)) || new Map();

                    const itemComponents = configuredComponents
                      .filter((component) => component.required !== false)
                      .map((component) => {
                        const expectedQty = Math.max(
                          0,
                          Number(component.quantityPerProduct || 0) * qty
                        );

                        const reserved = reservedComponentsByInventoryId.get(
                          component.inventoryItemId
                        );

                        return {
                          key: `${String(item.id)}-${component.inventoryItemId}`,
                          name: component.name,
                          expectedQty,
                          reservedQty: Math.max(0, Number(reserved?.quantity || 0)),
                        };
                      })
                      .filter((component) => component.expectedQty > 0);

                    const itemOptions = itemModifiers.map((modifier: any) => {
                      const modifierOptionEntity = modifierOptionsById.get(
                        String((modifier as any).modifier_group_option_id || "")
                      );
                      const modifierEntity = modifiersById.get(
                        String((modifier as any).modifier_id || "")
                      );

                      const modifierNameFromNotes = String((modifier as any).notes || "")
                        .split(":")
                        .slice(-1)[0]
                        ?.trim();

                      const modifierName =
                        modifierOptionEntity?.name ||
                        (modifier as any).label ||
                        modifierEntity?.name ||
                        modifierNameFromNotes ||
                        "Option";

                      const modifierQuantity = Math.max(
                        1,
                        numberOrZero((modifier as any).quantity || 1)
                      );

                      const modifierUnitPrice = numberOrZero(
                        (modifier as any).unit_price ?? (modifier as any).price_delta
                      );

                      return {
                        key: String((modifier as any).id || `${String(item.id)}-${modifierName}`),
                        name: modifierName,
                        quantity: modifierQuantity,
                        unitPrice: modifierUnitPrice,
                      };
                    });

                    return (
                      <tr key={item.id} className="block overflow-hidden rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] hover:bg-[#fcfaf7] sm:table-row sm:rounded-none sm:border-0 sm:bg-white">
                        <td className="block px-3 py-3 sm:table-cell sm:px-5 sm:py-4">
                          <div className="flex items-start gap-3">
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#e7e0d7] ring-1 ring-[#ddd0be] sm:h-14 sm:w-14">
                              {product?.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product?.name || "Booking item"}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[#918579]">
                                  No photo
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold text-[#1f1e1b] sm:whitespace-normal">
                                {product?.name || "Booking item"}
                              </div>

                              {item.notes && (
                                <div className="mt-1 text-xs text-[#8f7f6b]">
                                  {item.notes}
                                </div>
                              )}

                              <div className="mt-2.5 grid gap-2 sm:mt-3 sm:gap-3 md:grid-cols-2">
                                <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#eee5d9] sm:bg-[#f8f4ee]">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                                    Components
                                  </div>

                                  <div className="mt-1 space-y-1 text-xs text-[#7a6f62]">
                                    {itemComponents.length > 0 ? (
                                      itemComponents.map((component) => (
                                        <div key={component.key}>
                                          - {component.name} x {component.expectedQty}
                                          {component.reservedQty > 0 &&
                                          component.reservedQty !== component.expectedQty
                                            ? ` (reserved ${component.reservedQty})`
                                            : ""}
                                        </div>
                                      ))
                                    ) : (
                                      <div>No components</div>
                                    )}
                                  </div>
                                </div>

                                <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#eee5d9] sm:bg-[#f8f4ee]">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                                    Options
                                  </div>

                                  <div className="mt-1 space-y-1 text-xs text-[#7a6f62]">
                                    {itemOptions.length > 0 ? (
                                      itemOptions.map((option) => (
                                        <div key={option.key}>
                                          - {option.name} x {option.quantity}
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
                            </div>
                          </div>
                        </td>

                        <td className="inline-flex w-1/3 flex-col border-t border-[#eee5d9] px-3 py-2 text-left text-[#6c6258] sm:table-cell sm:w-auto sm:border-t-0 sm:px-5 sm:py-4 sm:text-right">
                          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#9a7a49] sm:hidden">Qty</span>
                          <span className="mt-0.5 font-semibold text-[#1f1e1b] sm:mt-0 sm:font-normal sm:text-[#6c6258]">{qty}</span>
                        </td>

                        <td className="inline-flex w-1/3 flex-col border-t border-[#eee5d9] px-3 py-2 text-left text-[#6c6258] sm:table-cell sm:w-auto sm:border-t-0 sm:px-5 sm:py-4 sm:text-right">
                          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#9a7a49] sm:hidden">Unit</span>
                          <span className="mt-0.5 font-semibold text-[#1f1e1b] sm:mt-0 sm:font-normal sm:text-[#6c6258]">{formatMoney(unitPrice)}</span>
                        </td>

                        <td className="inline-flex w-1/3 flex-col border-t border-[#eee5d9] px-3 py-2 text-left font-semibold text-[#1f1e1b] sm:table-cell sm:w-auto sm:border-t-0 sm:px-5 sm:py-4 sm:text-right">
                          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#9a7a49] sm:hidden">Total</span>
                          <span className="mt-0.5">{formatMoney(lineTotal)}</span>
                        </td>
                      </tr>
                    );
                  })}

                  {bookingItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-14 text-center">
                        <div className="text-lg font-semibold text-[#1f1e1b]">
                          No booking items
                        </div>
                        <p className="mt-2 text-sm text-[#6c6258]">
                          This booking does not have items yet.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside className="min-w-0 space-y-4 sm:space-y-6">
          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Payment summary
              </h3>
            </div>

            <div className="space-y-2.5 p-3.5 text-sm sm:space-y-3 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-[#6c6258] sm:text-sm">Subtotal</span>
                <span className="text-sm font-semibold text-[#1f1e1b]">
                  {formatMoney(booking.subtotal)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-[#6c6258] sm:text-sm">Delivery</span>
                <span className="text-sm font-semibold text-[#1f1e1b]">
                  {formatMoney(booking.delivery_fee)}
                </span>
              </div>

              <BookingDiscountEditor
                bookingId={String(booking.id)}
                subtotal={Number(booking.subtotal || 0)}
                currentDiscount={Number(booking.discount_amount || 0)}
                passwordEnabled={discountSecurity.enabled}
                passwordHint={discountSecurity.hint}
                action={updateBookingDiscountAction}
              />

              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-[#6c6258] sm:text-sm">Tax</span>
                <span className="text-sm font-semibold text-[#1f1e1b]">
                  {formatMoney(booking.tax_amount)}
                </span>
              </div>

              <div className="mt-1 rounded-2xl bg-[#23313f] px-3.5 py-3 text-white sm:px-4 sm:py-4">
                <div className="flex items-end justify-between gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55 sm:text-xs">
                    Total
                  </span>
                  <span className="text-xl font-bold tracking-tight sm:text-2xl">
                    {formatMoney(booking.total_amount)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-100">
                  <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700/70">
                    Deposit
                  </div>
                  <div className="mt-1 truncate text-base font-bold text-emerald-700">
                    {formatMoney(booking.deposit_amount)}
                  </div>
                </div>

                <div className="min-w-0 rounded-xl bg-red-50 px-3 py-2.5 ring-1 ring-red-100">
                  <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-red-700/70">
                    Balance
                  </div>
                  <div className="mt-1 truncate text-base font-bold text-red-700">
                    {formatMoney(booking.balance_due)}
                  </div>
                </div>
              </div>

              <PaymentPosPanel
                bookingId={String(booking.id)}
                balanceDue={Number(booking.balance_due || 0)}
                paymentMethods={enabledPaymentMethods.map((row: any) => ({
                  method: String(row.method),
                  display_name: String(row.display_name || row.method),
                }))}
                tipSettings={tipSettings}
                summary={{
                  productsSubtotal,
                  modifiersSubtotal,
                  subtotal: Number(booking.subtotal || 0),
                  discountAmount: Number(booking.discount_amount || 0),
                  deliveryFee: Number(booking.delivery_fee || 0),
                  taxRate: Number(booking.tax_rate || 0),
                  taxAmount: Number(booking.tax_amount || 0),
                  depositAmount: Number(booking.deposit_amount || 0),
                  totalAmount: Number(booking.total_amount || 0),
                  balanceDue: Number(booking.balance_due || 0),
                }}
                paymentAction={addPaymentAction}
                autoOpen={autoOpenPos}
              />
            </div>
          </section>

          <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Recent inventory movement
              </h3>
            </div>

            <div className="divide-y divide-[#f0e7dc]">
              {movements.map((movement: any) => (
                <div key={movement.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#1f1e1b]">
                        {prettyStatus(movement.movement_type)}
                      </div>

                      <div className="mt-1 text-sm text-[#6c6258]">
                        {movement.inventory_items?.name || "Item"}{" "}
                        {movement.inventory_units?.unit_code
                          ? `· ${movement.inventory_units.unit_code}`
                          : ""}
                      </div>
                    </div>

                    {movement.to_status && (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                          movement.to_status
                        )}`}
                      >
                        {prettyStatus(movement.to_status)}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-xs text-[#8f7f6b]">
                    {formatDateTime(movement.created_at)}
                  </div>
                </div>
              ))}

              {movements.length === 0 && (
                <div className="px-6 py-12 text-center text-sm text-[#6c6258]">
                  No inventory movements yet.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Signed contract
              </h3>
            </div>

            <div className="space-y-3 p-6 text-sm">
              {latestContract ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[#6c6258]">Status</span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                        latestContract.status
                      )}`}
                    >
                      {prettyStatus(latestContract.status)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[#6c6258]">Signed at</span>
                    <span className="font-semibold text-[#1f1e1b]">
                      {formatDateTime(latestContract.signed_at)}
                    </span>
                  </div>

                  <div className="grid gap-2 pt-2">
                    <a
                      href={`/admin/contracts/${latestContract.id}/download`}
                      className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-center text-sm font-semibold text-[#2b2a28] hover:bg-[#faf8f5]"
                    >
                      Download signed contract (PDF)
                    </a>

                    <a
                      href={`/admin/contracts/${latestContract.id}/download?format=html`}
                      className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-center text-sm font-semibold text-[#2b2a28] hover:bg-[#faf8f5]"
                    >
                      Download signed contract (HTML)
                    </a>

                    {latestContract.pdf_url && (
                      <a
                        href={latestContract.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-center text-sm font-semibold text-[#2b2a28] hover:bg-[#faf8f5]"
                      >
                        Open signed PDF
                      </a>
                    )}

                    <a
                      href={`/admin/settings?section=contracts&contractQuery=${encodeURIComponent(
                        String(latestContract.id)
                      )}`}
                      className="rounded-full bg-[#23313f] px-4 py-2 text-center text-sm font-semibold text-white hover:bg-[#18222d]"
                    >
                      Open in Contracts history
                    </a>

                    <form action={resendUpdatedContractManualAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button
                        type="submit"
                        className="w-full rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-center text-sm font-semibold text-[#2b2a28] hover:bg-[#faf8f5]"
                      >
                        Send for re-sign manually
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="text-[#6c6258]">
                  No signed contract attached to this booking yet.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Equipment handover
              </h3>
            </div>

            <div className="space-y-3 p-6 text-sm">
              {latestHandover ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[#6c6258]">Status</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(latestHandover.status)}`}>
                      {prettyStatus(latestHandover.status)}
                    </span>
                  </div>

                  {latestHandover.signed_at ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[#6c6258]">Signed at</span>
                      <span className="font-semibold text-[#1f1e1b]">
                        {formatDateTime(latestHandover.signed_at)}
                      </span>
                    </div>
                  ) : null}

                  {latestHandover.signer_name ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[#6c6258]">Signed by</span>
                      <span className="font-semibold text-[#1f1e1b]">
                        {latestHandover.signer_name}
                      </span>
                    </div>
                  ) : null}

                  {latestHandover.rendered_html ? (
                    <div className="grid gap-2 pt-2">
                      <a
                        href={`/admin/handovers/${latestHandover.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-center text-sm font-semibold text-[#2b2a28] hover:bg-[#faf8f5]"
                      >
                        View signed handover
                      </a>
                      <a
                        href={`/admin/handovers/${latestHandover.id}/download?download=1`}
                        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-center text-sm font-semibold text-[#2b2a28] hover:bg-[#faf8f5]"
                      >
                        Download signed handover (HTML)
                      </a>
                    </div>
                  ) : (
                    <div className="text-[#6c6258]">Handover has not been signed yet.</div>
                  )}
                </>
              ) : (
                <div className="text-[#6c6258]">
                  No equipment handover attached to this booking yet.
                </div>
              )}
            </div>
          </section>

          {booking.notes && (
            <section className="rounded-[30px] border border-black/5 bg-[#23313f] p-6 text-white shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
              <h3 className="text-lg font-semibold">Notes</h3>

              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-white/70">
                {booking.notes}
              </p>
            </section>
          )}

          <BookingDangerZone
            bookingId={booking.id}
            bookingLabel={String(booking.booking_number || booking.id)}
            bookingStatus={String(booking.status || "")}
            archivedAt={booking.archived_at || null}
          />

          <section className="rounded-[30px] border border-black/5 bg-[#23313f] p-6 text-white shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
            <h3 className="text-lg font-semibold">Quick actions</h3>

            <div className="mt-4 grid gap-2">
              <a
                href={`/admin/bookings/${booking.id}/workflow`}
                className="rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-[#23313f]"
              >
                Workflow timeline
              </a>

              <a
                href={`/admin/bookings/${booking.id}/photos`}
                className="rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-[#23313f]"
              >
                Photos / proof
              </a>

              <a
                href={`/admin/bookings/${booking.id}/checklist`}
                className="rounded-full bg-[#c9964f] px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Checklist / packing list
              </a>

              <a
                href={`/admin/bookings/${booking.id}/routes`}
                className="rounded-full bg-[#c9964f] px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Create delivery / pickup stops
              </a>

              <a
                href={`/admin/bookings/${booking.id}/inventory`}
                className="rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-[#23313f]"
              >
                Inventory lifecycle
              </a>

              <a
                href="/admin/inventory/returns"
                className="rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-white/10"
              >
                Process returns
              </a>

              <a
                href="/admin/inventory/movements"
                className="rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-white/10"
              >
                Movement log
              </a>

              <a
                href="/admin/routes"
                className="rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-white/10"
              >
                Route board
              </a>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
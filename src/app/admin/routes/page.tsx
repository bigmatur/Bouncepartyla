import { createClient } from "@/lib/supabase/server";
import { getUnifiedAccess } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import RouteBoardClient from "./RouteBoardClient";

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function isCancelledStatus(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  return normalized === "cancelled" || normalized === "canceled";
}

function isMissingTableError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    code === "42p01" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation") ||
    message.includes("column") ||
    message.includes("does not exist")
  );
}

function isMissingArchivedAtError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42703" ||
    (message.includes("archived_at") && message.includes("bookings"))
  );
}

async function fetchRouteStopsForRoutes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  selectedDate: string,
  selectedStatus: string,
  selectedType: string,
  includeWindowColumns: boolean,
) {
  const selectWithArchive = includeWindowColumns
    ? `
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
      time_locked,
      driver_name,
      truck_name,
      items_summary,
      surface,
      gate_code,
      parking_notes,
      setup_notes,
      pickup_notes,
      client_delivery_windows,
      client_pickup_windows,
      balance_due,
      sort_order,
      arrived_at,
      completed_at,
      created_at,
      updated_at,
      bookings (
        id,
        booking_number,
        status,
        marker_color,
        internal_notes,
        archived_at,
        event_date,
        event_start_time,
        event_end_time,
        delivery_date,
        pickup_date,
        delivery_window_start,
        delivery_window_end,
        pickup_window_start,
        pickup_window_end,
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
          unit_price,
          subtotal,
          products (
            id,
            name,
            image_url,
            setup_duration_min,
            teardown_duration_min
          )
        )
      )
    `
    : `
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
      time_locked,
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
        status,
        marker_color,
        internal_notes,
        event_date,
        event_start_time,
        event_end_time,
        delivery_date,
        pickup_date,
        delivery_window_start,
        delivery_window_end,
        pickup_window_start,
        pickup_window_end,
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
          unit_price,
          subtotal,
          products (
            id,
            name,
            image_url,
            setup_duration_min,
            teardown_duration_min
          )
        )
      )
    `;
  const selectWithoutArchive = selectWithArchive.replace(",\n        archived_at", ""
  );

  function buildRequest(selectClause: string) {
    let request = supabase
      .from("route_stops")
      .select(selectClause)
      .eq("stop_date", selectedDate)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (selectedStatus !== "all") request = request.eq("status", selectedStatus);
    if (selectedType !== "all") request = request.eq("stop_type", selectedType);

    return request;
  }

  const result = await buildRequest(selectWithArchive);

  if (result.error && isMissingArchivedAtError(result.error)) {
    return await buildRequest(selectWithoutArchive);
  }

  return result;
}

async function fetchRouteDriversForRoutes(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const variants = [
    {
      select: "id, name, color, phone, notes, active, deleted_at, sort_order",
      filterActive: true,
      filterDeleted: true,
      sortByOrder: true,
    },
    {
      select: "id, name, color, phone, notes, active, deleted_at, sort_order",
      filterActive: true,
      filterDeleted: true,
      sortByOrder: true,
    },
    {
      select: "id, name, color, phone, notes, active, sort_order",
      filterActive: true,
      filterDeleted: false,
      sortByOrder: true,
    },
    {
      select: "id, name, color, phone, active, sort_order",
      filterActive: true,
      filterDeleted: false,
      sortByOrder: true,
    },
    {
      select: "id, name, color, phone, notes",
      filterActive: false,
      filterDeleted: false,
      sortByOrder: false,
    },
    {
      select: "id, name, color",
      filterActive: false,
      filterDeleted: false,
      sortByOrder: false,
    },
  ];

  let lastError: any = null;

  for (const variant of variants) {
    let request = supabase.from("route_drivers").select(variant.select);

    if (variant.filterActive) {
      request = request.eq("active", true);
    }

    if (variant.filterDeleted) {
      request = request.is("deleted_at", null);
    }

    if (variant.sortByOrder) {
      request = request.order("sort_order", { ascending: true });
    }

    request = request.order("name", { ascending: true });

    const result = await request;

    if (!result.error) {
      const rows = (result.data || []) as any[];

      return {
        data: rows
          .filter((row) =>
            row.active === undefined ? true : Boolean(row.active),
          )
          .map((row) => ({
            id: row.id,
            name: row.name,
            color: row.color || "#8b8177",
            phone: row.phone || null,
            notes: row.notes || null,
            active: row.active === undefined ? true : Boolean(row.active),
            deleted_at: row.deleted_at || null,
            sort_order: Number(row.sort_order || 100),
          })),
        error: null,
      };
    }

    lastError = result.error;

    if (!isMissingTableError(result.error)) {
      return { data: [], error: result.error };
    }
  }

  return { data: [], error: lastError };
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="min-w-[132px] shrink-0 snap-start min-w-[118px] shrink-0 snap-start rounded-[18px] border border-black/5 bg-white p-3 shadow-sm sm:min-w-0 sm:rounded-[18px] sm:rounded-[18px] sm:rounded-[24px] sm:p-3 sm:p-3 sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9a723e] sm:text-[10px] sm:text-xs sm:font-semibold sm:tracking-[0.16em]">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">{value}</div>
      {hint && <div className="mt-1 hidden text-xs text-[#6c6258] sm:block">{hint}</div>}
    </div>
  );
}

export default async function AdminRoutesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
    status?: string;
    type?: string;
    q?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const selectedDate = String(resolvedSearchParams?.date || todayISO());
  const selectedStatus = String(resolvedSearchParams?.status || "all");
  const selectedType = String(resolvedSearchParams?.type || "all");
  const query = String(resolvedSearchParams?.q || "").trim();

  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user) {
    redirect("/login");
  }

  if (!access.isActive || !access.can("routes.view")) {
    redirect("/unauthorized");
  }

  if (access.role === "driver") {
    const queryParams = new URLSearchParams();
    queryParams.set("date", selectedDate);
    if (selectedStatus && selectedStatus !== "all") queryParams.set("status", selectedStatus);
    if (selectedType && selectedType !== "all") queryParams.set("type", selectedType);
    if (query) queryParams.set("q", query);

    redirect(`/driver/routes?${queryParams.toString()}`);
  }

  const warehouseSettingsResult = await supabase
    .from("system_settings")
    .select("warehouse_address, warehouse_city, warehouse_state, warehouse_zip")
    .limit(1)
    .maybeSingle();

  if (
    warehouseSettingsResult.error &&
    !isMissingTableError(warehouseSettingsResult.error)
  ) {
    throw new Error(warehouseSettingsResult.error.message);
  }

  const warehouseOriginAddress = [
    warehouseSettingsResult.data?.warehouse_address,
    warehouseSettingsResult.data?.warehouse_city,
    warehouseSettingsResult.data?.warehouse_state,
    warehouseSettingsResult.data?.warehouse_zip,
  ]
    .filter(Boolean)
    .join(", ");

  let stopsResult = await fetchRouteStopsForRoutes(
    supabase,
    selectedDate,
    selectedStatus,
    selectedType,
    true,
  );

  let supportsRouteStopWindows = true;

  if (stopsResult.error && isMissingTableError(stopsResult.error)) {
    supportsRouteStopWindows = false;
    stopsResult = await fetchRouteStopsForRoutes(
      supabase,
      selectedDate,
      selectedStatus,
      selectedType,
      false,
    );
  }

  if (stopsResult.error) throw new Error(stopsResult.error.message);

  const rawStops = (stopsResult.data || []) as any[];

  const filteredStops = rawStops.filter((stop: any) => {
    const booking = Array.isArray(stop.bookings)
      ? stop.bookings[0]
      : stop.bookings;

    const bookingStatus = String(booking?.status || "").toLowerCase();
    const stopStatus = String(stop?.status || "").toLowerCase();

    if (
      booking?.archived_at ||
      isCancelledStatus(bookingStatus) ||
      isCancelledStatus(stopStatus)
    ) {
      return false;
    }

    if (!query) return true;

    const customer = Array.isArray(booking?.customers)
      ? booking.customers[0]
      : booking?.customers;

    const text = [
      stop.customer_name,
      stop.customer_phone,
      stop.address,
      stop.city,
      stop.zip,
      stop.driver_name,
      stop.truck_name,
      stop.items_summary,
      stop.surface,
      stop.gate_code,
      stop.parking_notes,
      stop.setup_notes,
      stop.pickup_notes,
      booking?.booking_number,
      booking?.setup_address,
      booking?.setup_city,
      customer?.full_name,
      customer?.phone,
      customer?.email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(query.toLowerCase());
  });

  const stops =
    selectedType === "all"
      ? Array.from(
          filteredStops.reduce((map: Map<string, any>, stop: any) => {
            const bookingId = String(stop.booking_id || "");

            if (!bookingId) {
              map.set(`stop:${stop.id}`, stop);
              return map;
            }

            const stopType = String(stop.stop_type || "other");
            const key = `${bookingId}:${stopType}`;
            const current = map.get(key);

            if (!current) {
              map.set(key, stop);
              return map;
            }

            // Keep the actual active route-board stop for each booking+type pair.
            // Old logic used earliest created stop, which could show stale saved time.
            const currentSortOrder = Number(current.sort_order || 999999);
            const nextSortOrder = Number(stop.sort_order || 999999);

            if (nextSortOrder < currentSortOrder) {
              map.set(key, stop);
              return map;
            }

            if (nextSortOrder === currentSortOrder) {
              const currentUpdatedAt = new Date(
                String(current.updated_at || current.created_at || 0),
              ).getTime();
              const nextUpdatedAt = new Date(
                String(stop.updated_at || stop.created_at || 0),
              ).getTime();

              if (
                Number.isFinite(nextUpdatedAt) &&
                (!Number.isFinite(currentUpdatedAt) ||
                  nextUpdatedAt > currentUpdatedAt)
              ) {
                map.set(key, stop);
              }
            }

            return map;
          }, new Map<string, any>()),
        )
          .map(([, stop]) => stop)
          .sort((a: any, b: any) => {
            const sortA = Number(a?.sort_order || 999999);
            const sortB = Number(b?.sort_order || 999999);

            if (sortA !== sortB) {
              return sortA - sortB;
            }

            const timeToMinutes = (value: unknown) => {
              const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);

              if (!match) return null;

              const hours = Number(match[1]);
              const minutes = Number(match[2]);

              if (
                !Number.isFinite(hours) ||
                !Number.isFinite(minutes) ||
                hours < 0 ||
                hours > 23 ||
                minutes < 0 ||
                minutes > 59
              ) {
                return null;
              }

              return hours * 60 + minutes;
            };

            const startA = timeToMinutes(a?.scheduled_start_time);
            const startB = timeToMinutes(b?.scheduled_start_time);

            if (startA != null && startB != null && startA !== startB) {
              return startA - startB;
            }

            if (startA != null && startB == null) return -1;
            if (startA == null && startB != null) return 1;

            const updatedA = new Date(
              String(a?.updated_at || a?.created_at || 0),
            ).getTime();
            const updatedB = new Date(
              String(b?.updated_at || b?.created_at || 0),
            ).getTime();

            if (Number.isFinite(updatedA) && Number.isFinite(updatedB) && updatedA !== updatedB) {
              return updatedB - updatedA;
            }

            const createdA = new Date(String(a?.created_at || 0)).getTime();
            const createdB = new Date(String(b?.created_at || 0)).getTime();

            if (Number.isFinite(createdA) && Number.isFinite(createdB) && createdA !== createdB) {
              return createdA - createdB;
            }

            return String(a?.id || "").localeCompare(String(b?.id || ""));
          })
      : filteredStops;

  const bookingIds = Array.from(
    new Set(
      stops.map((stop: any) => String(stop.booking_id || "")).filter(Boolean),
    ),
  );


  // Load every booking item separately. Supabase nested relations can be
  // incomplete for some legacy bookings, so route duration must not depend
  // on the nested route_stops -> bookings -> booking_items payload.
  const completeBookingItemsResult =
    bookingIds.length > 0
      ? await supabase
          .from("booking_items")
          .select(
            `
            id,
            booking_id,
            quantity,
            products (
              id,
              name,
              image_url,
              setup_duration_min,
              teardown_duration_min
            )
          `,
          )
          .in("booking_id", bookingIds)
      : ({ data: [], error: null } as any);

  if (completeBookingItemsResult.error) {
    throw new Error(completeBookingItemsResult.error.message);
  }

  const completeItemsByBookingId = new Map<string, any[]>();

  for (const item of (completeBookingItemsResult.data || []) as any[]) {
    const bookingId = String(item.booking_id || "");
    if (!bookingId) continue;

    const list = completeItemsByBookingId.get(bookingId) || [];
    list.push(item);
    completeItemsByBookingId.set(bookingId, list);
  }

  function itemProduct(item: any) {
    return Array.isArray(item?.products) ? item.products[0] : item?.products;
  }

  function itemQuantity(item: any) {
    const quantity = Number(item?.quantity ?? 1);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }

  function itemDuration(item: any, field: "setup_duration_min" | "teardown_duration_min") {
    const value = Number(itemProduct(item)?.[field] ?? 0);
    return Number.isFinite(value) && value > 0 ? value * itemQuantity(item) : 0;
  }

  const stopsWithCompleteDurations = stops.map((stop: any) => {
    const bookingId = String(stop.booking_id || "");
    const completeItems = completeItemsByBookingId.get(bookingId) || [];

    const routeSetupDurationMin = completeItems.reduce(
      (sum, item) => sum + itemDuration(item, "setup_duration_min"),
      0,
    );
    const routeTeardownDurationMin = completeItems.reduce(
      (sum, item) => sum + itemDuration(item, "teardown_duration_min"),
      0,
    );
    const routeDurationBreakdown = completeItems.map((item) => {
      const product = itemProduct(item);
      return {
        name: String(product?.name || "Product"),
        quantity: itemQuantity(item),
        setupMinutes: itemDuration(item, "setup_duration_min"),
        teardownMinutes: itemDuration(item, "teardown_duration_min"),
      };
    });

    const patchBooking = (booking: any) => ({
      ...booking,
      booking_items: completeItems,
    });

    return {
      ...stop,
      route_setup_duration_min: routeSetupDurationMin,
      route_teardown_duration_min: routeTeardownDurationMin,
      route_duration_breakdown: routeDurationBreakdown,
      bookings: Array.isArray(stop.bookings)
        ? stop.bookings.map(patchBooking)
        : stop.bookings
          ? patchBooking(stop.bookings)
          : stop.bookings,
    };
  });

  const bookingRouteStopsResult =
    bookingIds.length > 0
      ? await supabase
          .from("route_stops")
          .select(
            supportsRouteStopWindows
              ? `
            id,
            booking_id,
            stop_type,
            stop_date,
            scheduled_start_time,
            scheduled_end_time,
            time_locked,
            driver_name,
            client_delivery_windows,
            client_pickup_windows,
            status,
            sort_order,
            created_at,
            updated_at
          `
              : `
            id,
            booking_id,
            stop_type,
            stop_date,
            scheduled_start_time,
            scheduled_end_time,
            time_locked,
            driver_name,
            status,
            sort_order,
            created_at,
            updated_at
          `,
          )
          .in("booking_id", bookingIds)
          .order("sort_order", { ascending: true })
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
      : ({ data: [], error: null } as any);

  if (
    bookingRouteStopsResult.error &&
    !isMissingTableError(bookingRouteStopsResult.error)
  ) {
    throw new Error(bookingRouteStopsResult.error.message);
  }

  const bookingRouteStops = (bookingRouteStopsResult.data || []) as any[];

  const [driversResult, checklistResult, modifiersResult] = await Promise.all([
    fetchRouteDriversForRoutes(supabase),
    bookingIds.length > 0
      ? supabase
          .from("booking_checklist_items")
          .select(
            `
            id,
            booking_id,
            title,
            quantity,
            item_type,
            inventory_items (
              id,
              name,
              sku
            ),
            inventory_units (
              id,
              unit_code,
              serial_number,
              barcode
            )
          `,
          )
          .in("booking_id", bookingIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    bookingIds.length > 0
      ? supabase
          .from("booking_modifiers")
          .select("*")
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (driversResult.error && !isMissingTableError(driversResult.error)) {
    throw new Error(driversResult.error.message);
  }

  if (checklistResult.error && !isMissingTableError(checklistResult.error)) {
    throw new Error(checklistResult.error.message);
  }

  if (modifiersResult.error && !isMissingTableError(modifiersResult.error)) {
    throw new Error(modifiersResult.error.message);
  }

  const driverSettingsReady = !driversResult.error;

  const drivers =
    driversResult.error ||
    !driversResult.data ||
    driversResult.data.length === 0
      ? [
          {
            id: "unassigned",
            name: "Unassigned",
            color: "#8b8177",
            phone: null,
            account_email: null,
            auth_user_id: null,
            notes: null,
            active: true,
            deleted_at: null,
            sort_order: 0,
          },
          {
            id: "driver-1",
            name: "Driver 1",
            color: "#23313f",
            phone: null,
            account_email: null,
            auth_user_id: null,
            notes: null,
            active: true,
            deleted_at: null,
            sort_order: 10,
          },
          {
            id: "driver-2",
            name: "Driver 2",
            color: "#c9964f",
            phone: null,
            account_email: null,
            auth_user_id: null,
            notes: null,
            active: true,
            deleted_at: null,
            sort_order: 20,
          },
        ]
      : driversResult.data;

  const checklistItems = checklistResult.error
    ? []
    : checklistResult.data || [];

  const modifiers = modifiersResult.error ? [] : modifiersResult.data || [];

  const deliveries = stopsWithCompleteDurations.filter((stop: any) => stop.stop_type === "delivery");
  const pickups = stopsWithCompleteDurations.filter((stop: any) => stop.stop_type === "pickup");

  const openStops = stopsWithCompleteDurations.filter((stop: any) =>
    ["scheduled", "on_the_way", "arrived"].includes(stop.status),
  );

  const balanceDue = stopsWithCompleteDurations.reduce(
    (sum: number, stop: any) => sum + Number(stop.balance_due || 0),
    0,
  );


  const driverPingsResult = await supabase
    .from("driver_location_pings")
    .select(
      `
      id,
      driver_name,
      route_date,
      latitude,
      longitude,
      accuracy,
      heading,
      speed,
      created_at
      `,
    )
    .eq("route_date", selectedDate)
    .order("created_at", { ascending: false })
    .limit(500);

  const latestDriverLocationByName = new Map<string, any>();

  for (const ping of driverPingsResult.data || []) {
    const driverName = String(ping.driver_name || "").trim();
    if (!driverName) continue;

    const key = driverName.toLowerCase();

    if (!latestDriverLocationByName.has(key)) {
      latestDriverLocationByName.set(key, ping);
    }
  }

  const liveDriverLocations = Array.from(
    latestDriverLocationByName.values(),
  );


  return (
    <div className="space-y-3 sm:space-y-6">
      <section className="hidden rounded-[22px] sm:rounded-[30px] border border-black/5 bg-white p-3.5 sm:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.03)] sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)] sm:block">
        <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
          <div>
            <div className="hidden sm:block text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Delivery operations
            </div>
            <h2 className="mt-0 sm:mt-0 sm:mt-1 text-2xl sm:text-2xl sm:text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Routes
            </h2>
            <p className="hidden sm:block mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Карта, водители, drag & drop порядок маршрута и раскрывающиеся
              карточки с минимальной формой редактирования.
            </p>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <a
              href={`/admin/routes/driver?date=${selectedDate}`}
              className="rounded-xl sm:rounded-full bg-[#c9964f] px-3 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold text-white shadow-none sm:shadow-[0_12px_30px_rgba(201,150,79,0.24)] transition hover:bg-[#b78744]"
            >
              Driver view
            </a>
            <a
              href={`/admin/routes/driver/checklists?date=${selectedDate}`}
              className="rounded-xl sm:rounded-full bg-[#23313f] px-3 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Driver checklist
            </a>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[18px] border border-black/5 bg-white shadow-sm sm:hidden">
        <div className="grid grid-cols-4 divide-x divide-[#eee5d9]">
          <div className="min-w-0 px-2 py-3 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a723e]">
              Stops
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums text-[#1f1e1b]">
              {stopsWithCompleteDurations.length}
            </div>
          </div>

          <div className="min-w-0 px-2 py-3 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a723e]">
              Delivery
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums text-[#1f1e1b]">
              {deliveries.length}
            </div>
          </div>

          <div className="min-w-0 px-2 py-3 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a723e]">
              Pickup
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums text-[#1f1e1b]">
              {pickups.length}
            </div>
          </div>

          <div className="min-w-0 px-1.5 py-3 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a723e]">
              Due
            </div>
            <div className="mt-1 truncate text-sm font-bold tabular-nums text-red-700">
              {money(balanceDue)}
            </div>
          </div>
        </div>
      </section>

      <section className="hidden sm:grid sm:gap-4 md:grid-cols-5">
        <SummaryCard
          label="Stops"
          value={stopsWithCompleteDurations.length}
          hint={formatDate(selectedDate)}
        />
        <SummaryCard label="Deliveries" value={deliveries.length} />
        <SummaryCard label="Pickups" value={pickups.length} />
        <SummaryCard label="Open stops" value={openStops.length} />
        <SummaryCard label="Balance due" value={money(balanceDue)} />
      </section>

      <RouteBoardClient
        stops={stopsWithCompleteDurations}
        drivers={drivers}
        checklistItems={checklistItems}
        modifiers={modifiers}
        selectedDate={selectedDate}
        selectedType={selectedType}
        selectedStatus={selectedStatus}
        query={query}
        driverSettingsReady={driverSettingsReady}
        googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY || ""}
        warehouseOriginAddress={warehouseOriginAddress}
        bookingRouteStops={bookingRouteStops}
        supportsRouteStopWindows={supportsRouteStopWindows}
        liveDriverLocations={liveDriverLocations}
      />
    </div>
  );
}

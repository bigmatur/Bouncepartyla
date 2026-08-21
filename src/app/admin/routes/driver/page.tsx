import { requireAdminUser } from "@/lib/auth/require-admin";
import DriverRouteApp from "./DriverRouteApp";
import { getBookingMarkerColor } from "@/lib/booking/marker-color";
import { getMyStaffTimeDashboard } from "@/lib/staff-time/dashboard";

const META_START = "[[STAFF_META]]";
const META_END = "[[/STAFF_META]]";

function isMissingArchivedAtError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42703" ||
    (message.includes("archived_at") && message.includes("bookings"))
  );
}

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseStaffMeta(notes: string | null | undefined) {
  const raw = String(notes || "");
  const start = raw.indexOf(META_START);
  const end = raw.indexOf(META_END);

  if (start === -1 || end === -1 || end < start) {
    return {
      role: "driver",
      permissions: ["routes_board", "driver_checklists"],
      plainNotes: raw.trim(),
    };
  }

  const jsonStart = start + META_START.length;
  const rawJson = raw.slice(jsonStart, end);

  let role = "driver";
  let permissions: string[] = ["routes_board", "driver_checklists"];

  try {
    const parsed = JSON.parse(rawJson);
    role = typeof parsed?.role === "string" ? parsed.role : role;
    permissions = Array.isArray(parsed?.permissions)
      ? parsed.permissions.map((item: any) => String(item || "")).filter(Boolean)
      : permissions;
  } catch {
    // keep defaults
  }

  const before = raw.slice(0, start).trim();
  const after = raw.slice(end + META_END.length).trim();
  const plainNotes = [before, after].filter(Boolean).join("\n\n");

  return {
    role,
    permissions,
    plainNotes,
  };
}

function isCancelledStatus(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  return normalized === "cancelled" || normalized === "canceled";
}

export default async function DriverRoutePage({
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
    throw new Error("You do not have permission to view routes.");
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

    if (!linkedDriverResult.data || linkedDriverResult.data.active === false || linkedDriverResult.data.deleted_at) {
      throw new Error("Driver account is not linked to an active route driver profile.");
    }

    forcedDriverName = String(linkedDriverResult.data.name || "").trim();
  }

  const effectiveSelectedDriver = forcedDriverName || selectedDriver;

  const googleMapsApiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    "";

  let warehouseOriginAddress = "";

  const settingsResult = await supabase
    .from("system_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (!settingsResult.error && settingsResult.data) {
    const settings: any = settingsResult.data;

    warehouseOriginAddress = [
      settings.warehouse_address,
      settings.warehouse_city,
      settings.warehouse_state,
      settings.warehouse_zip,
    ]
      .filter(Boolean)
      .join(", ");
  }

  let driverProfiles: any[] = [];

  const driversResult = await supabase
    .from("route_drivers")
    .select(
      `
      id,
      name,
      color,
      phone,
      account_email,
      auth_user_id,
      notes,
      active,
      sort_order
    `
    )
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!driversResult.error) {
    driverProfiles = (driversResult.data || []).map((driver: any) => ({
      ...driver,
      profile: parseStaffMeta(driver.notes),
    }));
  }

  const stopsSelectWithArchive = `
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
      setup_notes,
      balance_due,
      payment_collected,
      sort_order,
      created_at,
      bookings (
        id,
        booking_number,
        balance_due,
        archived_at,
        internal_notes,
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
            name
          )
        ),
        booking_price_calculations (
          id,
          calculation_snapshot,
          created_at
        )
      )
    `;
  const stopsSelectWithoutArchive = stopsSelectWithArchive.replace(",\n        archived_at", ""
  );

  function buildStopsRequest(selectClause: string) {
    let request = supabase
      .from("route_stops")
      .select(selectClause)
      .eq("stop_date", selectedDate)
      .in("stop_type", ["delivery", "pickup"])
      .order("scheduled_start_time", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (effectiveSelectedDriver) {
      request = request.eq("driver_name", effectiveSelectedDriver);
    }

    return request;
  }

  let { data, error } = await buildStopsRequest(stopsSelectWithArchive);

  if (error && isMissingArchivedAtError(error)) {
    const fallbackResult = await buildStopsRequest(stopsSelectWithoutArchive);
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  /**
   * ВАЖНО:
   * Не фильтруем break здесь.
   * Break должен прийти в DriverRouteApp и отобразиться в списке водителя,
   * но внутри DriverRouteApp он НЕ участвует в навигации.
   */
  const stops = (data || [])
    .filter((stop: any) => {
      const booking = Array.isArray(stop.bookings)
        ? stop.bookings[0] || null
        : stop.bookings || null;
      const bookingStatus = String(booking?.status || "").toLowerCase();
      const stopStatus = String(stop.status || "").toLowerCase();

      return !booking?.archived_at && !isCancelledStatus(bookingStatus) && !isCancelledStatus(stopStatus);
    })
    .map((stop: any) => {
      const booking = Array.isArray(stop.bookings)
        ? stop.bookings[0] || null
        : stop.bookings || null;

      const bookingBalanceDue = Number(booking?.balance_due || 0);
      const normalizedBalanceDue = Number.isFinite(bookingBalanceDue)
        ? Math.max(bookingBalanceDue, 0)
        : 0;

      const effectiveBalanceDue =
        String(stop.stop_type || "").toLowerCase() === "delivery"
          ? normalizedBalanceDue
          : Number(stop.balance_due || 0);

      return {
        ...stop,
        balance_due: Number(effectiveBalanceDue.toFixed(2)),
        markerColor: booking
          ? getBookingMarkerColor(booking, booking.booking_modifiers || [])
          : "#23313f",
      };
    });

  const driverNames = Array.from(
    new Set(
      [
        ...driverProfiles
          .map((driver: any) => String(driver.name || "").trim())
          .filter(Boolean)
          .filter((name) => name.toLowerCase() !== "unassigned"),
        ...(data || [])
          .map((stop: any) => String(stop.driver_name || "").trim())
          .filter(Boolean),
      ].filter(Boolean)
    )
  );

  const scopedDriverNames = isLockedDriverScope && effectiveSelectedDriver
    ? [effectiveSelectedDriver]
    : driverNames;

  const selectedDriverProfile =
    driverProfiles.find(
      (driver: any) =>
        String(driver.name || "").toLowerCase() === effectiveSelectedDriver.toLowerCase()
    ) || null;

  // Only a driver viewing their own locked interface receives their own
  // time-clock state. An admin previewing another driver must never see or
  // control the admin user's personal shift from this screen.
  let workTimeEntry: any = null;

  if (isLockedDriverScope) {
    try {
      const dashboard = await getMyStaffTimeDashboard(supabase);
      workTimeEntry = dashboard.current;
    } catch (error: any) {
      console.warn("Driver working-time state could not be loaded", {
        message: String(error?.message || error || "Unknown error"),
      });
    }
  }

  return (
    <DriverRouteApp
      stops={stops}
      selectedDate={selectedDate}
      selectedDriver={effectiveSelectedDriver}
      driverNames={scopedDriverNames}
      driverProfiles={driverProfiles}
      selectedDriverProfile={selectedDriverProfile}
      googleMapsApiKey={googleMapsApiKey}
      warehouseOriginAddress={warehouseOriginAddress}
      lockDriverSelection={isLockedDriverScope}
      workTimeEntry={workTimeEntry}
      showOwnWorkingTime={isLockedDriverScope}
    />
  );
}
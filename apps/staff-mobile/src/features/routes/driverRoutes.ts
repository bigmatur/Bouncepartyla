import { supabase } from "../../lib/supabase";
import {
  loadDriverRouteWeatherFromMobile,
  type MobileRouteWeatherForecast,
} from "../../lib/mobileApi";

export type MobileDriverProfile = {
  id: string;
  name: string;
  phone: string | null;
  color: string | null;
};

export type MobileRouteStop = {
  id: string;
  booking_id: string | null;
  marker_color?: string | null;
  booking_balance_due?: number | string | null;
  booking_payment_reported?: boolean;
  booking_payment_report_needs_review?: boolean;
  payment_not_collected_reported?: boolean | null;
  payment_not_collected_reason?: string | null;
  payment_not_collected_comment?: string | null;
  payment_not_collected_at?: string | null;
  stop_date: string | null;
  stop_type: string | null;
  status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  driver_name: string | null;
  truck_name: string | null;
  items_summary: string | null;
  setup_notes: string | null;
  pickup_notes?: string | null;
  balance_due: number | string | null;
  payment_collected: boolean | null;
  payment_collected_amount?: number | string | null;
  payment_collected_method?: string | null;
  payment_collected_at?: string | null;
  payment_collected_by?: string | null;
  proof_photo_required?: boolean | null;
  proof_photo_uploaded?: boolean | null;
  driver_notes?: string | null;
  sort_order: number | null;
  weather?: MobileRouteWeatherForecast | null;
};

export type MobileChecklistItem = {
  id: string;
  booking_id: string;

  booking_item_id: string | null;
  inventory_item_id: string | null;
  inventory_unit_id: string | null;

  title: string;
  item_type: string | null;
  source: string | null;

  quantity: number | null;

  loaded: boolean | null;
  installed: boolean | null;
  picked_up: boolean | null;
  returned: boolean | null;

  needs_cleaning: boolean | null;
  damaged: boolean | null;
  missing: boolean | null;

  checked_by: string | null;
  notes: string | null;
  sort_order: number | null;

  image_url: string | null;
  inventory_name: string | null;
  inventory_sku: string | null;

  unit_code: string | null;
  serial_number: string | null;
};

export type MobileHandoverProduct = {
  booking_item_id: string | null;
  name: string;
  variant_name: string | null;
  notes: string | null;
  quantity: number;
};

export type MobileHandoverComponent = {
  inventory_item_id: string | null;
  name: string;
  sku: string | null;
  quantity: number;
};

export type MobileHandoverOption = {
  booking_modifier_id: string | null;
  name: string;
  notes: string | null;
  quantity: number;
};

export type MobileHandoverDocument = {
  id: string;
  booking_id: string;
  status: string;

  booking_number: string;
  customer_name: string;
  customer_email: string | null;

  event_date: string | null;
  setup_address: string | null;
  setup_city: string | null;
  setup_state: string | null;
  setup_zip: string | null;

  acknowledgement_label: string;
  signature_label: string;

  products: MobileHandoverProduct[];
  components: MobileHandoverComponent[];
  options: MobileHandoverOption[];

  signer_name: string | null;
  signed_at: string | null;
};

/**
 * Lightweight summary used by the driver's
 * route-calendar popup.
 */
export type MobileDriverRouteDateSummary = {
  date: string;
  deliveries: number;
  pickups: number;
  total: number;
};

export type TodayDriverRoute = {
  driver: MobileDriverProfile;
  date: string;
  stops: MobileRouteStop[];
};

export function localDateISO(date = new Date()) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isMissingTableError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42p01" ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

export function isCompletedStop(
  stop: MobileRouteStop,
) {
  const status = String(
    stop.status || "",
  ).toLowerCase();

  return [
    "installed",
    "picked_up",
    "completed",
  ].includes(status);
}

async function loadMyDriverProfile(): Promise<MobileDriverProfile> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(
      userError.message,
    );
  }

  if (!user) {
    throw new Error(
      "Your staff session has expired. Please sign in again.",
    );
  }

  const driverResult = await supabase
    .from("route_drivers")
    .select(
      "id, name, phone, color",
    )
    .eq(
      "auth_user_id",
      user.id,
    )
    .eq("active", true)
    .is("deleted_at", null)
    .order(
      "sort_order",
      {
        ascending: true,
      },
    )
    .limit(1)
    .maybeSingle();

  if (driverResult.error) {
    throw new Error(
      driverResult.error.message,
    );
  }

  if (!driverResult.data) {
    throw new Error(
      "This account is not linked to an active driver profile. Ask an administrator to link the staff account.",
    );
  }

  return driverResult.data as MobileDriverProfile;
}

export async function loadMobileChecklistForBooking(
  bookingId: string,
): Promise<MobileChecklistItem[]> {
  if (!bookingId) {
    return [];
  }

  const result = await supabase
    .from(
      "booking_checklist_items",
    )
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
        status,
        condition
      )
      `,
    )
    .eq(
      "booking_id",
      bookingId,
    )
    .order(
      "sort_order",
      {
        ascending: true,
      },
    )
    .order(
      "created_at",
      {
        ascending: true,
      },
    );

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }

  const rawItems = (
    (result.data || []) as any[]
  ).map((row) => {
    const inventoryItem =
      Array.isArray(
        row.inventory_items,
      )
        ? row.inventory_items[0] ||
          null
        : row.inventory_items ||
          null;

    const inventoryUnit =
      Array.isArray(
        row.inventory_units,
      )
        ? row.inventory_units[0] ||
          null
        : row.inventory_units ||
          null;

    return {
      id: String(row.id),

      booking_id: String(
        row.booking_id,
      ),

      booking_item_id:
        row.booking_item_id
          ? String(
              row.booking_item_id,
            )
          : null,

      inventory_item_id:
        row.inventory_item_id
          ? String(
              row.inventory_item_id,
            )
          : null,

      inventory_unit_id:
        row.inventory_unit_id
          ? String(
              row.inventory_unit_id,
            )
          : null,

      title: String(
        row.title ||
          "Checklist item",
      ),

      item_type:
        row.item_type
          ? String(
              row.item_type,
            )
          : null,

      source:
        row.source
          ? String(
              row.source,
            )
          : null,

      quantity:
        Number.isFinite(
          Number(
            row.quantity,
          ),
        )
          ? Number(
              row.quantity,
            )
          : 1,

      loaded:
        Boolean(
          row.loaded,
        ),

      installed:
        Boolean(
          row.installed,
        ),

      picked_up:
        Boolean(
          row.picked_up,
        ),

      returned:
        Boolean(
          row.returned,
        ),

      needs_cleaning:
        Boolean(
          row.needs_cleaning,
        ),

      damaged:
        Boolean(
          row.damaged,
        ),

      missing:
        Boolean(
          row.missing,
        ),

      checked_by:
        row.checked_by
          ? String(
              row.checked_by,
            )
          : null,

      notes:
        row.notes
          ? String(
              row.notes,
            )
          : null,

      sort_order:
        Number.isFinite(
          Number(
            row.sort_order,
          ),
        )
          ? Number(
              row.sort_order,
            )
          : null,

      image_url:
        inventoryItem?.image_url
          ? String(
              inventoryItem.image_url,
            )
          : null,

      inventory_name:
        inventoryItem?.name
          ? String(
              inventoryItem.name,
            )
          : null,

      inventory_sku:
        inventoryItem?.sku
          ? String(
              inventoryItem.sku,
            )
          : null,

      unit_code:
        inventoryUnit?.unit_code
          ? String(
              inventoryUnit.unit_code,
            )
          : null,

      serial_number:
        inventoryUnit?.serial_number
          ? String(
              inventoryUnit.serial_number,
            )
          : null,
    } satisfies MobileChecklistItem;
  });

  /*
   * Mobile checklist rules:
   *
   * booking_item = commercial/product row.
   *
   * inventory_reservation = actual operational
   * inventory/component handled by the driver.
   *
   * If a booking item has inventory-reservation
   * children, hide the parent commercial row.
   *
   * If there are no children, keep the
   * booking_item row visible.
   *
   * Do NOT deduplicate by title because two
   * identical physical items may legitimately
   * exist in one booking.
   */

  const inventoryChildrenByBookingItemId =
    new Map<
      string,
      MobileChecklistItem[]
    >();

  for (
    const item of rawItems
  ) {
    if (
      item.booking_item_id &&
      item.source ===
        "inventory_reservation"
    ) {
      const children =
        inventoryChildrenByBookingItemId.get(
          item.booking_item_id,
        ) || [];

      children.push(
        item,
      );

      inventoryChildrenByBookingItemId.set(
        item.booking_item_id,
        children,
      );
    }
  }

  const mobileItems: MobileChecklistItem[] =
    [];

  for (
    const item of rawItems
  ) {
    if (
      item.source ===
      "booking_item"
    ) {
      if (
        !item.booking_item_id
      ) {
        mobileItems.push(
          item,
        );

        continue;
      }

      const children =
        inventoryChildrenByBookingItemId.get(
          item.booking_item_id,
        ) || [];

      if (
        children.length > 0
      ) {
        continue;
      }

      mobileItems.push(
        item,
      );

      continue;
    }

    if (
      item.source ===
      "inventory_reservation"
    ) {
      mobileItems.push(
        item,
      );

      continue;
    }

    mobileItems.push(
      item,
    );
  }

  return mobileItems;
}

export async function loadMobileHandover(
  bookingId: string,
): Promise<MobileHandoverDocument | null> {
  if (!bookingId) {
    return null;
  }

  async function fetchDocument() {
    const result =
      await supabase.rpc(
        "get_handover_document_for_staff",
        {
          p_booking_id:
            bookingId,
        },
      );

    if (result.error) {
      throw new Error(
        result.error.message,
      );
    }

    return (
      result.data || null
    );
  }

  let handover: any =
    await fetchDocument();

  if (!handover) {
    const prepareResult =
      await supabase.rpc(
        "prepare_handover_document",
        {
          p_booking_id:
            bookingId,
        },
      );

    if (
      prepareResult.error
    ) {
      throw new Error(
        prepareResult.error.message,
      );
    }

    handover =
      await fetchDocument();
  }

  if (!handover) {
    throw new Error(
      "Handover document could not be prepared.",
    );
  }

  const bookingSnapshot =
    handover.booking_snapshot &&
    typeof handover.booking_snapshot ===
      "object"
      ? handover.booking_snapshot
      : handover.booking &&
          typeof handover.booking ===
            "object"
        ? handover.booking
        : {};

  const itemsSnapshot =
    handover.items_snapshot &&
    typeof handover.items_snapshot ===
      "object"
      ? handover.items_snapshot
      : handover.items &&
          typeof handover.items ===
            "object"
        ? handover.items
        : {};

  const products =
    Array.isArray(
      itemsSnapshot.products,
    )
      ? itemsSnapshot.products
      : [];

  const components =
    Array.isArray(
      itemsSnapshot.components,
    )
      ? itemsSnapshot.components
      : [];

  const options =
    Array.isArray(
      itemsSnapshot.options,
    )
      ? itemsSnapshot.options
      : [];

  const numberValue = (
    value: unknown,
  ) => {
    const parsed = Number(
      value || 0,
    );

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : 0;
  };

  const cleanText = (
    value: unknown,
  ): string | null => {
    const valueText =
      String(
        value ?? "",
      ).trim();

    return (
      valueText || null
    );
  };

  return {
    id: String(
      handover.id,
    ),

    booking_id: String(
      handover.booking_id ||
        bookingId,
    ),

    status:
      cleanText(
        handover.status,
      )?.toLowerCase() ||
      "draft",

    booking_number:
      cleanText(
        bookingSnapshot.booking_number,
      ) ||
      bookingId.slice(
        0,
        8,
      ),

    customer_name:
      cleanText(
        bookingSnapshot.customer_name,
      ) ||
      "Customer",

    customer_email:
      cleanText(
        bookingSnapshot.customer_email,
      ),

    event_date:
      cleanText(
        bookingSnapshot.event_date,
      ),

    setup_address:
      cleanText(
        bookingSnapshot.setup_address,
      ),

    setup_city:
      cleanText(
        bookingSnapshot.setup_city,
      ),

    setup_state:
      cleanText(
        bookingSnapshot.setup_state,
      ),

    setup_zip:
      cleanText(
        bookingSnapshot.setup_zip,
      ),

    acknowledgement_label:
      cleanText(
        handover.acknowledgement_label_snapshot ||
          handover.acknowledgement_label,
      ) ||
      "I confirm that I reviewed and accept the equipment and quantities listed above.",

    signature_label:
      cleanText(
        handover.signature_label_snapshot ||
          handover.signature_label,
      ) ||
      "Customer signature",

    products:
      products.map(
        (item: any) => ({
          booking_item_id:
            cleanText(
              item.booking_item_id,
            ),

          name:
            cleanText(
              item.name,
            ) ||
            "Product",

          variant_name:
            cleanText(
              item.variant_name,
            ),

          notes:
            cleanText(
              item.notes,
            ),

          quantity:
            numberValue(
              item.quantity,
            ),
        }),
      ),

    components:
      components.map(
        (item: any) => ({
          inventory_item_id:
            cleanText(
              item.inventory_item_id,
            ),

          name:
            cleanText(
              item.name,
            ) ||
            "Component",

          sku:
            cleanText(
              item.sku,
            ),

          quantity:
            numberValue(
              item.quantity,
            ),
        }),
      ),

    options:
      options.map(
        (item: any) => ({
          booking_modifier_id:
            cleanText(
              item.booking_modifier_id,
            ),

          name:
            cleanText(
              item.name,
            ) ||
            "Option",

          notes:
            cleanText(
              item.notes,
            ),

          quantity:
            numberValue(
              item.quantity,
            ),
        }),
      ),

    signer_name:
      cleanText(
        handover.signer_name,
      ),

    signed_at:
      cleanText(
        handover.signed_at,
      ),
  };
}

export async function loadDriverRoute(
  date: string = localDateISO(),
): Promise<TodayDriverRoute> {
  const driver =
    await loadMyDriverProfile();

  const stopsResult =
    await supabase
      .from(
        "route_stops",
      )
      .select(
        "id, booking_id, stop_date, stop_type, status, customer_name, customer_phone, address, city, state, zip, scheduled_start_time, scheduled_end_time, driver_name, truck_name, items_summary, setup_notes, pickup_notes, balance_due, payment_collected, payment_collected_amount, payment_collected_method, payment_collected_at, payment_collected_by, proof_photo_required, proof_photo_uploaded, driver_notes, sort_order, bookings ( marker_color, internal_notes, balance_due )",
      )
      .eq(
        "stop_date",
        date,
      )
      .eq(
        "driver_name",
        driver.name,
      )
      .in(
        "stop_type",
        [
          "delivery",
          "pickup",
        ],
      )
      .or(
        "status.is.null,status.neq.cancelled",
      )
      .order(
        "sort_order",
        {
          ascending: true,
          nullsFirst: false,
        },
      )
      .order(
        "scheduled_start_time",
        {
          ascending: true,
          nullsFirst: false,
        },
      )
      .order(
        "created_at",
        {
          ascending: true,
        },
      );

  if (
    stopsResult.error
  ) {
    throw new Error(
      stopsResult.error.message,
    );
  }

  const stops = (
    (stopsResult.data || []) as any[]
  ).map((row) => {
    const booking = Array.isArray(row.bookings)
      ? row.bookings[0] || null
      : row.bookings || null;

    const {
      bookings: _bookings,
      ...stopRow
    } = row;

    const markerTagMatch = String(
      booking?.internal_notes || "",
    ).match(
      /\[marker_color:\s*(#[0-9a-fA-F]{6})\s*\]/i,
    );

    return {
      ...stopRow,
      booking_balance_due: booking?.balance_due ?? null,
      marker_color:
        booking?.marker_color != null && String(booking.marker_color).trim()
          ? String(booking.marker_color)
          : markerTagMatch?.[1] || null,
    } as MobileRouteStop;
  });

  const normalizedStops = stops.map((stop) => ({
    ...stop,
    marker_color:
      /^#[0-9a-fA-F]{6}$/.test(String(stop.marker_color || "").trim())
        ? String(stop.marker_color).trim()
          : null,
  }));

  const unverifiedPaymentStatusForBooking = (bookingId: string) => {
    const bookingStops = normalizedStops.filter(
      (stop) => String(stop.booking_id || "") === bookingId,
    );

    const bookingBalanceDue = bookingStops.reduce<number | null>((current, stop) => {
      const rawBalance = stop.booking_balance_due ?? stop.balance_due;
      const candidate = Number(rawBalance);

      if (rawBalance == null || !Number.isFinite(candidate)) {
        return current;
      }

      return Math.max(current ?? 0, candidate);
    }, null);

    return {
      reported: false,
      // An explicit zero balance needs no payment. Positive or unavailable
      // balance data stays blocked until the booking-scoped RPC verifies it.
      needsReview: bookingBalanceDue == null || bookingBalanceDue > 0,
    };
  };

  // Read-only, booking-scoped status: includes reports from other route dates.
  // The RPC verifies the authenticated driver's assignment on the server.
  // Fail closed rather than offer Collect when the status cannot be verified.
  const bookingIds = [...new Set(normalizedStops.map((stop) => stop.booking_id).filter((id): id is string => Boolean(id)))];
  const paymentStatusByBooking = new Map<string, { reported: boolean; needsReview: boolean }>();
  if (bookingIds.length > 0) {
    const paymentStatusResult = await supabase.rpc("get_my_driver_booking_payment_reports", {
      p_booking_ids: bookingIds,
    });
    if (paymentStatusResult.error) {
      console.warn(
        "[driver-route] Could not verify booking payment reports; payment actions remain blocked for non-zero or unknown balances.",
        paymentStatusResult.error,
      );

      for (const bookingId of bookingIds) {
        paymentStatusByBooking.set(
          bookingId,
          unverifiedPaymentStatusForBooking(bookingId),
        );
      }
    } else {
      const requestedBookingIds = new Set(bookingIds);
      for (const row of (paymentStatusResult.data || []) as Array<{
        booking_id: string;
        payment_reported: boolean;
        payment_report_needs_review: boolean;
      }>) {
        const bookingId = String(row.booking_id || "");

        if (
          !requestedBookingIds.has(bookingId) ||
          typeof row.payment_reported !== "boolean" ||
          typeof row.payment_report_needs_review !== "boolean"
        ) {
          continue;
        }

        paymentStatusByBooking.set(bookingId, {
          reported: row.payment_reported,
          needsReview: row.payment_report_needs_review,
        });
      }

      if (paymentStatusByBooking.size !== bookingIds.length) {
        console.warn(
          "[driver-route] Payment report RPC returned an incomplete or invalid booking set; missing bookings remain blocked for non-zero or unknown balances.",
          {
            requested: bookingIds.length,
            returned: paymentStatusByBooking.size,
          },
        );

        for (const bookingId of bookingIds) {
          if (!paymentStatusByBooking.has(bookingId)) {
            paymentStatusByBooking.set(
              bookingId,
              unverifiedPaymentStatusForBooking(bookingId),
            );
          }
        }
      }
    }
  }

  const stopIds = normalizedStops.map((stop) => String(stop.id || "")).filter(Boolean);
  let paymentExceptionByStopId = new Map<string, {
    reasonCode: string | null;
    comment: string | null;
    reportedAt: string | null;
  }>();

  if (stopIds.length > 0) {
    const paymentExceptionResult = await supabase
      .from("route_stop_payment_exceptions")
      .select("route_stop_id, reason_code, reason_comment, reported_at, is_active")
      .in("route_stop_id", stopIds)
      .eq("is_active", true);

    if (paymentExceptionResult.error) {
      if (!isMissingTableError(paymentExceptionResult.error)) {
        throw new Error(paymentExceptionResult.error.message);
      }
    } else {
      paymentExceptionByStopId = new Map(
        ((paymentExceptionResult.data || []) as any[])
          .map((row) => {
            const stopId = String(row.route_stop_id || "").trim();

            if (!stopId) {
              return null;
            }

            return [
              stopId,
              {
                reasonCode: row.reason_code ? String(row.reason_code) : null,
                comment: row.reason_comment ? String(row.reason_comment) : null,
                reportedAt: row.reported_at ? String(row.reported_at) : null,
              },
            ] as const;
          })
          .filter(Boolean) as Array<readonly [string, {
            reasonCode: string | null;
            comment: string | null;
            reportedAt: string | null;
          }]>,
      );
    }
  }

  const stopsWithPaymentExceptions = normalizedStops.map((stop) => {
    const exception = paymentExceptionByStopId.get(String(stop.id || ""));

    return {
      ...stop,
      booking_payment_reported: paymentStatusByBooking.get(String(stop.booking_id))?.reported ?? false,
      booking_payment_report_needs_review: paymentStatusByBooking.get(String(stop.booking_id))?.needsReview ?? false,
      payment_not_collected_reported: Boolean(exception),
      payment_not_collected_reason: exception?.reasonCode || null,
      payment_not_collected_comment: exception?.comment || null,
      payment_not_collected_at: exception?.reportedAt || null,
    };
  });

  try {
    const weatherResult =
      await loadDriverRouteWeatherFromMobile(date);

    if (weatherResult.success) {
      return {
        driver,
        date,
        stops: stopsWithPaymentExceptions.map(
          (stop) => ({
            ...stop,
            weather:
              weatherResult.data[
                stop.id
              ] || null,
          }),
        ),
      };
    }
  } catch {
    // Weather is optional and must never block the driver route.
  }

  return {
    driver,
    date,
    stops: stopsWithPaymentExceptions,
  };
}

export async function loadTodayDriverRoute(): Promise<TodayDriverRoute> {
  return loadDriverRoute(
    localDateISO(),
  );
}

/**
 * Existing simple date list.
 *
 * Keep this for compatibility with the current
 * mobile route UI.
 */
export async function loadMyDriverRouteDates(): Promise<
  string[]
> {
  const driver =
    await loadMyDriverProfile();

  const result =
    await supabase
      .from(
        "route_stops",
      )
      .select(
        "stop_date",
      )
      .eq(
        "driver_name",
        driver.name,
      )
      .in(
        "stop_type",
        [
          "delivery",
          "pickup",
        ],
      )
      .or(
        "status.is.null,status.neq.cancelled",
      )
      .not(
        "stop_date",
        "is",
        null,
      )
      .order(
        "stop_date",
        {
          ascending: true,
        },
      )
      .limit(500);

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }

  return Array.from(
    new Set(
      (
        result.data || []
      )
        .map((row) =>
          String(
            row.stop_date ||
              "",
          ).trim(),
        )
        .filter(Boolean),
    ),
  ).sort();
}

/**
 * Route-calendar data for the logged-in driver.
 *
 * Returns only dates on which this driver actually
 * has delivery/pickup stops, together with counts.
 *
 * Example:
 *
 * {
 *   date: "2026-08-22",
 *   deliveries: 2,
 *   pickups: 4,
 *   total: 6
 * }
 */
export async function loadMyDriverRouteCalendar(): Promise<
  MobileDriverRouteDateSummary[]
> {
  const driver =
    await loadMyDriverProfile();

  const result =
    await supabase
      .from(
        "route_stops",
      )
      .select(
        "stop_date, stop_type",
      )
      .eq(
        "driver_name",
        driver.name,
      )
      .in(
        "stop_type",
        [
          "delivery",
          "pickup",
        ],
      )
      .or(
        "status.is.null,status.neq.cancelled",
      )
      .not(
        "stop_date",
        "is",
        null,
      )
      .order(
        "stop_date",
        {
          ascending: true,
        },
      )
      .limit(1000);

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }

  const byDate =
    new Map<
      string,
      MobileDriverRouteDateSummary
    >();

  for (
    const row of
      result.data || []
  ) {
    const date =
      String(
        row.stop_date ||
          "",
      ).trim();

    if (!date) {
      continue;
    }

    const stopType =
      String(
        row.stop_type ||
          "",
      ).toLowerCase();

    const current =
      byDate.get(date) || {
        date,
        deliveries: 0,
        pickups: 0,
        total: 0,
      };

    if (
      stopType ===
      "delivery"
    ) {
      current.deliveries +=
        1;
    }

    if (
      stopType ===
      "pickup"
    ) {
      current.pickups +=
        1;
    }

    current.total += 1;

    byDate.set(
      date,
      current,
    );
  }

  return Array.from(
    byDate.values(),
  ).sort(
    (a, b) =>
      a.date.localeCompare(
        b.date,
      ),
  );
}
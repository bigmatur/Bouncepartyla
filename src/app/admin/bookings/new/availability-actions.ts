"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cleanupExpiredCustomerCheckoutHoldsBestEffort } from "@/lib/booking/inventory-integrity";

type BookingActor = "customer" | "cashier";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumberValue(value: any, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;

  const parsed = Number(String(value).replace(",", "."));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getInventoryBaselineQuantity(inventoryItem: any) {
  const quantityOnHand = getNumberValue(inventoryItem?.quantity_on_hand, 0);
  const quantityAvailable = getNumberValue(inventoryItem?.quantity_available, 0);

  if (quantityOnHand > 0 || quantityAvailable > 0) {
    return Math.max(quantityOnHand, quantityAvailable);
  }

  return Math.max(
    getNumberValue(inventoryItem?.total_quantity, 0),
    quantityOnHand,
    quantityAvailable,
  );
}

const AVAILABLE_UNIT_STATUSES = new Set(["available", "returned"]);

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function toIsoNoMs(date: Date) {
  return date.toISOString();
}

function parseLocalDateTime(eventDate: string, time: string) {
  const safeTime = time || "08:00";
  return new Date(`${eventDate}T${safeTime}:00-07:00`);
}

function parseBookingActor(value: string): BookingActor {
  return value === "customer" ? "customer" : "cashier";
}

function timeToMinutes(value: string) {
  const [hoursRaw, minutesRaw] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw || 0);
  const minutes = Number(minutesRaw || 0);
  return hours * 60 + minutes;
}

function isValidTimeString(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

async function validateTimePolicy(
  supabase: any,
  params: {
    bookingActor: BookingActor;
    eventDate: string;
    eventStartTime: string;
    eventEndTime: string;
  },
) {
  const startMinutes = timeToMinutes(params.eventStartTime);
  const endMinutes = timeToMinutes(params.eventEndTime);

  if (endMinutes <= startMinutes) {
    return "End time must be later than start time.";
  }

  if (startMinutes % 30 !== 0 || endMinutes % 30 !== 0) {
    return "Time must be selected in 30-minute increments.";
  }

  if (params.bookingActor !== "customer") {
    return null;
  }

  const { data: exception, error: exceptionError } = await supabase
    .from("warehouse_working_hour_exceptions")
    .select("is_open, open_time, close_time")
    .eq("exception_date", params.eventDate)
    .maybeSingle();

  if (exceptionError) {
    throw new Error(exceptionError.message);
  }

  let isOpen = true;
  let openTime = "08:00";
  let closeTime = "21:00";

  if (exception) {
    isOpen = exception.is_open !== false;
    openTime = exception.open_time
      ? String(exception.open_time).slice(0, 5)
      : openTime;
    closeTime = exception.close_time
      ? String(exception.close_time).slice(0, 5)
      : closeTime;
  } else {
    const dayOfWeek = new Date(`${params.eventDate}T00:00:00`).getDay();

    const { data: workingHour, error: workingHourError } = await supabase
      .from("warehouse_working_hours")
      .select("is_open, open_time, close_time")
      .eq("day_of_week", dayOfWeek)
      .maybeSingle();

    if (workingHourError) {
      throw new Error(workingHourError.message);
    }

    if (workingHour) {
      isOpen = workingHour.is_open !== false;
      openTime = workingHour.open_time
        ? String(workingHour.open_time).slice(0, 5)
        : openTime;
      closeTime = workingHour.close_time
        ? String(workingHour.close_time).slice(0, 5)
        : closeTime;
    }
  }

  if (!isOpen) {
    return "Customer bookings are not available on this date.";
  }

  if (
    startMinutes < timeToMinutes(openTime) ||
    endMinutes > timeToMinutes(closeTime)
  ) {
    return `Customer bookings are only available from ${openTime} to ${closeTime}.`;
  }

  return null;
}

function getProductTiming(product: any) {
  return {
    rentalDurationMin: getNumberValue(product.rental_duration_min, 720),
    setupDurationMin: getNumberValue(product.setup_duration_min, 60),
    teardownDurationMin: getNumberValue(product.teardown_duration_min, 60),
    bufferBeforeMin: getNumberValue(product.buffer_before_min, 0),
    bufferAfterMin: getNumberValue(product.buffer_after_min, 0),
  };
}

function calculateAvailabilityWindow({
  product,
  eventDate,
  eventStartTime,
  eventEndTime,
}: {
  product: any;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
}) {
  const timing = getProductTiming(product);

  const start = parseLocalDateTime(eventDate, eventStartTime || "08:00");

  let end: Date;

  if (eventEndTime) {
    end = parseLocalDateTime(eventDate, eventEndTime);
  } else {
    end = addMinutes(start, timing.rentalDurationMin);
  }

  if (end <= start) {
    end = addMinutes(start, timing.rentalDurationMin);
  }

  const minimumEnd = addMinutes(start, timing.rentalDurationMin);

  if (end < minimumEnd) {
    end = minimumEnd;
  }

  const reservedFrom = addMinutes(
    start,
    -timing.setupDurationMin - timing.bufferBeforeMin,
  );

  const reservedUntil = addMinutes(
    end,
    timing.teardownDurationMin + timing.bufferAfterMin,
  );

  return {
    eventStart: toIsoNoMs(start),
    eventEnd: toIsoNoMs(end),
    reservedFrom: toIsoNoMs(reservedFrom),
    reservedUntil: toIsoNoMs(reservedUntil),
    timing,
  };
}

async function getOverlappingReservations(
  supabase: any,
  {
    inventoryItemId,
    reservedFrom,
    reservedUntil,
  }: {
    inventoryItemId: string;
    reservedFrom: string;
    reservedUntil: string;
  },
) {

  const { data, error } = await supabase
    .from("inventory_reservations")
    .select(
      "id, inventory_unit_id, quantity, status, reserved_from, reserved_until",
    )
    .eq("inventory_item_id", inventoryItemId)
    .in("status", ["reserved", "picked", "loaded", "delivered", "installed"])
    .lt("reserved_from", reservedUntil)
    .gt("reserved_until", reservedFrom);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function checkQuantityInventory(
  supabase: any,
  {
    inventoryItem,
    quantityNeeded,
    reservedFrom,
    reservedUntil,
  }: {
    inventoryItem: any;
    quantityNeeded: number;
    reservedFrom: string;
    reservedUntil: string;
  },
) {
  const reservations = await getOverlappingReservations(supabase, {
    inventoryItemId: inventoryItem.id,
    reservedFrom,
    reservedUntil,
  });

  const reservedQuantity = reservations.reduce((sum: number, row: any) => {
    return sum + getNumberValue(row.quantity, 0);
  }, 0);

  const totalQuantity = getInventoryBaselineQuantity(inventoryItem);

  const quantityAvailable = Math.max(0, totalQuantity - reservedQuantity);

  return {
    quantityAvailable,
    availableUnitIds: [],
    available: quantityAvailable >= quantityNeeded,
    reason:
      quantityAvailable >= quantityNeeded
        ? null
        : `Need ${quantityNeeded}, available ${quantityAvailable}.`,
  };
}

async function checkSerializedInventory(
  supabase: any,
  {
    inventoryItem,
    quantityNeeded,
    reservedFrom,
    reservedUntil,
  }: {
    inventoryItem: any;
    quantityNeeded: number;
    reservedFrom: string;
    reservedUntil: string;
  },
) {
  const reservations = await getOverlappingReservations(supabase, {
    inventoryItemId: inventoryItem.id,
    reservedFrom,
    reservedUntil,
  });

  const reservedUnitIds = new Set(
    reservations
      .map((row: any) => row.inventory_unit_id)
      .filter(Boolean)
      .map(String),
  );

  const { data: units, error } = await supabase
    .from("inventory_units")
    .select("id, status, retired_at")
    .eq("inventory_item_id", inventoryItem.id)
    .is("retired_at", null);

  if (error) {
    throw new Error(error.message);
  }

  const activeUnits = units || [];

  /*
   * Some older inventory records are marked as serialized but store their
   * stock only in quantity_on_hand / quantity_available and do not yet have
   * rows in inventory_units. Treating those records as having zero stock made
   * products such as a four-unit inflatable appear unavailable after only one
   * reservation.
   *
   * When real serialized units exist, unit-level reservations remain the source
   * of truth. The quantity fallback is used only when there are no unit rows.
   */
  if (activeUnits.length === 0) {
    const totalQuantity = getInventoryBaselineQuantity(inventoryItem);

    const reservedQuantity = reservations.reduce((sum: number, row: any) => {
      return sum + Math.max(1, getNumberValue(row.quantity, 1));
    }, 0);

    const quantityAvailable = Math.max(0, totalQuantity - reservedQuantity);

    return {
      quantityAvailable,
      availableUnitIds: [],
      available: quantityAvailable >= quantityNeeded,
      reason:
        quantityAvailable >= quantityNeeded
          ? null
          : `Need ${quantityNeeded}, available ${quantityAvailable}.`,
    };
  }

  const availableUnits = activeUnits.filter((unit: any) => {
    const status = String(unit?.status || "").trim().toLowerCase();

    if (!AVAILABLE_UNIT_STATUSES.has(status)) {
      return false;
    }

    return !reservedUnitIds.has(String(unit.id));
  });

  const availableUnitIds = availableUnits.map((unit: any) => unit.id);
  const quantityAvailable = availableUnitIds.length;

  return {
    quantityAvailable,
    availableUnitIds,
    available: quantityAvailable >= quantityNeeded,
    reason:
      quantityAvailable >= quantityNeeded
        ? null
        : `Need ${quantityNeeded}, available ${quantityAvailable}.`,
  };
}

function componentName(component: any) {
  return (
    component.component_name ||
    component.name ||
    component.role ||
    "Component"
  );
}

function componentQuantity(component: any) {
  return getNumberValue(
    component.quantity,
    getNumberValue(component.quantity_required, 1),
  );
}

async function checkBookingItemAvailabilityCore(
  supabase: any,
  formData: FormData,
) {

  const productId = getString(formData, "productId");
  const quantity = Math.max(
    1,
    getNumberValue(getString(formData, "quantity"), 1),
  );
  const eventDate = getString(formData, "eventDate");
  const eventStartTime = getString(formData, "eventStartTime");
  const eventEndTime = getString(formData, "eventEndTime");
  const bookingActor = parseBookingActor(getString(formData, "bookingActor"));
  const modifierCount = Math.max(
    0,
    Math.floor(getNumberValue(getString(formData, "modifierCount"), 0)),
  );

  if (!productId) {
    throw new Error("Missing product id.");
  }

  if (!eventDate) {
    return {
      available: false,
      message: "Choose event date before checking inventory.",
      components: [],
      missingComponents: [],
      reservedFrom: null,
      reservedUntil: null,
    };
  }

  if (!isValidTimeString(eventStartTime) || !isValidTimeString(eventEndTime)) {
    return {
      available: false,
      message: "Choose start and end time before checking inventory.",
      components: [],
      missingComponents: [],
      reservedFrom: null,
      reservedUntil: null,
    };
  }

  const timePolicyMessage = await validateTimePolicy(
    supabase,
    {
      bookingActor,
      eventDate,
      eventStartTime,
      eventEndTime,
    },
  );

  if (timePolicyMessage) {
    return {
      available: false,
      message: timePolicyMessage,
      components: [],
      missingComponents: [],
      reservedFrom: null,
      reservedUntil: null,
    };
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      rental_duration_min,
      setup_duration_min,
      teardown_duration_min,
      buffer_before_min,
      buffer_after_min,
      inventory_item_id
    `,
    )
    .eq("id", productId)
    .single();

  if (productError) {
    throw new Error(productError.message);
  }

  const window = calculateAvailabilityWindow({
    product,
    eventDate,
    eventStartTime,
    eventEndTime,
  });

  const { data: componentRows, error: componentsError } = await supabase
    .from("product_inventory_components")
    .select(
      `
      *,
      inventory_items (
        id,
        name,
        tracking_type,
        quantity_on_hand,
        quantity_available,
        active
      )
    `,
    )
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  if (componentsError) {
    throw new Error(componentsError.message);
  }

  let components = [...(componentRows || [])];

  /*
   * The main physical product must always be included.
   *
   * Previously it was added only when no component rows existed.
   * Therefore products with blower/tarp/cord components did not reserve
   * the actual inflatable.
   */
  const mainItemAlreadyIncluded = components.some(
      (component: any) =>
        String(component.inventory_item_id || "") ===
        String(product.inventory_item_id),
  );

  if (product.inventory_item_id && !mainItemAlreadyIncluded) {
      const { data: mainInventoryItem, error: mainInventoryError } =
        await supabase
          .from("inventory_items")
          .select(
            `
            id,
            name,
            tracking_type,
            quantity_on_hand,
            quantity_available,
            active
          `,
          )
          .eq("id", product.inventory_item_id)
          .maybeSingle();

      if (mainInventoryError) {
        throw new Error(mainInventoryError.message);
      }

      if (!mainInventoryItem) {
        return {
          available: false,
          message: `Main inventory item is missing for "${product.name}".`,
          components: [],
          missingComponents: [
            {
              componentId: product.id,
              componentName: product.name,
              inventoryItemId: product.inventory_item_id,
              inventoryItemName: "Missing inventory item",
              trackingType: "unknown",
              quantityRequired: 1,
              quantityNeeded: quantity,
              quantityAvailable: 0,
              available: false,
              isRequired: true,
              role: "main_product",
              availableUnitIds: [],
              reason: "Main inventory item was not found.",
            },
          ],
          reservedFrom: window.reservedFrom,
          reservedUntil: window.reservedUntil,
          timing: window.timing,
        };
      }

      if (mainInventoryItem.active === false) {
        return {
          available: false,
          message: `Main inventory item is inactive for "${product.name}".`,
          components: [],
          missingComponents: [
            {
              componentId: product.id,
              componentName: product.name,
              inventoryItemId: mainInventoryItem.id,
              inventoryItemName: mainInventoryItem.name,
              trackingType: String(mainInventoryItem.tracking_type || "unknown"),
              quantityRequired: 1,
              quantityNeeded: quantity,
              quantityAvailable: 0,
              available: false,
              isRequired: true,
              role: "main_product",
              availableUnitIds: [],
              reason: "Main inventory item is inactive.",
            },
          ],
          reservedFrom: window.reservedFrom,
          reservedUntil: window.reservedUntil,
          timing: window.timing,
        };
      }

      components.unshift({
        id: `main-product-${productId}`,
        product_id: productId,
        inventory_item_id: mainInventoryItem.id,
        component_name: product.name,
        quantity_required: 1,
        is_required: true,
        role: "main",
        inventory_behavior: "reusable",
        inventory_items: mainInventoryItem,
      });
  }

  /*
   * A rental product without any inventory mapping must not be treated as
   * automatically available.
   */
  if (components.length === 0) {
    return {
      available: false,
      message: `Inventory is not configured for "${product.name}".`,
      components: [],
      missingComponents: [
        {
          componentName: product.name,
          inventoryItemId: null,
          reason:
            "Link the product to an inventory item or configure product components.",
        },
      ],
      reservedFrom: window.reservedFrom,
      reservedUntil: window.reservedUntil,
      timing: window.timing,
    };
  }

  const checkedComponents = [];

  for (const component of components) {
    const inventoryItem = Array.isArray(component.inventory_items)
      ? component.inventory_items[0]
      : component.inventory_items;

    if (!inventoryItem) {
      checkedComponents.push({
        componentId: component.id,
        componentName: componentName(component),
        inventoryItemId: component.inventory_item_id,
        inventoryItemName: "Missing inventory item",
        trackingType: "unknown",
        quantityRequired: componentQuantity(component),
        quantityNeeded: componentQuantity(component) * quantity,
        quantityAvailable: 0,
        available: false,
        isRequired: component.is_required !== false,
        role: component.role || "component",
        inventoryBehavior: component.inventory_behavior === "consumable" ? "consumable" : "reusable",
        availableUnitIds: [],
        reason: "Inventory item is missing.",
      });

      continue;
    }

    const quantityRequired = componentQuantity(component);
    const quantityNeeded = quantityRequired * quantity;
    const trackingType = String(inventoryItem.tracking_type || "serialized");

    let result;

    if (trackingType === "quantity" || trackingType === "consumable") {
      result = await checkQuantityInventory(
        supabase,
        {
          inventoryItem,
          quantityNeeded,
          reservedFrom: window.reservedFrom,
          reservedUntil: window.reservedUntil,
        },
      );
    } else {
      result = await checkSerializedInventory(
        supabase,
        {
          inventoryItem,
          quantityNeeded,
          reservedFrom: window.reservedFrom,
          reservedUntil: window.reservedUntil,
        },
      );
    }

    checkedComponents.push({
      componentId: component.id,
      componentName: componentName(component),
      inventoryItemId: inventoryItem.id,
      inventoryItemName: inventoryItem.name,
      trackingType,
      quantityRequired,
      quantityNeeded,
      quantityAvailable: result.quantityAvailable,
      available: result.available,
      isRequired: component.is_required !== false,
      role: component.role || "component",
      inventoryBehavior: component.inventory_behavior === "consumable" ? "consumable" : "reusable",
      availableUnitIds: result.availableUnitIds,
      reason: result.reason,
    });
  }

  /*
   * Check inventory-backed modifier options separately. An unavailable option
   * must not make the main product unavailable.
   */
  const modifierAvailability: Array<{
    optionId: string;
    optionName: string;
    inventoryItemId: string;
    inventoryItemName: string;
    trackingType: string;
    quantityNeeded: number;
    quantityAvailable: number;
    available: boolean;
    reason: string | null;
  }> = [];

  for (let index = 0; index < modifierCount; index += 1) {
    const optionId = getString(formData, `modifierOptionId_${index}`);
    const optionName =
      getString(formData, `modifierOptionName_${index}`) || "Option";
    const inventoryItemId = getString(
      formData,
      `modifierInventoryItemId_${index}`,
    );
    const trackInventory =
      getString(formData, `modifierTrackInventory_${index}`) === "true";
    const quantityPerProduct = Math.max(
      0,
      getNumberValue(
        getString(formData, `modifierInventoryQuantity_${index}`),
        1,
      ),
    );

    if (!optionId || !trackInventory || !inventoryItemId) {
      continue;
    }

    const quantityNeeded = quantityPerProduct * quantity;

    if (quantityNeeded <= 0) {
      continue;
    }

    const { data: inventoryItem, error: inventoryItemError } = await supabase
      .from("inventory_items")
      .select(
        `
        id,
        name,
        tracking_type,
        quantity_on_hand,
        quantity_available,
        active
      `,
      )
      .eq("id", inventoryItemId)
      .maybeSingle();

    if (inventoryItemError) {
      throw new Error(inventoryItemError.message);
    }

    if (!inventoryItem || inventoryItem.active === false) {
      modifierAvailability.push({
        optionId,
        optionName,
        inventoryItemId,
        inventoryItemName: inventoryItem?.name || "Missing inventory item",
        trackingType: String(inventoryItem?.tracking_type || "unknown"),
        quantityNeeded,
        quantityAvailable: 0,
        available: false,
        reason: inventoryItem
          ? "Inventory item for this option is inactive."
          : "Inventory item for this option is missing.",
      });

      continue;
    }

    const trackingType = String(inventoryItem.tracking_type || "serialized");
    const result =
      trackingType === "quantity" || trackingType === "consumable"
        ? await checkQuantityInventory(
            supabase,
            {
              inventoryItem,
              quantityNeeded,
              reservedFrom: window.reservedFrom,
              reservedUntil: window.reservedUntil,
            },
          )
        : await checkSerializedInventory(
            supabase,
            {
              inventoryItem,
              quantityNeeded,
              reservedFrom: window.reservedFrom,
              reservedUntil: window.reservedUntil,
            },
          );

    modifierAvailability.push({
      optionId,
      optionName,
      inventoryItemId: inventoryItem.id,
      inventoryItemName: inventoryItem.name,
      trackingType,
      quantityNeeded,
      quantityAvailable: result.quantityAvailable,
      available: result.available,
      reason: result.reason,
    });
  }

  const missingComponents = checkedComponents.filter((component) => {
    return component.isRequired && !component.available;
  });

  const productAvailable = missingComponents.length === 0;

  return {
    available: productAvailable,
    productAvailable,
    message: productAvailable
      ? "Product is available for selected date and time."
      : "Product is not available for selected date and time.",
    components: checkedComponents,
    missingComponents,
    modifierAvailability,
    reservedFrom: window.reservedFrom,
    reservedUntil: window.reservedUntil,
    timing: window.timing,
  };
}

export async function checkBookingItemAvailabilityAction(
  formData: FormData,
) {
  const supabase = await createClient();

  // Safety net only. If cleanup fails, availability still continues.
  await cleanupExpiredCustomerCheckoutHoldsBestEffort(
    supabase as any,
    25,
  );

  return checkBookingItemAvailabilityCore(
    supabase,
    formData,
  );
}

export async function checkPublicBookingItemAvailabilityAction(
  formData: FormData,
) {
  const supabase = createServiceClient();

  // Opportunistic integrity repair before calculating availability.
  // Only expired customer_self_service unpaid holds are eligible.
  // Admin-created bookings can never match the cleanup RPC filter.
  await cleanupExpiredCustomerCheckoutHoldsBestEffort(
    supabase as any,
    25,
  );

  const safeFormData = new FormData();

  safeFormData.set(
    "productId",
    String(formData.get("productId") || "").trim(),
  );

  safeFormData.set(
    "quantity",
    "1",
  );

  safeFormData.set(
    "eventDate",
    String(formData.get("eventDate") || "").trim(),
  );

  safeFormData.set(
    "eventStartTime",
    String(formData.get("eventStartTime") || "").trim(),
  );

  safeFormData.set(
    "eventEndTime",
    String(formData.get("eventEndTime") || "").trim(),
  );

  safeFormData.set(
    "bookingActor",
    "customer",
  );

  safeFormData.set(
    "modifierCount",
    "0",
  );

  const result =
    await checkBookingItemAvailabilityCore(
      supabase,
      safeFormData,
    );

  if (!result?.available) {
    console.info(
      "[public-availability] unavailable",
      {
        productId:
          String(formData.get("productId") || ""),
        eventDate:
          String(formData.get("eventDate") || ""),
        eventStartTime:
          String(formData.get("eventStartTime") || ""),
        eventEndTime:
          String(formData.get("eventEndTime") || ""),
        internalMessage:
          result?.message || null,
        missingComponents:
          Array.isArray(result?.missingComponents)
            ? result.missingComponents.map((item: any) => ({
                componentName: item?.componentName || null,
                inventoryItemName: item?.inventoryItemName || null,
                quantityNeeded: item?.quantityNeeded ?? null,
                quantityAvailable: item?.quantityAvailable ?? null,
                reason: item?.reason || null,
              }))
            : [],
      },
    );
  }

  return {
    available:
      Boolean(result?.available),
    message:
      result?.available
        ? "Available for the selected date and time."
        : "Not available for the selected date and time.",
  };
}

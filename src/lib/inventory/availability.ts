import { createClient } from "@/lib/supabase/server";

type AvailabilityInput = {
  productId: string;
  quantity?: number;
  reservedFrom: string;
  reservedUntil: string;
  includeOptional?: boolean;
};

type ComponentAvailability = {
  componentId: string;
  componentName: string;
  inventoryItemId: string;
  inventoryItemName: string;
  trackingType: string;
  quantityRequired: number;
  quantityNeeded: number;
  quantityAvailable: number;
  available: boolean;
  isRequired: boolean;
  role: string;
  inventoryBehavior?: "reusable" | "consumable";
  availableUnitIds: string[];
  reason?: string;
};

type ProductAvailabilityResult = {
  productId: string;
  quantity: number;
  reservedFrom: string;
  reservedUntil: string;
  available: boolean;
  components: ComponentAvailability[];
  missingComponents: ComponentAvailability[];
};

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function toNumber(value: any, fallback = 0) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function overlapsReservationQuery(query: any, reservedFrom: string, reservedUntil: string) {
  return query
    .lt("reserved_from", reservedUntil)
    .gt("reserved_until", reservedFrom)
    .is("returned_at", null);
}

export async function checkProductInventoryAvailability({
  productId,
  quantity = 1,
  reservedFrom,
  reservedUntil,
  includeOptional = false,
}: AvailabilityInput): Promise<ProductAvailabilityResult> {
  const supabase = await createClient();

  if (!productId) {
    throw new Error("Missing product id.");
  }

  if (!reservedFrom || !reservedUntil) {
    throw new Error("Missing reservation window.");
  }

  const bookingQuantity = Math.max(1, toNumber(quantity, 1));

  const { data: components, error: componentsError } = await supabase
    .from("product_inventory_components")
    .select(
      `
      id,
      component_name,
      component_role,
      quantity_required,
      is_required,
      allow_substitution,
      inventory_behavior,
      active,
      inventory_item_id,
      inventory_items (
        id,
        name,
        sku,
        tracking_type,
        quantity_on_hand,
        quantity_available,
        active
      )
    `
    )
    .eq("product_id", productId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (componentsError) {
    throw new Error(componentsError.message);
  }

  const selectedComponents = (components || []).filter((component: any) => {
    if (includeOptional) return true;
    return component.is_required === true;
  });

  const checkedComponents: ComponentAvailability[] = [];

  for (const component of selectedComponents as any[]) {
    const inventoryItem = getOne(component.inventory_items);

    if (!inventoryItem || inventoryItem.active === false) {
      const missingComponent: ComponentAvailability = {
        componentId: component.id,
        componentName: component.component_name || "Missing inventory item",
        inventoryItemId: component.inventory_item_id,
        inventoryItemName: "Missing inventory item",
        trackingType: "unknown",
        quantityRequired: toNumber(component.quantity_required, 1),
        quantityNeeded: toNumber(component.quantity_required, 1) * bookingQuantity,
        quantityAvailable: 0,
        available: false,
        isRequired: component.is_required,
        role: component.component_role || "required",
        inventoryBehavior: component.inventory_behavior === "consumable" ? "consumable" : "reusable",
        availableUnitIds: [],
        reason: "Inventory item is missing or inactive.",
      };

      checkedComponents.push(missingComponent);
      continue;
    }

    const trackingType = inventoryItem.tracking_type || "serialized";
    const quantityRequired = toNumber(component.quantity_required, 1);
    const quantityNeeded = quantityRequired * bookingQuantity;

    if (trackingType === "quantity" || trackingType === "consumable") {
      const totalOnHand = toNumber(inventoryItem.quantity_on_hand, 0);

      const overlappingReservationsQuery = supabase
        .from("inventory_reservations")
        .select("quantity")
        .eq("inventory_item_id", inventoryItem.id)
        .is("inventory_unit_id", null);

      const { data: overlappingReservations, error: reservationsError } =
        await overlapsReservationQuery(
          overlappingReservationsQuery,
          reservedFrom,
          reservedUntil
        );

      if (reservationsError) {
        throw new Error(reservationsError.message);
      }

      const reservedQuantity = (overlappingReservations || []).reduce(
        (sum: number, reservation: any) =>
          sum + toNumber(reservation.quantity, 0),
        0
      );

      const availableQuantity = Math.max(0, totalOnHand - reservedQuantity);
      const isAvailable = availableQuantity >= quantityNeeded;

      checkedComponents.push({
        componentId: component.id,
        componentName: component.component_name || inventoryItem.name,
        inventoryItemId: inventoryItem.id,
        inventoryItemName: inventoryItem.name,
        trackingType,
        quantityRequired,
        quantityNeeded,
        quantityAvailable: availableQuantity,
        available: isAvailable,
        isRequired: component.is_required,
        role: component.component_role || "required",
        inventoryBehavior: component.inventory_behavior === "consumable" ? "consumable" : "reusable",
        availableUnitIds: [],
        reason: isAvailable
          ? undefined
          : `Not enough quantity. Need ${quantityNeeded}, available ${availableQuantity}.`,
      });

      continue;
    }

    const { data: units, error: unitsError } = await supabase
      .from("inventory_units")
      .select("id, status")
      .eq("inventory_item_id", inventoryItem.id)
      .not("status", "in", '("lost","retired","damaged","maintenance","cleaning")');

    if (unitsError) {
      throw new Error(unitsError.message);
    }

    const unitIds = (units || []).map((unit: any) => unit.id);

    if (unitIds.length === 0) {
      checkedComponents.push({
        componentId: component.id,
        componentName: component.component_name || inventoryItem.name,
        inventoryItemId: inventoryItem.id,
        inventoryItemName: inventoryItem.name,
        trackingType,
        quantityRequired,
        quantityNeeded,
        quantityAvailable: 0,
        available: false,
        isRequired: component.is_required,
        role: component.component_role || "required",
        inventoryBehavior: component.inventory_behavior === "consumable" ? "consumable" : "reusable",
        availableUnitIds: [],
        reason: "No usable units found.",
      });

      continue;
    }

    const overlappingUnitReservationsQuery = supabase
      .from("inventory_reservations")
      .select("inventory_unit_id")
      .eq("inventory_item_id", inventoryItem.id)
      .not("inventory_unit_id", "is", null)
      .in("inventory_unit_id", unitIds);

    const { data: overlappingUnitReservations, error: overlappingUnitsError } =
      await overlapsReservationQuery(
        overlappingUnitReservationsQuery,
        reservedFrom,
        reservedUntil
      );

    if (overlappingUnitsError) {
      throw new Error(overlappingUnitsError.message);
    }

    const busyUnitIds = new Set(
      (overlappingUnitReservations || [])
        .map((reservation: any) => reservation.inventory_unit_id)
        .filter(Boolean)
    );

    const availableUnitIds = unitIds.filter((unitId: string) => !busyUnitIds.has(unitId));
    const isAvailable = availableUnitIds.length >= quantityNeeded;

    checkedComponents.push({
      componentId: component.id,
      componentName: component.component_name || inventoryItem.name,
      inventoryItemId: inventoryItem.id,
      inventoryItemName: inventoryItem.name,
      trackingType,
      quantityRequired,
      quantityNeeded,
      quantityAvailable: availableUnitIds.length,
      available: isAvailable,
      isRequired: component.is_required,
      role: component.component_role || "required",
      inventoryBehavior: component.inventory_behavior === "consumable" ? "consumable" : "reusable",
      availableUnitIds: availableUnitIds.slice(0, quantityNeeded),
      reason: isAvailable
        ? undefined
        : `Not enough units. Need ${quantityNeeded}, available ${availableUnitIds.length}.`,
    });
  }

  const missingComponents = checkedComponents.filter(
    (component) => component.isRequired && !component.available
  );

  return {
    productId,
    quantity: bookingQuantity,
    reservedFrom,
    reservedUntil,
    available: missingComponents.length === 0,
    components: checkedComponents,
    missingComponents,
  };
}

export async function checkManyProductsInventoryAvailability({
  items,
  reservedFrom,
  reservedUntil,
}: {
  items: {
    productId: string;
    quantity?: number;
  }[];
  reservedFrom: string;
  reservedUntil: string;
}) {
  const results = [];

  for (const item of items) {
    const result = await checkProductInventoryAvailability({
      productId: item.productId,
      quantity: item.quantity || 1,
      reservedFrom,
      reservedUntil,
    });

    results.push(result);
  }

  const unavailableProducts = results.filter((result) => !result.available);

  return {
    available: unavailableProducts.length === 0,
    results,
    unavailableProducts,
  };
}
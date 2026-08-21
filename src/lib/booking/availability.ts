import type {
  AvailabilityCheckInput,
  AvailabilityComponentResult,
  AvailabilityResult,
  InventoryRecipeForAvailability,
  InventoryReservationForAvailability,
  InventoryUnitForAvailability,
  ProductForAvailability,
} from "@/types/availability";

const ACTIVE_RESERVATION_STATUSES = new Set([
  "reserved",
  "picked",
  "loaded",
  "delivered",
  "installed",
]);

const BLOCKED_UNIT_STATUSES = new Set([
  "lost",
  "retired",
  "damaged",
  "maintenance",
  "cleaning",
  "unavailable",
]);

function isUsableUnitStatus(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return !BLOCKED_UNIT_STATUSES.has(normalized);
}

/**
 * Checks if two datetime ranges overlap.
 *
 * Example:
 * A: 2026-07-18 07:00 → 2026-07-19 07:00
 * B: 2026-07-18 10:00 → 2026-07-18 20:00
 * Result: overlap = true
 */
function dateRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();

  return aStart < bEnd && bStart < aEnd;
}

/**
 * Finds reservations for the same inventory item that overlap
 * with the requested rental window.
 */
function getOverlappingReservations(params: {
  reservations: InventoryReservationForAvailability[];
  inventoryItemId: string;
  reservedFrom: string;
  reservedUntil: string;
}): InventoryReservationForAvailability[] {
  return params.reservations.filter((reservation) => {
    if (reservation.inventory_item_id !== params.inventoryItemId) {
      return false;
    }

    if (!ACTIVE_RESERVATION_STATUSES.has(reservation.status)) {
      return false;
    }

    return dateRangesOverlap(
      params.reservedFrom,
      params.reservedUntil,
      reservation.reserved_from,
      reservation.reserved_until
    );
  });
}

/**
 * For serialized inventory:
 * White Castle #1
 * Blower #3
 * Tarp #2
 *
 * We check which physical units are available and not reserved.
 */
function getAvailableSerializedUnits(params: {
  units: InventoryUnitForAvailability[];
  reservations: InventoryReservationForAvailability[];
  inventoryItemId: string;
  reservedFrom: string;
  reservedUntil: string;
}): InventoryUnitForAvailability[] {
  const overlappingReservations = getOverlappingReservations({
    reservations: params.reservations,
    inventoryItemId: params.inventoryItemId,
    reservedFrom: params.reservedFrom,
    reservedUntil: params.reservedUntil,
  });

  const reservedUnitIds = new Set(
    overlappingReservations
      .map((reservation) => reservation.inventory_unit_id)
      .filter(Boolean)
  );

  return params.units.filter((unit) => {
    if (unit.inventory_item_id !== params.inventoryItemId) {
      return false;
    }

    if (!isUsableUnitStatus(unit.status)) {
      return false;
    }

    return !reservedUnitIds.has(unit.id);
  });
}

/**
 * For quantity inventory:
 * balls, stakes, sandbags, etc.
 *
 * Example:
 * Total white balls: 5000
 * Already reserved: 3000
 * Available: 2000
 */
function getAvailableQuantity(params: {
  totalQuantity: number;
  quantityOnHand?: number;
  quantityAvailable?: number;
  reservations: InventoryReservationForAvailability[];
  inventoryItemId: string;
  reservedFrom: string;
  reservedUntil: string;
}): number {
  const overlappingReservations = getOverlappingReservations({
    reservations: params.reservations,
    inventoryItemId: params.inventoryItemId,
    reservedFrom: params.reservedFrom,
    reservedUntil: params.reservedUntil,
  });

  const reservedQuantity = overlappingReservations.reduce((sum, reservation) => {
    return sum + Number(reservation.quantity || 0);
  }, 0);

  const quantityAvailable = Number(params.quantityAvailable || 0);
  const quantityOnHand = Number(params.quantityOnHand || 0);
  const totalQuantity = Number(params.totalQuantity || 0);

  const baselineQuantity = [quantityAvailable, quantityOnHand, totalQuantity]
    .filter((value) => Number.isFinite(value))
    .reduce((maxValue, value) => Math.max(maxValue, value), 0);

  return Math.max(baselineQuantity - reservedQuantity, 0);
}

/**
 * Checks one recipe component:
 *
 * Product White Castle requires:
 * - 1 castle unit
 * - 1 blower
 * - 1 tarp
 * - 2 cords
 * - 6 stakes OR 6 sandbags
 */
function checkRecipeComponent(params: {
  recipe: InventoryRecipeForAvailability;
  quantity: number;
  units: InventoryUnitForAvailability[];
  reservations: InventoryReservationForAvailability[];
  reservedFrom: string;
  reservedUntil: string;
}): AvailabilityComponentResult {
  const item = params.recipe.inventory_items;

  const requiredQuantity =
    Number(params.recipe.quantity_required || 0) * params.quantity;

  if (!item) {
    return {
      inventoryItemId: params.recipe.inventory_item_id,
      inventoryItemName: "Unknown inventory item",
      trackingType: "quantity",
      requiredQuantity,
      availableQuantity: 0,
      available: false,
      alternativeGroup: params.recipe.alternative_group,
      requirementType: params.recipe.requirement_type,
      missingQuantity: requiredQuantity,
    };
  }

  if (!item.active) {
    return {
      inventoryItemId: item.id,
      inventoryItemName: item.name,
      trackingType: item.tracking_type,
      requiredQuantity,
      availableQuantity: 0,
      available: false,
      alternativeGroup: params.recipe.alternative_group,
      requirementType: params.recipe.requirement_type,
      missingQuantity: requiredQuantity,
    };
  }

  if (item.tracking_type === "serialized" || item.tracking_type === "kit") {
    const availableUnits = getAvailableSerializedUnits({
      units: params.units,
      reservations: params.reservations,
      inventoryItemId: item.id,
      reservedFrom: params.reservedFrom,
      reservedUntil: params.reservedUntil,
    });

    const availableQuantity = availableUnits.length;
    const available = availableQuantity >= requiredQuantity;

    return {
      inventoryItemId: item.id,
      inventoryItemName: item.name,
      trackingType: item.tracking_type,
      requiredQuantity,
      availableQuantity,
      available,
      alternativeGroup: params.recipe.alternative_group,
      requirementType: params.recipe.requirement_type,
      availableUnitIds: availableUnits.map((unit) => unit.id),
      missingQuantity: available
        ? 0
        : Math.max(requiredQuantity - availableQuantity, 0),
    };
  }

  const availableQuantity = getAvailableQuantity({
    totalQuantity: Number(item.total_quantity || 0),
    quantityOnHand: Number((item as any).quantity_on_hand || 0),
    quantityAvailable: Number((item as any).quantity_available || 0),
    reservations: params.reservations,
    inventoryItemId: item.id,
    reservedFrom: params.reservedFrom,
    reservedUntil: params.reservedUntil,
  });

  const available = availableQuantity >= requiredQuantity;

  return {
    inventoryItemId: item.id,
    inventoryItemName: item.name,
    trackingType: item.tracking_type,
    requiredQuantity,
    availableQuantity,
    available,
    alternativeGroup: params.recipe.alternative_group,
    requirementType: params.recipe.requirement_type,
    missingQuantity: available
      ? 0
      : Math.max(requiredQuantity - availableQuantity, 0),
  };
}

/**
 * Groups recipes that are alternatives.
 *
 * Example:
 * alternative_group = "anchoring"
 *
 * Option 1: 6 stakes
 * Option 2: 6 sandbags
 *
 * Product is available if at least one option is available.
 */
function groupRecipesByAlternativeGroup(
  recipes: InventoryRecipeForAvailability[]
): Map<string, InventoryRecipeForAvailability[]> {
  const map = new Map<string, InventoryRecipeForAvailability[]>();

  for (const recipe of recipes) {
    if (!recipe.alternative_group) {
      continue;
    }

    const key = recipe.modifier_id
      ? `${recipe.modifier_id}::${recipe.alternative_group}`
      : recipe.alternative_group;

    const existing = map.get(key) || [];
    existing.push(recipe);
    map.set(key, existing);
  }

  return map;
}

/**
 * Calculates maximum available product quantity based on all required components.
 *
 * Example:
 * Castles available: 4
 * Blowers available: 2
 * Tarps available: 6
 *
 * Product available quantity = 2
 */
function calculateAvailableQuantity(params: {
  components: AvailabilityComponentResult[];
  requestedQuantity: number;
}): number {
  const relevantComponents = params.components.filter((component) => {
    if (component.requirementType === "optional") {
      return false;
    }

    if (component.alternativeGroup) {
      return false;
    }

    return component.requiredQuantity > 0;
  });

  if (relevantComponents.length === 0) {
    return 0;
  }

  const quantities = relevantComponents.map((component) => {
    const perOneProduct =
      component.requiredQuantity / Math.max(params.requestedQuantity, 1);

    if (perOneProduct <= 0) {
      return 0;
    }

    return Math.floor(component.availableQuantity / perOneProduct);
  });

  return Math.max(Math.min(...quantities), 0);
}

/**
 * Checks one product availability.
 */
export function checkProductAvailability(params: {
  product: ProductForAvailability;
  input: AvailabilityCheckInput;
  recipes: InventoryRecipeForAvailability[];
  units: InventoryUnitForAvailability[];
  reservations: InventoryReservationForAvailability[];
  selectedModifierQuantitiesByModifierId?: Record<string, number>;
}): AvailabilityResult {
  const {
    product,
    input,
    recipes,
    units,
    reservations,
    selectedModifierQuantitiesByModifierId = {},
  } = params;

  if (!product.active) {
    return {
      productId: product.id,
      productName: product.name,
      status: "unavailable",
      availableQuantity: 0,
      reason: "product_not_active",
      missingComponents: [],
      components: [],
      warnings: ["Product is not active."],
    };
  }

  const productRecipes = recipes.filter((recipe) => {
    if (recipe.product_id !== product.id) {
      return false;
    }

    if (!recipe.modifier_id) {
      return true;
    }

    const modifierQty = Math.max(
      0,
      Math.floor(
        Number(
          selectedModifierQuantitiesByModifierId[String(recipe.modifier_id)] || 0
        )
      )
    );

    return modifierQty > 0;
  });

  if (productRecipes.length === 0) {
    return {
      productId: product.id,
      productName: product.name,
      status: "unavailable",
      availableQuantity: 0,
      reason: "no_recipe",
      missingComponents: [],
      components: [],
      warnings: ["No inventory recipe found for this product."],
    };
  }

  const normalRecipes = productRecipes.filter((recipe) => {
    return !recipe.alternative_group;
  });

  const alternativeGroups = groupRecipesByAlternativeGroup(productRecipes);

  const checkedNormalComponents = normalRecipes.map((recipe) =>
    checkRecipeComponent({
      recipe,
      quantity:
        input.quantity *
        (recipe.modifier_id
          ? Math.max(
              1,
              Math.floor(
                Number(
                  selectedModifierQuantitiesByModifierId[String(recipe.modifier_id)] ||
                    1
                )
              )
            )
          : 1),
      units,
      reservations,
      reservedFrom: input.reservedFrom,
      reservedUntil: input.reservedUntil,
    })
  );

  const missingNormalComponents = checkedNormalComponents.filter((component) => {
    if (component.requirementType === "optional") {
      return false;
    }

    return !component.available;
  });

  const alternativeComponents: AvailabilityComponentResult[] = [];
  const missingAlternativeGroups: AvailabilityComponentResult[] = [];

  for (const [, groupRecipes] of alternativeGroups.entries()) {
    const checkedGroup = groupRecipes.map((recipe) =>
      checkRecipeComponent({
        recipe,
        quantity:
          input.quantity *
          (recipe.modifier_id
            ? Math.max(
                1,
                Math.floor(
                  Number(
                    selectedModifierQuantitiesByModifierId[String(recipe.modifier_id)] ||
                      1
                  )
                )
              )
            : 1),
        units,
        reservations,
        reservedFrom: input.reservedFrom,
        reservedUntil: input.reservedUntil,
      })
    );

    alternativeComponents.push(...checkedGroup);

    const hasAtLeastOneAvailableOption = checkedGroup.some(
      (component) => component.available
    );

    if (!hasAtLeastOneAvailableOption) {
      missingAlternativeGroups.push(...checkedGroup);
    }
  }

  const allComponents = [...checkedNormalComponents, ...alternativeComponents];

  const allMissingComponents = [
    ...missingNormalComponents,
    ...missingAlternativeGroups,
  ];

  const availableQuantity = calculateAvailableQuantity({
    components: allComponents,
    requestedQuantity: input.quantity,
  });

  if (allMissingComponents.length > 0) {
    return {
      productId: product.id,
      productName: product.name,
      status: "unavailable",
      availableQuantity,
      reason:
        missingAlternativeGroups.length > 0
          ? "missing_alternative_group"
          : "missing_components",
      missingComponents: allMissingComponents,
      components: allComponents,
      warnings: [],
    };
  }

  const warnings: string[] = [];

  if (availableQuantity <= input.quantity) {
    warnings.push("Limited quantity available for this date/time.");
  }

  return {
    productId: product.id,
    productName: product.name,
    status: warnings.length > 0 ? "limited" : "available",
    availableQuantity,
    reason: "available",
    missingComponents: [],
    components: allComponents,
    warnings,
  };
}

/**
 * Checks all products for selected date/time.
 */
export function checkProductsAvailability(params: {
  products: ProductForAvailability[];
  input: Omit<AvailabilityCheckInput, "productId">;
  recipes: InventoryRecipeForAvailability[];
  units: InventoryUnitForAvailability[];
  reservations: InventoryReservationForAvailability[];
}): AvailabilityResult[] {
  return params.products.map((product) => {
    return checkProductAvailability({
      product,
      input: {
        productId: product.id,
        quantity: params.input.quantity,
        reservedFrom: params.input.reservedFrom,
        reservedUntil: params.input.reservedUntil,
      },
      recipes: params.recipes,
      units: params.units,
      reservations: params.reservations,
    });
  });
}
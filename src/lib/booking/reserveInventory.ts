import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InventoryRecipeForAvailability,
  InventoryReservationForAvailability,
  InventoryUnitForAvailability,
} from "@/types/availability";

const ACTIVE_RESERVATION_STATUSES = [
  "reserved",
  "picked",
  "loaded",
  "delivered",
  "installed",
];

const AVAILABLE_UNIT_STATUSES = ["available", "returned"];

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

function getOverlappingReservations(params: {
  reservations: InventoryReservationForAvailability[];
  inventoryItemId: string;
  reservedFrom: string;
  reservedUntil: string;
}) {
  return params.reservations.filter((reservation) => {
    if (reservation.inventory_item_id !== params.inventoryItemId) {
      return false;
    }

    if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) {
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

function pickSerializedUnits(params: {
  inventoryItemId: string;
  quantityRequired: number;
  units: InventoryUnitForAvailability[];
  reservations: InventoryReservationForAvailability[];
  reservedFrom: string;
  reservedUntil: string;
}) {
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

  const availableUnits = params.units.filter((unit) => {
    if (unit.inventory_item_id !== params.inventoryItemId) {
      return false;
    }

    if (!AVAILABLE_UNIT_STATUSES.includes(unit.status)) {
      return false;
    }

    return !reservedUnitIds.has(unit.id);
  });

  if (availableUnits.length < params.quantityRequired) {
    throw new Error(
      `Not enough serialized units for inventory item ${params.inventoryItemId}. Required: ${params.quantityRequired}, available: ${availableUnits.length}`
    );
  }

  return availableUnits.slice(0, params.quantityRequired);
}

function getAvailableQuantity(params: {
  inventoryItemId: string;
  totalQuantity: number;
  quantityOnHand?: number;
  quantityAvailable?: number;
  reservations: InventoryReservationForAvailability[];
  reservedFrom: string;
  reservedUntil: string;
}) {
  const overlappingReservations = getOverlappingReservations({
    reservations: params.reservations,
    inventoryItemId: params.inventoryItemId,
    reservedFrom: params.reservedFrom,
    reservedUntil: params.reservedUntil,
  });

  const reservedQuantity = overlappingReservations.reduce((sum, reservation) => {
    return sum + Number(reservation.quantity || 0);
  }, 0);

  const baselineQuantity = [
    Number(params.totalQuantity || 0),
    Number(params.quantityOnHand || 0),
    Number(params.quantityAvailable || 0),
  ]
    .filter((value) => Number.isFinite(value))
    .reduce((maxValue, value) => Math.max(maxValue, value), 0);

  return Math.max(baselineQuantity - reservedQuantity, 0);
}

function getRequirementType(recipe: any) {
  return String(recipe?.requirement_type || "")
    .trim()
    .toLowerCase();
}

function isOptionalRecipe(recipe: any) {
  return recipe?.is_optional === true || getRequirementType(recipe) === "optional";
}

function getAlternativeGroupKey(recipe: any) {
  const explicitGroup = String(recipe?.alternative_group || "").trim();
  if (explicitGroup) {
    return explicitGroup;
  }

  if (getRequirementType(recipe) === "alternative") {
    const modifierPart = String(recipe?.modifier_id || "product");
    return `implicit:${modifierPart}`;
  }

  return "";
}

async function getRecipes(params: {
  supabase: SupabaseClient;
  productId: string;
  modifierIds: string[];
}) {
  const { supabase, productId, modifierIds } = params;

  const productResult = await supabase
    .from("products")
    .select("id, inventory_item_id")
    .eq("id", productId)
    .maybeSingle();

  if (productResult.error) {
    throw new Error(productResult.error.message);
  }

  const productInventoryItemId = String(productResult.data?.inventory_item_id || "").trim();

  const productComponentsResult = await supabase
    .from("product_inventory_components")
    .select(
      `
      id,
      inventory_item_id,
      inventory_behavior,
      quantity,
      required,
      inventory_items (
        id,
        name,
        tracking_type,
        total_quantity,
        quantity_on_hand,
        quantity_available,
        active
      )
    `
    )
    .eq("product_id", productId);

  if (productComponentsResult.error) {
    throw new Error(productComponentsResult.error.message);
  }

  const componentItemIds = new Set(
    (productComponentsResult.data || [])
      .map((row: any) => String(row.inventory_item_id || ""))
      .filter(Boolean)
  );
  const productRecipesResult = await supabase
    .from("inventory_recipes")
    .select(
      `
      id,
      product_id,
      modifier_id,
      inventory_item_id,
      inventory_behavior,
      quantity_required,
      requirement_type,
      alternative_group,
      is_optional,
      inventory_items (
        id,
        name,
        tracking_type,
        total_quantity,
        quantity_on_hand,
        quantity_available,
        active
      )
    `
    )
    .eq("product_id", productId)
    .is("modifier_id", null);

  if (productRecipesResult.error) {
    throw new Error(productRecipesResult.error.message);
  }

  let modifierRecipes: InventoryRecipeForAvailability[] = [];

  if (modifierIds.length > 0) {
    const modifierRecipesResult = await supabase
      .from("inventory_recipes")
      .select(
        `
        id,
        product_id,
        modifier_id,
        inventory_item_id,
        inventory_behavior,
        quantity_required,
        requirement_type,
        alternative_group,
        is_optional,
        inventory_items (
          id,
          name,
          tracking_type,
          total_quantity,
          quantity_on_hand,
          quantity_available,
          active
        )
      `
      )
      .in("modifier_id", modifierIds);

    if (modifierRecipesResult.error) {
      throw new Error(modifierRecipesResult.error.message);
    }

    modifierRecipes = (modifierRecipesResult.data ||
      []) as unknown as InventoryRecipeForAvailability[];
  }

  const productRecipesRaw = (productRecipesResult.data ||
    []) as unknown as InventoryRecipeForAvailability[];

  let resolvedProductRecipes =
    componentItemIds.size > 0
      ? productRecipesRaw.filter((recipe: any) =>
          componentItemIds.has(String(recipe.inventory_item_id || ""))
        )
      : [];

  // Some workspaces still use product_inventory_components as the source of truth
  // without mirrored rows in inventory_recipes.
  if (resolvedProductRecipes.length === 0 && componentItemIds.size > 0) {
    const fallbackRecipes = (productComponentsResult.data || [])
      .filter((row: any) => String(row.inventory_item_id || "").trim())
      .map((row: any) => {
        const item = Array.isArray(row.inventory_items)
          ? row.inventory_items[0]
          : row.inventory_items;

        return {
          id: `component-${String(row.id || row.inventory_item_id)}`,
          product_id: productId,
          modifier_id: null,
          inventory_item_id: String(row.inventory_item_id),
          quantity_required: Number(row.quantity || 1),
          inventory_behavior: row.inventory_behavior === "consumable" ? "consumable" : "reusable",
          requirement_type: row.required === false ? "optional" : "required",
          alternative_group: null,
          is_optional: row.required === false,
          inventory_items: item,
        } as InventoryRecipeForAvailability;
      });

    resolvedProductRecipes = fallbackRecipes;
  }

  const recipesWithModifiers = [
    ...resolvedProductRecipes,
    ...modifierRecipes,
  ];

  const hasMainProductItem = recipesWithModifiers.some(
    (recipe) =>
      String(recipe.inventory_item_id || "") ===
      productInventoryItemId,
  );

  // Keep reserve logic aligned with UI pre-check:
  // always include the main physical product item when configured.
  if (productInventoryItemId && !hasMainProductItem) {
    const mainInventoryItemResult = await supabase
      .from("inventory_items")
      .select(
        `
        id,
        name,
        tracking_type,
        total_quantity,
        quantity_on_hand,
        quantity_available,
        active
      `
      )
      .eq("id", productInventoryItemId)
      .maybeSingle();

    if (mainInventoryItemResult.error) {
      throw new Error(mainInventoryItemResult.error.message);
    }

    if (mainInventoryItemResult.data) {
      const mainRecipe: InventoryRecipeForAvailability = {
        id: `main-product-${productId}`,
        product_id: productId,
        modifier_id: null,
        inventory_item_id: productInventoryItemId,
        quantity_required: 1,
        inventory_behavior: "reusable",
        requirement_type: "required",
        alternative_group: null,
        is_optional: false,
        inventory_items: mainInventoryItemResult.data as any,
      };

      return [mainRecipe, ...recipesWithModifiers];
    }
  }

  return recipesWithModifiers;
}

export async function reserveInventoryForBooking(params: {
  supabase: SupabaseClient;
  bookingId: string;
  bookingItemId: string;
  productId: string;
  modifierIds?: string[];
  modifierQuantityMultipliers?: Record<string, number>;
  quantity: number;
  reservedFrom: string;
  reservedUntil: string;
}) {
  const {
    supabase,
    bookingId,
    bookingItemId,
    productId,
    modifierIds = [],
    modifierQuantityMultipliers = {},
    quantity,
    reservedFrom,
    reservedUntil,
  } = params;

  const recipes = await getRecipes({
    supabase,
    productId,
    modifierIds,
  });

  if (recipes.length === 0) {
    throw new Error("No inventory recipe found for this product or modifiers.");
  }

  const unitsResult = await supabase
    .from("inventory_units")
    .select("id, inventory_item_id, unit_code, status");

  if (unitsResult.error) {
    throw new Error(unitsResult.error.message);
  }

  const reservationsResult = await supabase
    .from("inventory_reservations")
    .select(
      `
      id,
      booking_id,
      booking_item_id,
      inventory_item_id,
      inventory_unit_id,
      quantity,
      reserved_from,
      reserved_until,
      status
    `
    )
    .lt("reserved_from", reservedUntil)
    .gt("reserved_until", reservedFrom)
    .in("status", ACTIVE_RESERVATION_STATUSES);

  if (reservationsResult.error) {
    throw new Error(reservationsResult.error.message);
  }

  const units = (unitsResult.data || []) as InventoryUnitForAvailability[];
  const reservations =
    (reservationsResult.data || []) as InventoryReservationForAvailability[];

  const normalRecipes = recipes.filter((recipe) => !recipe.alternative_group);
  const strictNormalRecipes = normalRecipes.filter(
    (recipe) => getRequirementType(recipe) !== "alternative"
  );

  const alternativeGroups = new Map<string, InventoryRecipeForAvailability[]>();

  for (const recipe of recipes) {
    if (isOptionalRecipe(recipe)) {
      continue;
    }

    const groupKeyRaw = getAlternativeGroupKey(recipe);

    if (!groupKeyRaw) {
      continue;
    }

    const groupKey = recipe.modifier_id
      ? `${recipe.modifier_id}::${groupKeyRaw}`
      : groupKeyRaw;

    const group = alternativeGroups.get(groupKey) || [];
    group.push(recipe);
    alternativeGroups.set(groupKey, group);
  }

  const reservationsToInsert: {
    booking_id: string;
    booking_item_id: string;
    inventory_item_id: string;
    inventory_unit_id: string | null;
    quantity: number;
    reserved_from: string;
    reserved_until: string;
    status: "reserved";
    inventory_behavior: "reusable" | "consumable";
    notes?: string;
  }[] = [];

  function addReservationForRecipe(recipe: InventoryRecipeForAvailability) {
    const item = recipe.inventory_items;

    if (!item) {
      throw new Error("Inventory item not found for recipe.");
    }

    if (!item.active) {
      if (isOptionalRecipe(recipe)) {
        return;
      }

      throw new Error(`${item.name} is not active.`);
    }

    const modifierMultiplier = recipe.modifier_id
      ? Math.max(
          1,
          Math.floor(Number(modifierQuantityMultipliers[String(recipe.modifier_id)] || 1))
        )
      : 1;

    const quantityRequired =
      Number(recipe.quantity_required || 0) * quantity * modifierMultiplier;
    const inventoryBehavior = recipe.inventory_behavior === "consumable" ? "consumable" : "reusable";

    if (quantityRequired <= 0) {
      return;
    }

    if (item.tracking_type === "serialized" || item.tracking_type === "kit") {
      const pickedUnits = pickSerializedUnits({
        inventoryItemId: item.id,
        quantityRequired,
        units,
        reservations,
        reservedFrom,
        reservedUntil,
      });

      for (const unit of pickedUnits) {
        reservationsToInsert.push({
          booking_id: bookingId,
          booking_item_id: bookingItemId,
          inventory_item_id: item.id,
          inventory_unit_id: unit.id,
          quantity: 1,
          reserved_from: reservedFrom,
          reserved_until: reservedUntil,
          status: "reserved",
          inventory_behavior: "reusable",
          notes: recipe.modifier_id
            ? `Reserved for modifier ${recipe.modifier_id}`
            : "Reserved for product",
        });

        reservations.push({
          id: `temp-${unit.id}-${reservations.length}`,
          booking_id: bookingId,
          booking_item_id: bookingItemId,
          inventory_item_id: item.id,
          inventory_unit_id: unit.id,
          quantity: 1,
          reserved_from: reservedFrom,
          reserved_until: reservedUntil,
          status: "reserved",
          inventory_behavior: "reusable",
        });
      }

      return;
    }

    const availableQuantity = getAvailableQuantity({
      inventoryItemId: item.id,
      totalQuantity: Number(item.total_quantity || 0),
      quantityOnHand: Number((item as any).quantity_on_hand || 0),
      quantityAvailable: Number((item as any).quantity_available || 0),
      reservations,
      reservedFrom,
      reservedUntil,
    });

    if (availableQuantity < quantityRequired) {
      throw new Error(
        `Not enough ${item.name}. Required: ${quantityRequired}, available: ${availableQuantity}`
      );
    }

    reservationsToInsert.push({
      booking_id: bookingId,
      booking_item_id: bookingItemId,
      inventory_item_id: item.id,
      inventory_unit_id: null,
      quantity: quantityRequired,
      reserved_from: reservedFrom,
      reserved_until: reservedUntil,
      status: "reserved",
      inventory_behavior: inventoryBehavior,
      notes: recipe.modifier_id
        ? `Reserved for modifier ${recipe.modifier_id}`
        : "Reserved for product",
    });

    reservations.push({
      id: `temp-${item.id}-${reservations.length}`,
      booking_id: bookingId,
      booking_item_id: bookingItemId,
      inventory_item_id: item.id,
      inventory_unit_id: null,
      quantity: quantityRequired,
      reserved_from: reservedFrom,
      reserved_until: reservedUntil,
      status: "reserved",
      inventory_behavior: inventoryBehavior,
    });
  }

  for (const recipe of strictNormalRecipes) {
    if (isOptionalRecipe(recipe)) {
      continue;
    }

    addReservationForRecipe(recipe);
  }

  for (const [, groupRecipes] of alternativeGroups.entries()) {
    let selectedRecipe: InventoryRecipeForAvailability | null = null;

    for (const recipe of groupRecipes) {
      try {
        addReservationForRecipe(recipe);
        selectedRecipe = recipe;
        break;
      } catch {
        selectedRecipe = null;
      }
    }

    if (!selectedRecipe) {
      throw new Error(
        `No available option for alternative group: ${groupRecipes[0]?.alternative_group}`
      );
    }
  }

  if (reservationsToInsert.length === 0) {
    throw new Error("No inventory reservations were created.");
  }

  const insertResult = await supabase
    .from("inventory_reservations")
    .insert(reservationsToInsert)
    .select();

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }

  await supabase
    .from("bookings")
    .update({
      status: "inventory_reserved",
    })
    .eq("id", bookingId);

  return insertResult.data;
}
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InventoryRecipeForAvailability,
  InventoryReservationForAvailability,
  InventoryUnitForAvailability,
  ProductForAvailability,
} from "@/types/availability";

export interface AvailabilityData {
  products: ProductForAvailability[];
  recipes: InventoryRecipeForAvailability[];
  units: InventoryUnitForAvailability[];
  reservations: InventoryReservationForAvailability[];
}

export async function getAvailabilityData(params: {
  supabase: SupabaseClient;
  reservedFrom: string;
  reservedUntil: string;
}): Promise<AvailabilityData> {
  const { supabase, reservedFrom, reservedUntil } = params;

  const [productsResult, recipesResult, componentsResult, unitsResult, reservationsResult] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, active, inventory_item_id")
        .eq("active", true)
        .order("sort_order", { ascending: true }),

      supabase
        .from("inventory_recipes")
        .select(
          `
          id,
          product_id,
          modifier_id,
          inventory_item_id,
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
        ),

      supabase
        .from("product_inventory_components")
        .select(
          `
          *,
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
        .order("sort_order", { ascending: true }),

      supabase
        .from("inventory_units")
        .select("id, inventory_item_id, unit_code, status"),

      supabase
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
        .in("status", ["reserved", "picked", "loaded", "delivered", "installed"]),
    ]);

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  if (recipesResult.error) {
    throw new Error(recipesResult.error.message);
  }

  if (componentsResult.error) {
    throw new Error(componentsResult.error.message);
  }

  if (unitsResult.error) {
    throw new Error(unitsResult.error.message);
  }

  if (reservationsResult.error) {
    throw new Error(reservationsResult.error.message);
  }

  let products = (productsResult.data || []) as ProductForAvailability[];
  let productRows = (productsResult.data || []) as any[];

  if (products.length === 0) {
    const fallbackProductsResult = await supabase
      .from("products")
      .select("id, name, active, inventory_item_id")
      .order("sort_order", { ascending: true });

    if (fallbackProductsResult.error) {
      throw new Error(fallbackProductsResult.error.message);
    }

    productRows = (fallbackProductsResult.data || []) as any[];
    products = (fallbackProductsResult.data || []) as ProductForAvailability[];
  }

  const mappedComponentRecipes = (componentsResult.data || [])
    .filter((component: any) => component?.inventory_item_id)
    .filter((component: any) => component?.active !== false)
    .map((component: any) => {
      const requiredFlag =
        component.is_required === false || component.required === false ? false : true;

      return {
        id: String(component.id || `${component.product_id}-${component.inventory_item_id}`),
        product_id: String(component.product_id || ""),
        modifier_id: component.modifier_id ? String(component.modifier_id) : null,
        inventory_item_id: String(component.inventory_item_id),
        quantity_required: Number(component.quantity_required ?? component.quantity ?? 1) || 1,
        requirement_type: String(component.requirement_type || (requiredFlag ? "required" : "optional")),
        alternative_group: component.alternative_group ? String(component.alternative_group) : null,
        is_optional: component.is_optional === true || !requiredFlag,
        inventory_items: Array.isArray(component.inventory_items)
          ? component.inventory_items[0]
          : component.inventory_items,
      } as InventoryRecipeForAvailability;
    })
    .filter((recipe) => Boolean(recipe.product_id));

  const componentItemIdsByProduct = new Map<string, Set<string>>();
  const hasActiveComponentsByProduct = new Set<string>();

  for (const recipe of mappedComponentRecipes) {
    const productId = String(recipe.product_id || "");
    const inventoryItemId = String(recipe.inventory_item_id || "");

    if (!productId || !inventoryItemId) {
      continue;
    }

    hasActiveComponentsByProduct.add(productId);

    const existing = componentItemIdsByProduct.get(productId) || new Set<string>();
    existing.add(inventoryItemId);
    componentItemIdsByProduct.set(productId, existing);
  }

  const missingMainInventoryItemIds = Array.from(
    new Set(
      productRows
        .map((product: any) => {
          const productId = String(product?.id || "");
          const mainInventoryItemId = String(product?.inventory_item_id || "");

          if (!productId || !mainInventoryItemId) {
            return "";
          }

          if (hasActiveComponentsByProduct.has(productId)) {
            return "";
          }

          const componentItemIds = componentItemIdsByProduct.get(productId);

          if (componentItemIds?.has(mainInventoryItemId)) {
            return "";
          }

          return mainInventoryItemId;
        })
        .filter(Boolean)
    )
  );

  let mainInventoryItemsById = new Map<string, any>();

  if (missingMainInventoryItemIds.length > 0) {
    const mainInventoryItemsResult = await supabase
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
      .in("id", missingMainInventoryItemIds);

    if (mainInventoryItemsResult.error) {
      throw new Error(mainInventoryItemsResult.error.message);
    }

    mainInventoryItemsById = new Map(
      (mainInventoryItemsResult.data || []).map((item: any) => [String(item.id), item])
    );
  }

  const mainProductRecipes = productRows
    .map((product: any) => {
      const productId = String(product?.id || "");
      const mainInventoryItemId = String(product?.inventory_item_id || "");

      if (!productId || !mainInventoryItemId) {
        return null;
      }

      if (hasActiveComponentsByProduct.has(productId)) {
        return null;
      }

      const componentItemIds = componentItemIdsByProduct.get(productId);

      if (componentItemIds?.has(mainInventoryItemId)) {
        return null;
      }

      const inventoryItem = mainInventoryItemsById.get(mainInventoryItemId);

      if (!inventoryItem) {
        return null;
      }

      return {
        id: `main-product-${productId}`,
        product_id: productId,
        modifier_id: null,
        inventory_item_id: mainInventoryItemId,
        quantity_required: 1,
        requirement_type: "required",
        alternative_group: null,
        is_optional: false,
        inventory_items: inventoryItem,
      } as InventoryRecipeForAvailability;
    })
    .filter(Boolean) as InventoryRecipeForAvailability[];

  const recipes = mappedComponentRecipes.length > 0 || mainProductRecipes.length > 0
    ? [...mainProductRecipes, ...mappedComponentRecipes]
    : ((recipesResult.data || []) as unknown as InventoryRecipeForAvailability[]);

  return {
    products,
    recipes,
    units: (unitsResult.data || []) as InventoryUnitForAvailability[],
    reservations:
      (reservationsResult.data || []) as InventoryReservationForAvailability[],
  };
}
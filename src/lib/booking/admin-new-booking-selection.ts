import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAdminNewBookingBootstrap } from "@/lib/booking/admin-new-booking-bootstrap";
import { calculateCanonicalBookingPricing } from "@/lib/booking/canonical-pricing";

export type AdminNewBookingRequestedProduct = {
  productId: string;
  quantity: number;
};

export type AdminNewBookingRequestedModifier = {
  productId: string;
  groupId: string;
  optionId: string;
  quantity: number;
};

export type AdminNewBookingTrustedProductLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type AdminNewBookingTrustedModifierLine = {
  productId: string;
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  quantity: number;
  productQuantity: number;
  unitPrice: number;
  lineTotal: number;
  inventoryItemId: string | null;
  inventoryQuantity: number;
  trackInventory: boolean;
  inventoryBehavior: "reusable" | "consumable";
};

function moneyNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function positiveInteger(value: unknown, fallback = 1) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export async function prepareAdminNewBookingSelection(params: {
  supabase: SupabaseClient;
  setupAddress: string;
  setupCity: string;
  setupState: string;
  setupZip: string;
  products: AdminNewBookingRequestedProduct[];
  modifiers: AdminNewBookingRequestedModifier[];
}) {
  const setupAddress = String(params.setupAddress || "").trim();
  const setupCity = String(params.setupCity || "").trim();
  const setupState = String(params.setupState || "CA").trim() || "CA";
  const setupZip = String(params.setupZip || "").trim();

  if (!setupAddress || !setupCity || !setupZip) {
    throw new Error("Setup address, city, and ZIP are required.");
  }

  const requestedProducts = Array.isArray(params.products)
    ? params.products
    : [];

  if (requestedProducts.length === 0) {
    throw new Error("Select at least one product.");
  }

  const requestedModifiers = Array.isArray(params.modifiers)
    ? params.modifiers
    : [];

  const bootstrap = await loadAdminNewBookingBootstrap(params.supabase);

  const productsById = new Map(
    (bootstrap.products || [])
      .filter((product: any) => product.active !== false)
      .map((product: any) => [String(product.id), product]),
  );

  const productQuantityById = new Map<string, number>();

  for (const raw of requestedProducts) {
    const row =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};

    const productId = String(row.productId || "").trim();

    if (!productId) {
      throw new Error("A selected product is missing its ID.");
    }

    if (!productsById.has(productId)) {
      throw new Error(
        "One or more selected products are no longer available.",
      );
    }

    const quantity = Math.min(positiveInteger(row.quantity, 1), 99);

    productQuantityById.set(
      productId,
      (productQuantityById.get(productId) || 0) + quantity,
    );
  }

  const productLines: AdminNewBookingTrustedProductLine[] =
    Array.from(productQuantityById.entries()).map(
      ([productId, quantity]) => {
        const product = productsById.get(productId);

        const unitPrice = moneyNumber(
          product?.base_price ?? product?.price ?? 0,
        );

        return {
          productId,
          name: String(product?.name || "Product").trim() || "Product",
          quantity,
          unitPrice,
          lineTotal: moneyNumber(unitPrice * quantity),
        };
      },
    );

  const productSubtotal = moneyNumber(
    productLines.reduce((sum, line) => sum + line.lineTotal, 0),
  );

  const minimumDeposit = moneyNumber(
    Array.from(productQuantityById.entries()).reduce(
      (sum, [productId, quantity]) => {
        const product = productsById.get(productId);

        return (
          sum +
          moneyNumber(product?.deposit_amount || 0) * quantity
        );
      },
      0,
    ),
  );

  const groups = (bootstrap.modifierGroups || []).filter(
    (group: any) =>
      group.active !== false &&
      productQuantityById.has(String(group.productId)),
  );

  const groupByKey = new Map(
    groups.map((group: any) => [
      `${String(group.productId)}:${String(group.id)}`,
      group,
    ]),
  );

  const selectedByGroup = new Map<
    string,
    Map<string, number>
  >();

  for (const raw of requestedModifiers) {
    const row =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};

    const productId = String(row.productId || "").trim();
    const groupId = String(row.groupId || "").trim();
    const optionId = String(row.optionId || "").trim();

    if (!productQuantityById.has(productId)) {
      throw new Error(
        "A selected option belongs to an unselected product.",
      );
    }

    const groupKey = `${productId}:${groupId}`;
    const group = groupByKey.get(groupKey);

    if (!group) {
      throw new Error(
        "One or more selected option groups are no longer available.",
      );
    }

    const option = (group.options || []).find(
      (item: any) =>
        String(item.id) === optionId &&
        item.active !== false,
    );

    if (!option) {
      throw new Error(
        "One or more selected options are no longer available.",
      );
    }

    const requestedQuantity = positiveInteger(row.quantity, 1);

    const quantity =
      String(group.selectionType || "single") === "single"
        ? 1
        : Math.min(requestedQuantity, 99);

    const selectedOptions =
      selectedByGroup.get(groupKey) ||
      new Map<string, number>();

    selectedOptions.set(
      optionId,
      (selectedOptions.get(optionId) || 0) + quantity,
    );

    selectedByGroup.set(groupKey, selectedOptions);
  }

  for (const group of groups) {
    const productId = String(group.productId);
    const groupId = String(group.id);
    const groupKey = `${productId}:${groupId}`;
    const selected = selectedByGroup.get(groupKey);

    const totalSelected = Array.from(
      selected?.values() || [],
    ).reduce((sum, quantity) => sum + quantity, 0);

    if (group.required === true && totalSelected < 1) {
      throw new Error(
        `Required option group "${String(
          group.name || "Options",
        )}" is incomplete.`,
      );
    }

    if (
      String(group.selectionType || "single") === "single" &&
      totalSelected > 1
    ) {
      throw new Error(
        `Option group "${String(
          group.name || "Options",
        )}" allows only one selection.`,
      );
    }

    const maximum =
      group.maxTotalQuantity == null
        ? null
        : positiveInteger(group.maxTotalQuantity, 1);

    if (maximum != null && totalSelected > maximum) {
      throw new Error(
        `Option group "${String(
          group.name || "Options",
        )}" exceeds its maximum quantity.`,
      );
    }
  }

  const modifierLines: AdminNewBookingTrustedModifierLine[] = [];

  for (const [groupKey, selectedOptions] of selectedByGroup.entries()) {
    const group = groupByKey.get(groupKey);
    if (!group) continue;

    const productId = String(group.productId);
    const productQuantity = productQuantityById.get(productId) || 1;

    for (const [optionId, quantity] of selectedOptions.entries()) {
      const option = (group.options || []).find(
        (item: any) => String(item.id) === optionId,
      );

      if (!option) continue;

      const unitPrice = moneyNumber(option.priceDelta || 0);

      modifierLines.push({
        productId,
        groupId: String(group.id),
        groupName: String(group.name || "Options").trim() || "Options",
        optionId,
        optionName: String(option.name || "Option").trim() || "Option",
        quantity,
        productQuantity,
        unitPrice,
        lineTotal: moneyNumber(
          unitPrice * quantity * productQuantity,
        ),
        inventoryItemId: option.inventoryItemId
          ? String(option.inventoryItemId)
          : null,
        inventoryQuantity: Math.max(
          0,
          Number(option.inventoryQuantity || 1),
        ),
        trackInventory: option.trackInventory !== false,
        inventoryBehavior:
          option.inventoryBehavior === "consumable"
            ? "consumable"
            : "reusable",
      });
    }
  }

  const modifiersSubtotal = moneyNumber(
    modifierLines.reduce((sum, line) => sum + line.lineTotal, 0),
  );

  const subtotal = moneyNumber(productSubtotal + modifiersSubtotal);

  if (subtotal <= 0) {
    throw new Error("Booking subtotal must be greater than zero.");
  }

  const canonical = await calculateCanonicalBookingPricing({
    supabase: params.supabase,
    setupAddress,
    setupCity,
    setupState,
    setupZip,
    subtotal,
    depositAmount: minimumDeposit,
  });

  const publicModifierLines = modifierLines.map(
    ({
      inventoryItemId: _inventoryItemId,
      inventoryQuantity: _inventoryQuantity,
      trackInventory: _trackInventory,
      inventoryBehavior: _inventoryBehavior,
      ...line
    }) => line,
  );

  return {
    pricing: {
      ...canonical,
      products: productLines,
      modifiers: publicModifierLines,
      productSubtotal,
      modifiersSubtotal,
      subtotal,
      minimumDeposit,
    },
    trustedProducts: productLines,
    trustedModifiers: modifierLines,
  };
}

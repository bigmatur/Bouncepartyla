export function getBookingFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function getBookingFormNullableString(formData: FormData, key: string) {
  const value = getBookingFormString(formData, key);
  return value.length > 0 ? value : null;
}

export function getBookingFormNumber(
  formData: FormData,
  key: string,
  fallback = 0,
) {
  const value = getBookingFormString(formData, key);
  if (!value) return fallback;

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getBookingFormBoolean(formData: FormData, key: string) {
  const value = getBookingFormString(formData, key).toLowerCase();
  return value === "true" || value === "1" || value === "on" || value === "yes";
}

export type ParsedBookingProductItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  lineNotes: string | null;
};

export type ParsedBookingModifierItem = {
  productId: string;
  modifierGroupId: string;
  modifierGroupName: string;
  modifierOptionId: string;
  modifierOptionName: string;
  quantity: number;
  priceDelta: number;
  inventoryItemId: string | null;
  inventoryQuantity: number;
  trackInventory: boolean;
  inventoryBehavior: "reusable" | "consumable";
};

export type ParsedCustomerBookingItem = {
  productId: string;
  quantity: number;
};

export type ParsedModifierSelection = {
  optionIds: string[];
  quantities: Record<string, number>;
};

export function parseBookingProductItems(
  formData: FormData,
  options?: { maxItems?: number },
): ParsedBookingProductItem[] {
  const items: ParsedBookingProductItem[] = [];
  const maxItems = options?.maxItems ?? 200;

  for (let index = 0; index < maxItems; index += 1) {
    const productId = getBookingFormString(formData, `productId_${index}`);
    if (!productId) break;

    items.push({
      productId,
      quantity: Math.max(
        1,
        Math.floor(getBookingFormNumber(formData, `quantity_${index}`, 1)),
      ),
      unitPrice: Math.max(
        0,
        getBookingFormNumber(formData, `unitPrice_${index}`, 0),
      ),
      lineNotes: getBookingFormNullableString(formData, `lineNotes_${index}`),
    });
  }

  return items;
}

export function parseCustomerBookingItems(
  formData: FormData,
  options?: { maxItems?: number },
): ParsedCustomerBookingItem[] {
  return parseBookingProductItems(formData, options).map(({ productId, quantity }) => ({
    productId,
    quantity,
  }));
}

export function parseBookingModifierItems(
  formData: FormData,
  options?: { maxItems?: number },
): ParsedBookingModifierItem[] {
  const modifiers: ParsedBookingModifierItem[] = [];
  const maxItems = options?.maxItems ?? 300;

  for (let index = 0; index < maxItems; index += 1) {
    const productId = getBookingFormString(formData, `modifierProductId_${index}`);
    const modifierGroupId = getBookingFormString(formData, `modifierGroupId_${index}`);
    const modifierOptionId = getBookingFormString(formData, `modifierOptionId_${index}`);

    if (!productId && !modifierGroupId && !modifierOptionId) break;
    if (!productId || !modifierGroupId || !modifierOptionId) continue;

    modifiers.push({
      productId,
      modifierGroupId,
      modifierGroupName: getBookingFormString(
        formData,
        `modifierGroupName_${index}`,
      ),
      modifierOptionId,
      modifierOptionName: getBookingFormString(
        formData,
        `modifierOptionName_${index}`,
      ),
      quantity: Math.max(
        1,
        Math.floor(getBookingFormNumber(formData, `modifierQuantity_${index}`, 1)),
      ),
      priceDelta: Math.max(
        0,
        getBookingFormNumber(formData, `modifierPriceDelta_${index}`, 0),
      ),
      inventoryItemId:
        getBookingFormString(formData, `modifierInventoryItemId_${index}`) || null,
      inventoryQuantity: Math.max(
        0,
        getBookingFormNumber(formData, `modifierInventoryQuantity_${index}`, 1),
      ),
      trackInventory: getBookingFormBoolean(
        formData,
        `modifierTrackInventory_${index}`,
      ),
      inventoryBehavior:
        getBookingFormString(formData, `modifierInventoryBehavior_${index}`) === "consumable"
          ? "consumable"
          : "reusable",
    });
  }

  return modifiers;
}

export function parseModifierSelectionsForProduct(
  formData: FormData,
  productId: string,
  options?: { maxItems?: number },
): ParsedModifierSelection {
  const optionIds: string[] = [];
  const quantities: Record<string, number> = {};
  const maxItems = options?.maxItems ?? 500;

  for (let index = 0; index < maxItems; index += 1) {
    const modifierProductId = getBookingFormString(
      formData,
      `modifierProductId_${index}`,
    );
    const optionId = getBookingFormString(formData, `modifierOptionId_${index}`);

    if (!modifierProductId && !optionId) continue;
    if (!optionId || modifierProductId !== productId) continue;

    const quantity = Math.max(
      1,
      Math.floor(getBookingFormNumber(formData, `modifierQuantity_${index}`, 1)),
    );

    optionIds.push(optionId);
    quantities[optionId] = (quantities[optionId] || 0) + quantity;
  }

  return {
    optionIds: Array.from(new Set(optionIds)),
    quantities,
  };
}

export function parseModifierQuantityJson(
  formData: FormData,
  key = "selectedModifierOptionQuantities",
) {
  const value = getBookingFormString(formData, key);
  if (!value) return {} as Record<string, number>;

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const result: Record<string, number> = {};
    for (const [optionId, rawQuantity] of Object.entries(parsed)) {
      const safeOptionId = String(optionId || "").trim();
      const safeQuantity = Math.max(0, Math.floor(Number(rawQuantity || 0)));
      if (safeOptionId && safeQuantity > 0) result[safeOptionId] = safeQuantity;
    }

    return result;
  } catch {
    return {};
  }
}

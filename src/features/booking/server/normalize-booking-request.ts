export type BookingItemSelectionInput = {
  productId: string;
  quantity?: number | string | null;
  selectedModifierGroupOptionIds?: string[] | null;
  selectedModifierOptionQuantities?: Record<string, number> | null;
};

export type BookingAvailabilityResult = {
  productId: string;
  reservedFrom: string;
  reservedUntil: string;
};

export type NormalizedBookingItemRequest = {
  productId: string;
  quantity: number;
  selectedModifierGroupOptionIds: string[];
  selectedModifierOptionQuantities: Record<string, number>;
  reservedFrom?: string;
  reservedUntil?: string;
};

function normalizeQuantity(value: unknown) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function normalizeOptionIds(value: string[] | null | undefined) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((optionId) => String(optionId || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeOptionQuantities(
  value: Record<string, number> | null | undefined,
) {
  const normalized: Record<string, number> = {};

  for (const [optionIdRaw, quantityRaw] of Object.entries(value || {})) {
    const optionId = String(optionIdRaw || "").trim();
    const quantity = Math.floor(Number(quantityRaw || 0));

    if (optionId && Number.isFinite(quantity) && quantity > 0) {
      normalized[optionId] = quantity;
    }
  }

  return normalized;
}

export function normalizeBookingItemRequests(
  items: BookingItemSelectionInput[],
): NormalizedBookingItemRequest[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      productId: String(item?.productId || "").trim(),
      quantity: normalizeQuantity(item?.quantity),
      selectedModifierGroupOptionIds: normalizeOptionIds(
        item?.selectedModifierGroupOptionIds,
      ),
      selectedModifierOptionQuantities: normalizeOptionQuantities(
        item?.selectedModifierOptionQuantities,
      ),
    }))
    .filter((item) => Boolean(item.productId));
}

export function attachAvailabilityToBookingItems(params: {
  items: NormalizedBookingItemRequest[];
  availabilityResults: BookingAvailabilityResult[];
}) {
  const { items, availabilityResults } = params;

  if (items.length !== availabilityResults.length) {
    throw new Error("Availability validation returned an unexpected item count.");
  }

  return items.map((item, index) => {
    const availability = availabilityResults[index];

    if (!availability) {
      throw new Error("Failed to validate a selected product.");
    }

    if (String(availability.productId) !== item.productId) {
      throw new Error("Availability validation returned products in an unexpected order.");
    }

    if (!availability.reservedFrom || !availability.reservedUntil) {
      throw new Error("Availability validation did not return a reservation window.");
    }

    return {
      ...item,
      reservedFrom: availability.reservedFrom,
      reservedUntil: availability.reservedUntil,
    };
  });
}

export function getCombinedReservationWindow(
  items: Array<{
    reservedFrom?: string | null;
    reservedUntil?: string | null;
  }>,
) {
  const reservedFromValues = items
    .map((item) => String(item.reservedFrom || "").trim())
    .filter(Boolean)
    .sort();
  const reservedUntilValues = items
    .map((item) => String(item.reservedUntil || "").trim())
    .filter(Boolean)
    .sort();

  const reservedFrom = reservedFromValues[0];
  const reservedUntil = reservedUntilValues.at(-1);

  if (!reservedFrom || !reservedUntil) {
    throw new Error("Could not determine the booking reservation window.");
  }

  return { reservedFrom, reservedUntil };
}

export function groupModifierSelectionsByProductId(
  modifiers: Array<{
    productId: string;
    modifierOptionId: string;
    quantity?: number | null;
  }>,
) {
  const grouped = new Map<
    string,
    {
      optionIds: string[];
      quantities: Record<string, number>;
    }
  >();

  for (const modifier of modifiers || []) {
    const productId = String(modifier?.productId || "").trim();
    const optionId = String(modifier?.modifierOptionId || "").trim();

    if (!productId || !optionId) continue;

    const current = grouped.get(productId) || {
      optionIds: [],
      quantities: {},
    };
    const quantity = normalizeQuantity(modifier.quantity);

    current.optionIds.push(optionId);
    current.quantities[optionId] =
      (current.quantities[optionId] || 0) + quantity;
    grouped.set(productId, current);
  }

  for (const value of grouped.values()) {
    value.optionIds = Array.from(new Set(value.optionIds));
  }

  return grouped;
}

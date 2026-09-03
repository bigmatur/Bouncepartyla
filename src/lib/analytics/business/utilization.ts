import type {
  BusinessAnalyticsRange,
  BusinessProductUtilizationRow,
  BusinessUtilizationConfidence,
} from "./types";

const ACTIVE_RESERVATION_STATUSES = new Set([
  "reserved",
  "picked",
  "loaded",
  "delivered",
  "installed",
]);

const EXCLUDED_SERIALIZED_UNIT_STATUSES = new Set([
  "lost",
  "retired",
  "damaged",
  "maintenance",
  "cleaning",
]);

type ProductInventoryMapping = {
  productId: string;
  productName: string;
  categoryName: string;
  inventoryItemId: string | null;
  mappingSource: "main" | "component" | "none" | "ambiguous";
};

type InventoryItemRow = {
  id?: unknown;
  name?: unknown;
  tracking_type?: unknown;
  total_quantity?: unknown;
  quantity_on_hand?: unknown;
  quantity_available?: unknown;
};

type InventoryUnitRow = {
  id?: unknown;
  inventory_item_id?: unknown;
  status?: unknown;
  retired_at?: unknown;
};

type InventoryReservationRow = {
  inventory_item_id?: unknown;
  status?: unknown;
  quantity?: unknown;
  reserved_from?: unknown;
  reserved_until?: unknown;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function amount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: unknown) {
  return text(value).toLowerCase();
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function rangeBoundaries(range: BusinessAnalyticsRange) {
  const from = parseDate(range.from);
  const to = parseDate(range.to);

  const start = new Date(`${range.from}T00:00:00`);
  const endExclusive = new Date(`${range.to}T23:59:59.999`);

  const valid =
    !Number.isNaN(from.getTime()) &&
    !Number.isNaN(to.getTime()) &&
    from <= to;

  const msPerDay = 24 * 60 * 60 * 1000;
  const dayCount = valid
    ? Math.max(1, Math.floor((to.getTime() - from.getTime()) / msPerDay) + 1)
    : 1;

  return {
    start,
    endExclusive,
    dayCount,
    from,
    to,
  };
}

function enumerateDayWindows(params: { from: Date; to: Date }) {
  const windows: Array<{ start: Date; end: Date }> = [];

  const cursor = new Date(params.from);
  while (cursor <= params.to) {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0);
    const end = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 59, 999);
    windows.push({ start, end });
    cursor.setDate(cursor.getDate() + 1);
  }

  return windows;
}

function overlapsWindow(params: {
  from: Date;
  until: Date;
  windowStart: Date;
  windowEnd: Date;
}) {
  return params.from < params.windowEnd && params.until > params.windowStart;
}

function overlapDurationDays(params: {
  from: Date;
  until: Date;
  windowStart: Date;
  windowEnd: Date;
}) {
  if (!overlapsWindow(params)) {
    return 0;
  }

  const start = Math.max(params.from.getTime(), params.windowStart.getTime());
  const end = Math.min(params.until.getTime(), params.windowEnd.getTime());

  if (end <= start) {
    return 0;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return (end - start) / msPerDay;
}

function parseReservationWindow(row: InventoryReservationRow) {
  const fromRaw = text(row.reserved_from);
  const untilRaw = text(row.reserved_until);

  if (!fromRaw || !untilRaw) {
    return null;
  }

  const from = new Date(fromRaw);
  const until = new Date(untilRaw);

  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime()) || until <= from) {
    return null;
  }

  return { from, until };
}

function computePeakReserved(params: {
  reservations: InventoryReservationRow[];
  windowStart: Date;
  windowEnd: Date;
}) {
  const events: Array<{ at: number; delta: number }> = [];

  for (const row of params.reservations) {
    const status = normalizeStatus(row.status);
    if (!ACTIVE_RESERVATION_STATUSES.has(status)) {
      continue;
    }

    const window = parseReservationWindow(row);
    if (!window) {
      continue;
    }

    if (
      !overlapsWindow({
        from: window.from,
        until: window.until,
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
      })
    ) {
      continue;
    }

    const start = Math.max(window.from.getTime(), params.windowStart.getTime());
    const end = Math.min(window.until.getTime(), params.windowEnd.getTime());
    if (end <= start) {
      continue;
    }

    const qty = Math.max(0, amount(row.quantity) || 1);
    if (qty <= 0) {
      continue;
    }

    events.push({ at: start, delta: qty });
    events.push({ at: end, delta: -qty });
  }

  events.sort((a, b) => {
    if (a.at !== b.at) {
      return a.at - b.at;
    }

    return a.delta - b.delta;
  });

  let current = 0;
  let peak = 0;

  for (const event of events) {
    current += event.delta;
    if (current > peak) {
      peak = current;
    }
  }

  return peak;
}

function countReservationObservations(rows: InventoryReservationRow[]) {
  return rows.reduce((count, row) => {
    const status = normalizeStatus(row.status);
    if (!ACTIVE_RESERVATION_STATUSES.has(status)) {
      return count;
    }

    const window = parseReservationWindow(row);
    if (!window) {
      return count;
    }

    return count + 1;
  }, 0);
}

function classifyCapacityStatus(params: {
  confidence: BusinessUtilizationConfidence;
  peakUtilizationPct: number | null;
  periodUtilizationPct: number | null;
  highUtilizationDays: number;
  capacityHitDays: number;
  observationCount: number;
  rangeDayCount: number;
}) {
  if (params.peakUtilizationPct === null || params.periodUtilizationPct === null) {
    return {
      statusKind: "unsupported" as const,
      statusLabel: "Unsupported",
    };
  }

  const hasEnoughObservation =
    params.observationCount >= 3 ||
    params.highUtilizationDays >= 2 ||
    params.capacityHitDays >= 1;

  const sustainedHighForAvailable =
    params.confidence === "available" &&
    params.peakUtilizationPct >= 80 &&
    params.periodUtilizationPct >= 35 &&
    params.highUtilizationDays >= 3 &&
    params.observationCount >= 3;

  if (sustainedHighForAvailable) {
    return {
      statusKind: "high_pressure" as const,
      statusLabel: "High Capacity Pressure",
    };
  }

  const needsReview =
    params.peakUtilizationPct >= 80 &&
    (hasEnoughObservation || params.periodUtilizationPct >= 20);

  if (needsReview) {
    if (params.confidence === "partial") {
      return {
        statusKind: "review" as const,
        statusLabel: "Review Capacity (Partial Confidence)",
      };
    }

    return {
      statusKind: "review" as const,
      statusLabel: "Review Capacity",
    };
  }

  const lowUtilization =
    params.periodUtilizationPct < 25 &&
    params.rangeDayCount >= 14 &&
    params.observationCount >= 3;

  if (lowUtilization) {
    return {
      statusKind: "low_utilization" as const,
      statusLabel: "Low Utilization",
    };
  }

  return {
    statusKind: "measured" as const,
    statusLabel: "Measured",
  };
}

function resolveInventoryModel(params: {
  item: InventoryItemRow | null;
  mappingSource: ProductInventoryMapping["mappingSource"];
}) {
  if (!params.item || !text(params.item.id)) {
    return {
      model: "unmapped",
      confidence: "unsupported" as BusinessUtilizationConfidence,
      reason:
        params.mappingSource === "ambiguous"
          ? "Insufficient inventory mapping"
          : "Not mapped to inventory",
    };
  }

  const trackingType = normalizeStatus(params.item.tracking_type) || "unknown";

  if (trackingType === "serialized") {
    return {
      model: "serialized",
      confidence: "available" as BusinessUtilizationConfidence,
      reason: "",
    };
  }

  if (trackingType === "quantity" || trackingType === "consumable") {
    return {
      model: "quantity",
      confidence: "partial" as BusinessUtilizationConfidence,
      reason: "Quantity model uses aggregate counts",
    };
  }

  if (trackingType === "kit") {
    return {
      model: "kit",
      confidence: "unsupported" as BusinessUtilizationConfidence,
      reason: "Kit utilization is not deterministic in current model",
    };
  }

  return {
    model: trackingType,
    confidence: "unsupported" as BusinessUtilizationConfidence,
    reason: "Unsupported inventory tracking model",
  };
}

export function createProductInventoryMappings(params: {
  products: any[];
  productComponents: any[];
}) {
  const componentMap = new Map<string, Set<string>>();

  for (const row of params.productComponents) {
    const productId = text((row as any).product_id);
    const inventoryItemId = text((row as any).inventory_item_id);

    if (!productId || !inventoryItemId) {
      continue;
    }

    const required =
      (row as any).is_required === false || (row as any).required === false ? false : true;
    if (!required) {
      continue;
    }

    const queue = componentMap.get(productId) || new Set<string>();
    queue.add(inventoryItemId);
    componentMap.set(productId, queue);
  }

  const mappings: ProductInventoryMapping[] = [];

  for (const product of params.products) {
    const productId = text((product as any).id);
    if (!productId) {
      continue;
    }

    const productName = text((product as any).name) || "Unknown product";

    const categoryName = text((product as any).category_name) || "Uncategorized";

    const mainInventoryItemId = text((product as any).inventory_item_id);
    const components = componentMap.get(productId);
    const componentIds = components ? [...components] : [];

    if (mainInventoryItemId) {
      mappings.push({
        productId,
        productName,
        categoryName,
        inventoryItemId: mainInventoryItemId,
        mappingSource: "main",
      });
      continue;
    }

    if (componentIds.length === 1) {
      mappings.push({
        productId,
        productName,
        categoryName,
        inventoryItemId: componentIds[0],
        mappingSource: "component",
      });
      continue;
    }

    if (componentIds.length > 1) {
      mappings.push({
        productId,
        productName,
        categoryName,
        inventoryItemId: null,
        mappingSource: "ambiguous",
      });
      continue;
    }

    mappings.push({
      productId,
      productName,
      categoryName,
      inventoryItemId: null,
      mappingSource: "none",
    });
  }

  return mappings;
}

export function calculateProductUtilization(params: {
  range: BusinessAnalyticsRange;
  mappings: ProductInventoryMapping[];
  inventoryItems: InventoryItemRow[];
  inventoryUnits: InventoryUnitRow[];
  reservations: InventoryReservationRow[];
}): BusinessProductUtilizationRow[] {
  const boundaries = rangeBoundaries(params.range);
  const dayWindows = enumerateDayWindows({
    from: boundaries.from,
    to: boundaries.to,
  });

  const inventoryItemMap = new Map<string, InventoryItemRow>();
  for (const item of params.inventoryItems) {
    const id = text(item.id);
    if (!id) {
      continue;
    }

    inventoryItemMap.set(id, item);
  }

  const unitsByItem = new Map<string, InventoryUnitRow[]>();
  for (const unit of params.inventoryUnits) {
    const itemId = text(unit.inventory_item_id);
    if (!itemId) {
      continue;
    }

    const queue = unitsByItem.get(itemId) || [];
    queue.push(unit);
    unitsByItem.set(itemId, queue);
  }

  const reservationsByItem = new Map<string, InventoryReservationRow[]>();
  for (const reservation of params.reservations) {
    const itemId = text(reservation.inventory_item_id);
    if (!itemId) {
      continue;
    }

    const queue = reservationsByItem.get(itemId) || [];
    queue.push(reservation);
    reservationsByItem.set(itemId, queue);
  }

  return params.mappings
    .map((mapping): BusinessProductUtilizationRow => {
      const item = mapping.inventoryItemId
        ? inventoryItemMap.get(mapping.inventoryItemId) || null
        : null;

      const modelResolution = resolveInventoryModel({
        item,
        mappingSource: mapping.mappingSource,
      });

      const unsupportedBase: BusinessProductUtilizationRow = {
        productId: mapping.productId,
        productName: mapping.productName,
        categoryName: mapping.categoryName,
        inventoryModel: modelResolution.model,
        confidence: modelResolution.confidence,
        availableCapacity: null,
        peakReservedCapacity: null,
        peakUtilizationPct: null,
        periodUtilizationPct: null,
        reservedCapacityDays: null,
        availableCapacityDays: null,
        highUtilizationDays: null,
        capacityHitDays: null,
        reservationObservationCount: null,
        statusKind: "unsupported",
        statusLabel: "Unsupported",
        unsupportedReason: modelResolution.reason || null,
      };

      if (!item || !mapping.inventoryItemId) {
        return unsupportedBase;
      }

      const itemReservations = reservationsByItem.get(mapping.inventoryItemId) || [];

      if (modelResolution.model === "serialized") {
        const allUnits = unitsByItem.get(mapping.inventoryItemId) || [];

        const availableUnits = allUnits.filter((unit) => {
          const status = normalizeStatus(unit.status);
          if (EXCLUDED_SERIALIZED_UNIT_STATUSES.has(status)) {
            return false;
          }

          if ((unit as any).retired_at) {
            return false;
          }

          return true;
        });

        const capacity = availableUnits.length;
        if (capacity <= 0) {
          return {
            ...unsupportedBase,
            inventoryModel: "serialized",
            confidence: "unsupported" as BusinessUtilizationConfidence,
            unsupportedReason: "No active physical units",
          };
        }

        const peakReserved = computePeakReserved({
          reservations: itemReservations,
          windowStart: boundaries.start,
          windowEnd: boundaries.endExclusive,
        });

        const reservedCapacityDays = itemReservations.reduce((sum, reservation) => {
          const status = normalizeStatus(reservation.status);
          if (!ACTIVE_RESERVATION_STATUSES.has(status)) {
            return sum;
          }

          const window = parseReservationWindow(reservation);
          if (!window) {
            return sum;
          }

          const overlapDays = overlapDurationDays({
            from: window.from,
            until: window.until,
            windowStart: boundaries.start,
            windowEnd: boundaries.endExclusive,
          });

          if (overlapDays <= 0) {
            return sum;
          }

          const qty = Math.max(0, amount(reservation.quantity) || 1);
          return sum + overlapDays * qty;
        }, 0);

        const availableCapacityDays = capacity * boundaries.dayCount;

        const peakUtilizationPct = capacity > 0 ? (peakReserved / capacity) * 100 : null;
        const periodUtilizationPct =
          availableCapacityDays > 0
            ? (reservedCapacityDays / availableCapacityDays) * 100
            : null;

        const dayPeaks = dayWindows.map((day) =>
          computePeakReserved({
            reservations: itemReservations,
            windowStart: day.start,
            windowEnd: day.end,
          }),
        );

        const highUtilizationDays = dayPeaks.reduce((count, value) => {
          if (capacity <= 0) {
            return count;
          }

          return (value / capacity) * 100 >= 80 ? count + 1 : count;
        }, 0);

        const capacityHitDays = dayPeaks.reduce((count, value) => {
          return value >= capacity ? count + 1 : count;
        }, 0);

        const reservationObservationCount = countReservationObservations(itemReservations);

        const status = classifyCapacityStatus({
          confidence: "available",
          peakUtilizationPct,
          periodUtilizationPct,
          highUtilizationDays,
          capacityHitDays,
          observationCount: reservationObservationCount,
          rangeDayCount: boundaries.dayCount,
        });

        return {
          productId: mapping.productId,
          productName: mapping.productName,
          categoryName: mapping.categoryName,
          inventoryModel: "serialized",
          confidence: "available",
          availableCapacity: capacity,
          peakReservedCapacity: peakReserved,
          peakUtilizationPct,
          periodUtilizationPct,
          reservedCapacityDays,
          availableCapacityDays,
          highUtilizationDays,
          capacityHitDays,
          reservationObservationCount,
          statusKind: status.statusKind,
          statusLabel: status.statusLabel,
          unsupportedReason: null,
        };
      }

      if (modelResolution.model === "quantity") {
        const totalQuantity = Math.max(
          amount(item.total_quantity),
          amount((item as any).quantity_on_hand),
          amount((item as any).quantity_available),
        );

        if (totalQuantity <= 0) {
          return {
            ...unsupportedBase,
            inventoryModel: "quantity",
            confidence: "unsupported" as BusinessUtilizationConfidence,
            unsupportedReason: "No available quantity baseline",
          };
        }

        const peakReserved = computePeakReserved({
          reservations: itemReservations,
          windowStart: boundaries.start,
          windowEnd: boundaries.endExclusive,
        });

        const reservedCapacityDays = itemReservations.reduce((sum, reservation) => {
          const status = normalizeStatus(reservation.status);
          if (!ACTIVE_RESERVATION_STATUSES.has(status)) {
            return sum;
          }

          const window = parseReservationWindow(reservation);
          if (!window) {
            return sum;
          }

          const overlapDays = overlapDurationDays({
            from: window.from,
            until: window.until,
            windowStart: boundaries.start,
            windowEnd: boundaries.endExclusive,
          });

          if (overlapDays <= 0) {
            return sum;
          }

          const qty = Math.max(0, amount(reservation.quantity));
          return sum + overlapDays * qty;
        }, 0);

        const availableCapacityDays = totalQuantity * boundaries.dayCount;

        const peakUtilizationPct = (peakReserved / totalQuantity) * 100;
        const periodUtilizationPct =
          availableCapacityDays > 0
            ? (reservedCapacityDays / availableCapacityDays) * 100
            : null;

        const dayPeaks = dayWindows.map((day) =>
          computePeakReserved({
            reservations: itemReservations,
            windowStart: day.start,
            windowEnd: day.end,
          }),
        );

        const highUtilizationDays = dayPeaks.reduce((count, value) => {
          return (value / totalQuantity) * 100 >= 80 ? count + 1 : count;
        }, 0);

        const capacityHitDays = dayPeaks.reduce((count, value) => {
          return value >= totalQuantity ? count + 1 : count;
        }, 0);

        const reservationObservationCount = countReservationObservations(itemReservations);

        const status = classifyCapacityStatus({
          confidence: "partial",
          peakUtilizationPct,
          periodUtilizationPct,
          highUtilizationDays,
          capacityHitDays,
          observationCount: reservationObservationCount,
          rangeDayCount: boundaries.dayCount,
        });

        return {
          productId: mapping.productId,
          productName: mapping.productName,
          categoryName: mapping.categoryName,
          inventoryModel: "quantity",
          confidence: "partial",
          availableCapacity: totalQuantity,
          peakReservedCapacity: peakReserved,
          peakUtilizationPct,
          periodUtilizationPct,
          reservedCapacityDays,
          availableCapacityDays,
          highUtilizationDays,
          capacityHitDays,
          reservationObservationCount,
          statusKind: status.statusKind,
          statusLabel: status.statusLabel,
          unsupportedReason: "Quantity utilization uses aggregate inventory counts",
        };
      }

      return unsupportedBase;
    })
    .sort((a, b) => {
      const utilA = a.peakUtilizationPct ?? -1;
      const utilB = b.peakUtilizationPct ?? -1;

      if (utilA !== utilB) {
        return utilB - utilA;
      }

      return a.productName.localeCompare(b.productName);
    });
}

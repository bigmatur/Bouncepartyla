import { percentageDelta } from "./comparisons";
import { isBusinessRevenueBooking } from "./definitions";
import { calculateProductUtilization, createProductInventoryMappings } from "./utilization";
import type {
  BusinessAnalyticsRange,
  BusinessProductCategoryRow,
  BusinessProductComparisonRow,
  BusinessProductCombinationRow,
  BusinessProductInsights,
  BusinessSignal,
} from "./types";

type BookingRow = {
  id?: unknown;
  status?: unknown;
  archived_at?: unknown;
  event_date?: unknown;
};

type BookingItemRow = {
  id?: unknown;
  booking_id?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  subtotal?: unknown;
  products?: unknown;
  bookings?: unknown;
};

const MIN_RENTAL_ACTIVITY_FOR_GROWTH = 2;

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

function toDisplayProductName(name: unknown) {
  const normalized = text(name);
  return normalized || "Unknown product";
}

function one<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] || null) as T | null;
  }

  if (value && typeof value === "object") {
    return value as T;
  }

  return null;
}

function formatDeltaForSignal(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No comparable baseline";
  }

  if (Math.abs(value) < 0.05) {
    return "No change";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

type ProductAggregate = {
  productId: string;
  productName: string;
  categoryName: string;
  revenue: number;
  rentals: number;
  bookingIds: Set<string>;
};

function createAggregateMap(params: {
  bookings: BookingRow[];
  items: BookingItemRow[];
}) {
  const revenueBookingIds = new Set(
    params.bookings
      .filter((booking) => isBusinessRevenueBooking(booking as any))
      .map((booking) => text(booking.id))
      .filter(Boolean),
  );

  const map = new Map<string, ProductAggregate>();
  const bookingProductSets = new Map<string, Set<string>>();

  for (const item of params.items) {
    const booking = one<BookingRow>(item.bookings);

    if (!booking || !isBusinessRevenueBooking(booking as any)) {
      continue;
    }

    const bookingId = text(item.booking_id || booking.id);
    if (!bookingId || !revenueBookingIds.has(bookingId)) {
      continue;
    }

    const product = one<{
      id?: unknown;
      name?: unknown;
      category_id?: unknown;
    }>(item.products);

    const productId = text(product?.id);
    if (!productId) {
      continue;
    }

    const productName = toDisplayProductName(product?.name);
    const categoryName = "Uncategorized";

    const qty = Math.max(1, amount(item.quantity) || 1);
    const lineRevenue =
      item.subtotal !== null && item.subtotal !== undefined
        ? amount(item.subtotal)
        : amount(item.unit_price) * qty;

    const current = map.get(productId) || {
      productId,
      productName,
      categoryName,
      revenue: 0,
      rentals: 0,
      bookingIds: new Set<string>(),
    };

    current.productName = current.productName || productName;
    current.categoryName = current.categoryName || categoryName;
    current.revenue += lineRevenue;
    current.rentals += qty;
    current.bookingIds.add(bookingId);

    map.set(productId, current);

    const bookingProducts = bookingProductSets.get(bookingId) || new Set<string>();
    bookingProducts.add(productId);
    bookingProductSets.set(bookingId, bookingProducts);
  }

  return {
    map,
    revenueBookingIds,
    bookingProductSets,
  };
}

function mergeProductIds(
  currentMap: Map<string, ProductAggregate>,
  previousMap: Map<string, ProductAggregate>,
  productMappings: Map<string, { productName: string; categoryName: string }>,
) {
  return Array.from(
    new Set([
      ...currentMap.keys(),
      ...previousMap.keys(),
      ...productMappings.keys(),
    ]),
  );
}

function buildComparisonRows(params: {
  currentMap: Map<string, ProductAggregate>;
  previousMap: Map<string, ProductAggregate>;
  productMappings: Map<string, { productName: string; categoryName: string }>;
}) {
  const allIds = mergeProductIds(params.currentMap, params.previousMap, params.productMappings);

  const totalCurrentRevenue = [...params.currentMap.values()].reduce(
    (sum, row) => sum + row.revenue,
    0,
  );

  const rows: BusinessProductComparisonRow[] = allIds
    .map((productId) => {
      const current = params.currentMap.get(productId);
      const previous = params.previousMap.get(productId);
      const mapped = params.productMappings.get(productId);

      const currentRevenue = current?.revenue || 0;
      const previousRevenue = previous?.revenue || 0;
      const currentRentals = current?.rentals || 0;
      const previousRentals = previous?.rentals || 0;
      const currentBookingCount = current?.bookingIds.size || 0;
      const previousBookingCount = previous?.bookingIds.size || 0;

      return {
        productId,
        productName:
          current?.productName || previous?.productName || mapped?.productName || "Unknown product",
        categoryName:
          current?.categoryName || previous?.categoryName || mapped?.categoryName || "Uncategorized",
        currentRevenue,
        previousRevenue,
        revenueDeltaPct: percentageDelta(currentRevenue, previousRevenue),
        currentRentals,
        previousRentals,
        rentalDeltaPct: percentageDelta(currentRentals, previousRentals),
        currentBookingCount,
        previousBookingCount,
        revenuePerRental: currentRentals > 0 ? currentRevenue / currentRentals : 0,
        revenueSharePct:
          totalCurrentRevenue > 0 ? (currentRevenue / totalCurrentRevenue) * 100 : 0,
      };
    })
    .filter((row) => row.currentRevenue > 0 || row.previousRevenue > 0 || row.currentRentals > 0 || row.previousRentals > 0)
    .sort((a, b) => b.currentRevenue - a.currentRevenue);

  return {
    rows,
    totalCurrentRevenue,
  };
}

function buildCategoryRows(rows: BusinessProductComparisonRow[]): BusinessProductCategoryRow[] {
  const totalRevenue = rows.reduce((sum, row) => sum + row.currentRevenue, 0);
  const map = new Map<string, BusinessProductCategoryRow>();

  for (const row of rows) {
    const key = row.categoryName || "Uncategorized";
    const current = map.get(key) || {
      categoryName: key,
      revenue: 0,
      rentals: 0,
      bookingCount: 0,
      revenueSharePct: 0,
    };

    current.revenue += row.currentRevenue;
    current.rentals += row.currentRentals;
    current.bookingCount += row.currentBookingCount;

    map.set(key, current);
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      revenueSharePct: totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function buildCombinations(params: {
  bookingProductSets: Map<string, Set<string>>;
  comparisonRows: BusinessProductComparisonRow[];
}): BusinessProductCombinationRow[] {
  const namesById = new Map(params.comparisonRows.map((row) => [row.productId, row.productName]));

  const pairCounts = new Map<string, number>();

  for (const productSet of params.bookingProductSets.values()) {
    const ids = [...productSet].filter(Boolean).sort((a, b) => a.localeCompare(b));

    if (ids.length < 2) {
      continue;
    }

    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = ids[i];
        const b = ids[j];
        const key = `${a}::${b}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  return [...pairCounts.entries()]
    .map(([key, count]) => {
      const [productAId, productBId] = key.split("::");
      return {
        productAId,
        productAName: namesById.get(productAId) || "Unknown product",
        productBId,
        productBName: namesById.get(productBId) || "Unknown product",
        bookingCount: count,
      };
    })
    .sort((a, b) => b.bookingCount - a.bookingCount || a.productAName.localeCompare(b.productAName));
}

function buildProductSignals(params: {
  rows: BusinessProductComparisonRow[];
  utilizationRows: BusinessProductInsights["utilizationRows"];
  totalCurrentRevenue: number;
}): BusinessSignal[] {
  const signals: BusinessSignal[] = [];

  const withActivity = params.rows.filter(
    (row) => Math.max(row.currentRentals, row.previousRentals) >= MIN_RENTAL_ACTIVITY_FOR_GROWTH,
  );

  const growing = [...withActivity]
    .filter((row) => row.revenueDeltaPct !== null && row.revenueDeltaPct >= 12)
    .sort((a, b) => Number(b.revenueDeltaPct || 0) - Number(a.revenueDeltaPct || 0))[0];

  if (growing) {
    signals.push({
      id: "product-revenue-growth",
      type: "product-growth",
      severity: "positive",
      title: `${growing.productName} revenue ${formatDeltaForSignal(growing.revenueDeltaPct)}`,
      explanation: `${Math.round(growing.currentRentals)} rentals vs ${Math.round(growing.previousRentals)} in previous period.`,
      currentValue: growing.currentRevenue,
      previousValue: growing.previousRevenue,
      deltaPct: growing.revenueDeltaPct,
    });
  }

  const declining = [...withActivity]
    .filter((row) => row.revenueDeltaPct !== null && row.revenueDeltaPct <= -12)
    .sort((a, b) => Number(a.revenueDeltaPct || 0) - Number(b.revenueDeltaPct || 0))[0];

  if (declining) {
    signals.push({
      id: "product-revenue-decline",
      type: "product-decline",
      severity: "warning",
      title: `${declining.productName} revenue ${formatDeltaForSignal(declining.revenueDeltaPct)}`,
      explanation: `${Math.round(declining.currentRentals)} rentals vs ${Math.round(declining.previousRentals)} in previous period.`,
      currentValue: declining.currentRevenue,
      previousValue: declining.previousRevenue,
      deltaPct: declining.revenueDeltaPct,
    });
  }

  const highPressure = params.utilizationRows
    .filter((row) => row.statusKind === "high_pressure")
    .sort((a, b) => Number(b.peakUtilizationPct || 0) - Number(a.peakUtilizationPct || 0))[0];

  if (highPressure) {
    signals.push({
      id: "product-capacity-pressure",
      type: "capacity-pressure",
      severity: "warning",
      title: `${highPressure.productName} capacity pressure ${Number(highPressure.peakUtilizationPct || 0).toFixed(1)}%`,
      explanation: `Reached >=80% capacity on ${Number(highPressure.highUtilizationDays || 0)} days (${Number(highPressure.capacityHitDays || 0)} full-capacity days).`,
      currentValue: highPressure.peakUtilizationPct || 0,
      previousValue: 80,
      deltaPct: (highPressure.peakUtilizationPct || 0) - 80,
    });
  }

  const reviewCapacity = params.utilizationRows
    .filter((row) => row.statusKind === "review")
    .sort((a, b) => Number(b.peakUtilizationPct || 0) - Number(a.peakUtilizationPct || 0))[0];

  if (reviewCapacity) {
    signals.push({
      id: "product-capacity-review",
      type: "capacity-review",
      severity: reviewCapacity.confidence === "partial" ? "info" : "warning",
      title: `${reviewCapacity.productName} peak ${Number(reviewCapacity.peakUtilizationPct || 0).toFixed(1)}%`,
      explanation: `Peak reached with ${Number(reviewCapacity.highUtilizationDays || 0)} high-utilization days and ${Number(reviewCapacity.capacityHitDays || 0)} full-capacity days; review persistence before action.`,
      currentValue: reviewCapacity.peakUtilizationPct || 0,
      previousValue: 80,
      deltaPct: (reviewCapacity.peakUtilizationPct || 0) - 80,
    });
  }

  const lowUtilization = params.utilizationRows
    .filter((row) => row.statusKind === "low_utilization")
    .sort((a, b) => Number(a.periodUtilizationPct || 0) - Number(b.periodUtilizationPct || 0))[0];

  if (lowUtilization) {
    signals.push({
      id: "product-low-utilization",
      type: "low-utilization",
      severity: "info",
      title: `${lowUtilization.productName} low period utilization`,
      explanation: `Period utilization ${Number(lowUtilization.periodUtilizationPct || 0).toFixed(1)}% with measurable serialized capacity.`,
      currentValue: lowUtilization.periodUtilizationPct || 0,
      previousValue: 25,
      deltaPct: (lowUtilization.periodUtilizationPct || 0) - 25,
    });
  }

  const topRevenue = params.rows.slice(0, 3);
  const topRevenueShare =
    params.totalCurrentRevenue > 0
      ? (topRevenue.reduce((sum, row) => sum + row.currentRevenue, 0) / params.totalCurrentRevenue) * 100
      : 0;

  if (topRevenueShare >= 70 && topRevenue.length > 0) {
    signals.push({
      id: "product-revenue-concentration",
      type: "revenue-concentration",
      severity: "warning",
      title: `Top ${topRevenue.length} products drive ${topRevenueShare.toFixed(1)}% of revenue`,
      explanation: "Revenue concentration is high; monitor product mix dependency.",
      currentValue: topRevenueShare,
      previousValue: 70,
      deltaPct: topRevenueShare - 70,
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: "product-stable",
      type: "products",
      severity: "info",
      title: "Product performance is stable",
      explanation: "No product movement crossed signal thresholds for this period.",
    });
  }

  return signals.slice(0, 6);
}

export function calculateBusinessProducts(params: {
  currentBookings: BookingRow[];
  previousBookings: BookingRow[];
  currentItems: BookingItemRow[];
  previousItems: BookingItemRow[];
  range: BusinessAnalyticsRange;
  products: any[];
  productComponents: any[];
  inventoryItems: any[];
  inventoryUnits: any[];
  reservations: any[];
}): BusinessProductInsights {
  const productCatalogById = new Map<string, { productName: string; categoryName: string }>();
  for (const product of params.products || []) {
    const productId = text((product as any).id);
    if (!productId) {
      continue;
    }

    productCatalogById.set(productId, {
      productName: toDisplayProductName((product as any).name),
      categoryName: text((product as any).category_name) || "Uncategorized",
    });
  }

  function enrichCategoryAndName(
    map: Map<string, ProductAggregate>,
  ) {
    for (const [productId, row] of map.entries()) {
      const catalog = productCatalogById.get(productId);
      if (!catalog) {
        continue;
      }

      if (!text(row.productName) || row.productName === "Unknown product") {
        row.productName = catalog.productName;
      }

      row.categoryName = catalog.categoryName || row.categoryName || "Uncategorized";
      map.set(productId, row);
    }
  }

  const currentAggregates = createAggregateMap({
    bookings: params.currentBookings,
    items: params.currentItems,
  });

  const previousAggregates = createAggregateMap({
    bookings: params.previousBookings,
    items: params.previousItems,
  });

  enrichCategoryAndName(currentAggregates.map);
  enrichCategoryAndName(previousAggregates.map);

  const mappings = createProductInventoryMappings({
    products: params.products,
    productComponents: params.productComponents,
  });

  const mappingByProductId = new Map(
    mappings.map((row) => {
      const catalog = productCatalogById.get(row.productId);

      return [
        row.productId,
        {
          productName: catalog?.productName || row.productName,
          categoryName: catalog?.categoryName || row.categoryName,
        },
      ];
    }),
  );

  const comparison = buildComparisonRows({
    currentMap: currentAggregates.map,
    previousMap: previousAggregates.map,
    productMappings: mappingByProductId,
  });

  const activityRows = comparison.rows.filter(
    (row) => Math.max(row.currentRentals, row.previousRentals) >= MIN_RENTAL_ACTIVITY_FOR_GROWTH,
  );

  const fastestGrowing = [...activityRows]
    .filter((row) => row.revenueDeltaPct !== null && Number(row.revenueDeltaPct || 0) > 0)
    .sort((a, b) => Number(b.revenueDeltaPct || 0) - Number(a.revenueDeltaPct || 0))
    .slice(0, 5);

  const largestDecline = [...activityRows]
    .filter((row) => row.revenueDeltaPct !== null && Number(row.revenueDeltaPct || 0) < 0)
    .sort((a, b) => Number(a.revenueDeltaPct || 0) - Number(b.revenueDeltaPct || 0))
    .slice(0, 5);

  const utilizationRows = calculateProductUtilization({
    range: params.range,
    mappings,
    inventoryItems: params.inventoryItems,
    inventoryUnits: params.inventoryUnits,
    reservations: params.reservations,
  });

  const combinations = buildCombinations({
    bookingProductSets: currentAggregates.bookingProductSets,
    comparisonRows: comparison.rows,
  });

  const categories = buildCategoryRows(comparison.rows);

  const uncategorizedRevenue = categories
    .filter((row) => row.categoryName === "Uncategorized")
    .reduce((sum, row) => sum + row.revenue, 0);

  const uncategorizedRevenueSharePct =
    comparison.totalCurrentRevenue > 0
      ? (uncategorizedRevenue / comparison.totalCurrentRevenue) * 100
      : 0;

  const categoryCoverageLimited = uncategorizedRevenueSharePct >= 80;

  const signals = buildProductSignals({
    rows: comparison.rows,
    utilizationRows,
    totalCurrentRevenue: comparison.totalCurrentRevenue,
  });

  const measurableUtilizationCount = utilizationRows.filter(
    (row) => row.confidence !== "unsupported",
  ).length;

  return {
    minRentalActivityForGrowth: MIN_RENTAL_ACTIVITY_FOR_GROWTH,
    totals: {
      productCount: comparison.rows.length,
      measurableUtilizationCount,
      totalRevenue: comparison.totalCurrentRevenue,
      totalRentals: comparison.rows.reduce((sum, row) => sum + row.currentRentals, 0),
      totalDistinctProductBookings: currentAggregates.bookingProductSets.size,
      uncategorizedRevenue,
      uncategorizedRevenueSharePct,
      categoryCoverageLimited,
    },
    rows: comparison.rows,
    leaders: {
      topRevenue: [...comparison.rows].slice(0, 10),
      mostRented: [...comparison.rows]
        .sort((a, b) => b.currentRentals - a.currentRentals)
        .slice(0, 10),
      fastestGrowing,
      largestDecline,
    },
    categories,
    utilizationRows,
    combinations: combinations.slice(0, 15),
    signals,
  };
}

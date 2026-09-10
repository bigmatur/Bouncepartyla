import type {
  BusinessAnalyticsRange,
  BusinessCashFlowComparison,
  BusinessOverviewComparisonSnapshot,
} from "./types";

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function percentageDelta(currentValue: number, previousValue: number) {
  if (previousValue === 0) {
    if (currentValue === 0) {
      return 0;
    }

    return null;
  }

  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

export function resolvePreviousRange(range: BusinessAnalyticsRange): BusinessAnalyticsRange {
  const fromDate = parseDate(range.from);
  const toDate = parseDate(range.to);

  if (
    Number.isNaN(fromDate.getTime()) ||
    Number.isNaN(toDate.getTime()) ||
    fromDate > toDate
  ) {
    return range;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const daySpan = Math.floor((toDate.getTime() - fromDate.getTime()) / msPerDay) + 1;

  const previousTo = new Date(fromDate);
  previousTo.setDate(previousTo.getDate() - 1);

  const previousFrom = new Date(previousTo);
  previousFrom.setDate(previousFrom.getDate() - (daySpan - 1));

  return {
    from: formatDate(previousFrom),
    to: formatDate(previousTo),
  };
}

export function createOverviewComparisonSnapshot(params: {
  currentMetrics: {
    bookedRevenue: unknown;
    bookingCount: unknown;
    averageBookingValue: unknown;
    discounts: unknown;
    deliveryRevenue: unknown;
  };
  previousMetrics: {
    bookedRevenue: unknown;
    bookingCount: unknown;
    averageBookingValue: unknown;
    discounts: unknown;
    deliveryRevenue: unknown;
  };
}): BusinessOverviewComparisonSnapshot {
  const current = {
    bookedRevenue: clampNumber(params.currentMetrics.bookedRevenue),
    bookingCount: clampNumber(params.currentMetrics.bookingCount),
    averageBookingValue: clampNumber(params.currentMetrics.averageBookingValue),
    discounts: clampNumber(params.currentMetrics.discounts),
    deliveryRevenue: clampNumber(params.currentMetrics.deliveryRevenue),
  };

  const previous = {
    bookedRevenue: clampNumber(params.previousMetrics.bookedRevenue),
    bookingCount: clampNumber(params.previousMetrics.bookingCount),
    averageBookingValue: clampNumber(params.previousMetrics.averageBookingValue),
    discounts: clampNumber(params.previousMetrics.discounts),
    deliveryRevenue: clampNumber(params.previousMetrics.deliveryRevenue),
  };

  return {
    current,
    previous,
    delta: {
      bookedRevenuePct: percentageDelta(current.bookedRevenue, previous.bookedRevenue),
      bookingCountPct: percentageDelta(current.bookingCount, previous.bookingCount),
      averageBookingValuePct: percentageDelta(current.averageBookingValue, previous.averageBookingValue),
      discountsPct: percentageDelta(current.discounts, previous.discounts),
      deliveryRevenuePct: percentageDelta(current.deliveryRevenue, previous.deliveryRevenue),
    },
  };
}

export function createCashFlowComparison(params: {
  currentMetrics: {
    collected: unknown;
    bookingCollectionRate: unknown;
  };
  previousMetrics: {
    collected: unknown;
    bookingCollectionRate: unknown;
  };
}): BusinessCashFlowComparison {
  const currentCollected = clampNumber(params.currentMetrics.collected);
  const previousCollected = clampNumber(params.previousMetrics.collected);

  const currentCollectionRate = clampNumber(params.currentMetrics.bookingCollectionRate);
  const previousCollectionRate = clampNumber(params.previousMetrics.bookingCollectionRate);

  return {
    currentCollected,
    previousCollected,
    collectedDeltaPct: percentageDelta(currentCollected, previousCollected),
    currentCollectionRate,
    previousCollectionRate,
    collectionRateDeltaPoints: currentCollectionRate - previousCollectionRate,
  };
}

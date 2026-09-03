import type { BusinessDriverRow, BusinessSignal } from "./types";

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatDeltaForTitle(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  if (Math.abs(value) < 0.05) {
    return "0.0%";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function baselineMessage(currentValue: number, previousValue: number) {
  if (previousValue === 0 && currentValue === 0) {
    return "No change vs previous period.";
  }

  if (previousValue === 0) {
    return "No comparable baseline in the previous period.";
  }

  return null;
}

function pushIfSignificant(
  signals: BusinessSignal[],
  input: {
    id: string;
    type: string;
    currentValue: number;
    previousValue: number;
    deltaPct: number | null;
    metricLabel: string;
    valueFormatter: (value: number) => string;
    minAbsPct?: number;
  },
) {
  const baseline = baselineMessage(input.currentValue, input.previousValue);
  const minAbsPct = input.minAbsPct ?? 5;

  if (!baseline && input.deltaPct !== null && Math.abs(input.deltaPct) < minAbsPct) {
    return;
  }

  const titleDelta = formatDeltaForTitle(input.deltaPct);
  const rising = (input.deltaPct ?? 0) >= 0;
  const noChangeBaseline = input.previousValue === 0 && input.currentValue === 0;
  const title = noChangeBaseline
    ? `${input.metricLabel}: No change`
    : titleDelta
      ? `${input.metricLabel} ${titleDelta}`
      : `${input.metricLabel}: No comparable baseline`;

  const explanation = baseline
    ? baseline
    : `${input.metricLabel} changed from ${input.valueFormatter(input.previousValue)} to ${input.valueFormatter(input.currentValue)} versus the previous equivalent period.`;

  signals.push({
    id: input.id,
    type: input.type,
    severity: baseline ? "info" : rising ? "positive" : "warning",
    title,
    explanation,
    currentValue: input.currentValue,
    previousValue: input.previousValue,
    deltaPct: input.deltaPct,
  });
}

function topByDelta(rows: BusinessDriverRow[], direction: "up" | "down") {
  const comparable = rows.filter((row) => row.deltaPct !== null);

  comparable.sort((a, b) => {
    const deltaA = Number(a.deltaPct || 0);
    const deltaB = Number(b.deltaPct || 0);
    return direction === "up" ? deltaB - deltaA : deltaA - deltaB;
  });

  return comparable[0] || null;
}

export function generateBusinessSignals(params: {
  comparison: {
    current: {
      bookedRevenue: number;
      bookingCount: number;
      averageBookingValue: number;
      discounts: number;
      deliveryRevenue: number;
    };
    previous: {
      bookedRevenue: number;
      bookingCount: number;
      averageBookingValue: number;
      discounts: number;
      deliveryRevenue: number;
    };
    delta: {
      bookedRevenuePct: number | null;
      bookingCountPct: number | null;
      averageBookingValuePct: number | null;
      discountsPct: number | null;
      deliveryRevenuePct: number | null;
    };
  };
  cashFlow: {
    currentCollectionRate: number;
    previousCollectionRate: number;
    collectionRateDeltaPoints: number;
  };
  productDrivers: BusinessDriverRow[];
  geographyDrivers: BusinessDriverRow[];
}): BusinessSignal[] {
  const signals: BusinessSignal[] = [];

  pushIfSignificant(signals, {
    id: "revenue-change",
    type: "revenue",
    currentValue: params.comparison.current.bookedRevenue,
    previousValue: params.comparison.previous.bookedRevenue,
    deltaPct: params.comparison.delta.bookedRevenuePct,
    metricLabel: "Revenue",
    valueFormatter: formatMoney,
  });

  pushIfSignificant(signals, {
    id: "bookings-change",
    type: "bookings",
    currentValue: params.comparison.current.bookingCount,
    previousValue: params.comparison.previous.bookingCount,
    deltaPct: params.comparison.delta.bookingCountPct,
    metricLabel: "Bookings",
    valueFormatter: formatNumber,
  });

  pushIfSignificant(signals, {
    id: "avg-booking-change",
    type: "average-booking",
    currentValue: params.comparison.current.averageBookingValue,
    previousValue: params.comparison.previous.averageBookingValue,
    deltaPct: params.comparison.delta.averageBookingValuePct,
    metricLabel: "Average Booking",
    valueFormatter: formatMoney,
  });

  if (params.comparison.delta.discountsPct !== null && params.comparison.delta.discountsPct >= 12) {
    signals.push({
      id: "discount-spike",
      type: "discounts",
      severity: "warning",
      title: `Discounts ${formatDeltaForTitle(params.comparison.delta.discountsPct)}`,
      explanation: `Discount volume changed from ${formatMoney(params.comparison.previous.discounts)} to ${formatMoney(params.comparison.current.discounts)} versus the previous equivalent period.`,
      currentValue: params.comparison.current.discounts,
      previousValue: params.comparison.previous.discounts,
      deltaPct: params.comparison.delta.discountsPct,
    });
  }

  const topGrowingProduct = topByDelta(params.productDrivers, "up");
  if (topGrowingProduct && Number(topGrowingProduct.deltaPct || 0) >= 15) {
    signals.push({
      id: "top-product-growth",
      type: "product-growth",
      severity: "positive",
      title: `${topGrowingProduct.label} ${formatDeltaForTitle(topGrowingProduct.deltaPct)}`,
      explanation: `Product revenue changed from ${formatMoney(topGrowingProduct.previousRevenue)} to ${formatMoney(topGrowingProduct.currentRevenue)} versus the previous equivalent period.`,
      currentValue: topGrowingProduct.currentRevenue,
      previousValue: topGrowingProduct.previousRevenue,
      deltaPct: topGrowingProduct.deltaPct,
    });
  }

  const topDecliningCity = topByDelta(params.geographyDrivers, "down");
  if (topDecliningCity && Number(topDecliningCity.deltaPct || 0) <= -15) {
    signals.push({
      id: "city-decline",
      type: "geography-decline",
      severity: "warning",
      title: `${topDecliningCity.label} ${formatDeltaForTitle(topDecliningCity.deltaPct)}`,
      explanation: `City revenue changed from ${formatMoney(topDecliningCity.previousRevenue)} to ${formatMoney(topDecliningCity.currentRevenue)} versus the previous equivalent period.`,
      currentValue: topDecliningCity.currentRevenue,
      previousValue: topDecliningCity.previousRevenue,
      deltaPct: topDecliningCity.deltaPct,
    });
  }

  if (params.cashFlow.collectionRateDeltaPoints <= -5) {
    signals.push({
      id: "collection-risk",
      type: "collections",
      severity: "warning",
      title: `Collection Rate ${params.cashFlow.collectionRateDeltaPoints.toFixed(1)} pts`,
      explanation: `Collection rate moved from ${params.cashFlow.previousCollectionRate.toFixed(1)}% to ${params.cashFlow.currentCollectionRate.toFixed(1)}% versus the previous equivalent period.`,
      currentValue: params.cashFlow.currentCollectionRate,
      previousValue: params.cashFlow.previousCollectionRate,
      deltaPct: params.cashFlow.collectionRateDeltaPoints,
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: "stable-period",
      type: "overview",
      severity: "info",
      title: "Performance is relatively stable",
      explanation: "No large shifts crossed signal thresholds for this period.",
    });
  }

  return signals.slice(0, 6);
}

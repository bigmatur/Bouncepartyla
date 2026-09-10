import {
  BUSINESS_EXCLUDED_BOOKING_STATUSES,
  BUSINESS_PREBOOKING_STATUSES,
  isBusinessRevenueBooking,
  normalizeBusinessStatus,
} from "./definitions";
import { percentageDelta } from "./comparisons";
import type {
  BusinessAnalyticsRange,
  BusinessComparisonMetric,
  BusinessDriverRow,
  BusinessSalesGeographyInsightRow,
  BusinessSalesInsights,
  BusinessSalesValueBandRow,
  BusinessSalesWeekdayRow,
  BusinessSignal,
  BusinessTrendComparisonRow,
} from "./types";

export type BusinessSalesBooking = {
  id?: unknown;
  status?: unknown;
  archived_at?: unknown;
  created_at?: unknown;
  event_date?: unknown;
  setup_city?: unknown;
  setup_state?: unknown;
  setup_zip?: unknown;
  booking_source?: unknown;
  total_amount?: unknown;
  discount_amount?: unknown;
  delivery_fee?: unknown;
  tax_amount?: unknown;
};

export type BusinessSalesItem = {
  id?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  subtotal?: unknown;
  products?: unknown;
  bookings?: unknown;
};

export type BusinessSalesRange = {
  from: string;
  to: string;
};

export type BusinessSalesTrendRow = {
  date: string;
  bookings: number;
  revenue: number;
};

export type BusinessSalesProductRow = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type BusinessSalesGeographyRow = {
  key: string;
  city: string;
  state: string;
  zip: string;
  bookings: number;
  revenue: number;
  averageBookingValue: number;
};

export type BusinessSalesSourceRow = {
  source: string;
  bookings: number;
  revenue: number;
  averageBookingValue: number;
};

export type BusinessSalesCityRow = {
  key: string;
  city: string;
  state: string;
  bookings: number;
  revenue: number;
  averageBookingValue: number;
};

export type BusinessSalesMetrics = {
  trend: BusinessSalesTrendRow[];
  products: BusinessSalesProductRow[];
  geography: BusinessSalesGeographyRow[];
  cities: BusinessSalesCityRow[];
  bookingSources: BusinessSalesSourceRow[];
  productRentalCount: number;
  productRevenue: number;
};

function amount(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function quantity(value: unknown) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(0, number);
}

function text(value: unknown) {
  return String(value || "").trim();
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

function dateKey(value: unknown) {
  const valueString = text(value);

  if (!valueString) {
    return "";
  }

  return valueString.slice(0, 10);
}

function labelFromKey(key: string) {
  if (!key) {
    return "Unknown";
  }

  return key
    .split("|")
    .filter(Boolean)
    .join(", ");
}

function compactDate(value: string) {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function daySpan(range: BusinessAnalyticsRange) {
  const from = new Date(`${range.from}T12:00:00`);
  const to = new Date(`${range.to}T12:00:00`);

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from > to
  ) {
    return 1;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / msPerDay) + 1);
}

function trendBucketDays(range: BusinessAnalyticsRange) {
  const span = daySpan(range);
  return span > 56 ? 7 : 1;
}

function aggregateTrendByBucket(rows: BusinessSalesTrendRow[], bucketSize: number) {
  if (bucketSize <= 1) {
    return rows.map((row) => ({
      label: compactDate(row.date),
      revenue: row.revenue,
      bookings: row.bookings,
    }));
  }

  const result: Array<{ label: string; revenue: number; bookings: number }> = [];

  for (let index = 0; index < rows.length; index += bucketSize) {
    const bucket = rows.slice(index, index + bucketSize);

    if (bucket.length === 0) {
      continue;
    }

    const first = bucket[0].date;
    const last = bucket[bucket.length - 1].date;

    result.push({
      label: `${compactDate(first)} - ${compactDate(last)}`,
      revenue: bucket.reduce((sum, row) => sum + row.revenue, 0),
      bookings: bucket.reduce((sum, row) => sum + row.bookings, 0),
    });
  }

  return result;
}

function toDriverRows<T extends { revenue: number }>(
  currentRows: T[],
  previousRows: T[],
  getKey: (row: T) => string,
  getLabel: (row: T) => string,
  getBookings: (row: T) => number,
) {
  const previousMap = new Map(previousRows.map((row) => [getKey(row), row]));

  const rows: BusinessDriverRow[] = currentRows.map((row) => {
    const key = getKey(row);
    const previous = previousMap.get(key);

    return {
      key,
      label: getLabel(row),
      currentRevenue: row.revenue,
      previousRevenue: previous?.revenue || 0,
      currentBookings: getBookings(row),
      previousBookings: previous ? getBookings(previous) : 0,
      deltaPct: percentageDelta(row.revenue, previous?.revenue || 0),
    };
  });

  rows.sort((a, b) => b.currentRevenue - a.currentRevenue);

  return rows;
}

function sourceLabel(value: unknown) {
  const raw = text(value);

  if (!raw) {
    return "Unknown";
  }

  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function enumerateDates(range: BusinessSalesRange) {
  const dates: string[] = [];

  const current = new Date(`${range.from}T12:00:00`);
  const end = new Date(`${range.to}T12:00:00`);

  if (
    Number.isNaN(current.getTime()) ||
    Number.isNaN(end.getTime()) ||
    current > end
  ) {
    return dates;
  }

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const day = String(current.getDate()).padStart(2, "0");

    dates.push(`${year}-${month}-${day}`);

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function calculateBusinessSales(
  bookings: BusinessSalesBooking[],
  items: BusinessSalesItem[],
  range?: BusinessSalesRange,
): BusinessSalesMetrics {
  const revenueBookings = bookings.filter(isBusinessRevenueBooking);

  const revenueBookingIds = new Set(
    revenueBookings
      .map((booking) => text(booking.id))
      .filter(Boolean),
  );

  const trendMap = new Map<string, BusinessSalesTrendRow>();

  if (range) {
    for (const date of enumerateDates(range)) {
      trendMap.set(date, {
        date,
        bookings: 0,
        revenue: 0,
      });
    }
  }

  const geographyMap = new Map<string, BusinessSalesGeographyRow>();
  const cityMap = new Map<string, BusinessSalesCityRow>();
  const sourceMap = new Map<string, BusinessSalesSourceRow>();

  for (const booking of revenueBookings) {
    const revenue = amount(booking.total_amount);
    const date = dateKey(booking.event_date);

    if (date) {
      const current = trendMap.get(date) || {
        date,
        bookings: 0,
        revenue: 0,
      };

      current.bookings += 1;
      current.revenue += revenue;

      trendMap.set(date, current);
    }

    const city = text(booking.setup_city) || "Unknown city";
    const state = text(booking.setup_state);
    const zip = text(booking.setup_zip);

    const geographyKey = [
      city.toLowerCase(),
      state.toLowerCase(),
      zip,
    ].join("|");

    const geographyCurrent = geographyMap.get(geographyKey) || {
      key: geographyKey,
      city,
      state,
      zip,
      bookings: 0,
      revenue: 0,
      averageBookingValue: 0,
    };

    geographyCurrent.bookings += 1;
    geographyCurrent.revenue += revenue;

    geographyMap.set(geographyKey, geographyCurrent);

    const cityKey = [city.toLowerCase(), state.toLowerCase()].join("|");
    const cityCurrent = cityMap.get(cityKey) || {
      key: cityKey,
      city,
      state,
      bookings: 0,
      revenue: 0,
      averageBookingValue: 0,
    };

    cityCurrent.bookings += 1;
    cityCurrent.revenue += revenue;

    cityMap.set(cityKey, cityCurrent);

    const source = sourceLabel(booking.booking_source);

    const sourceCurrent = sourceMap.get(source) || {
      source,
      bookings: 0,
      revenue: 0,
      averageBookingValue: 0,
    };

    sourceCurrent.bookings += 1;
    sourceCurrent.revenue += revenue;

    sourceMap.set(source, sourceCurrent);
  }

  const productMap = new Map<string, BusinessSalesProductRow>();

  for (const item of items) {
    const booking = one<{
      id?: unknown;
      status?: unknown;
      archived_at?: unknown;
    }>(item.bookings);

    if (!booking || !isBusinessRevenueBooking(booking)) {
      continue;
    }

    const bookingId = text(booking.id);

    if (bookingId && !revenueBookingIds.has(bookingId)) {
      continue;
    }

    const product = one<{
      id?: unknown;
      name?: unknown;
    }>(item.products);

    const productId = text(product?.id);
    const productName = text(product?.name) || "Unknown product";

    const key = productId || productName;

    const itemQuantity = Math.max(
      1,
      quantity(item.quantity) || 1,
    );

    const itemRevenue =
      item.subtotal !== null && item.subtotal !== undefined
        ? amount(item.subtotal)
        : amount(item.unit_price) * itemQuantity;

    const current = productMap.get(key) || {
      id: productId || key,
      name: productName,
      quantity: 0,
      revenue: 0,
    };

    current.quantity += itemQuantity;
    current.revenue += itemRevenue;

    productMap.set(key, current);
  }

  const trend = [...trendMap.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const products = [...productMap.values()].sort(
    (a, b) => b.revenue - a.revenue,
  );

  const geography = [...geographyMap.values()]
    .map((row) => ({
      ...row,
      averageBookingValue:
        row.bookings > 0 ? row.revenue / row.bookings : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const cities = [...cityMap.values()]
    .map((row) => ({
      ...row,
      averageBookingValue:
        row.bookings > 0 ? row.revenue / row.bookings : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const bookingSources = [...sourceMap.values()]
    .map((row) => ({
      ...row,
      averageBookingValue:
        row.bookings > 0 ? row.revenue / row.bookings : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    trend,
    products,
    geography,
    cities,
    bookingSources,
    productRentalCount: products.reduce(
      (sum, product) => sum + product.quantity,
      0,
    ),
    productRevenue: products.reduce(
      (sum, product) => sum + product.revenue,
      0,
    ),
  };
}

export function calculateBusinessTrendComparison(params: {
  currentTrend: BusinessSalesTrendRow[];
  previousTrend: BusinessSalesTrendRow[];
  range: BusinessAnalyticsRange;
}): BusinessTrendComparisonRow[] {
  const bucketDays = trendBucketDays(params.range);

  const currentBuckets = aggregateTrendByBucket(params.currentTrend, bucketDays);
  const previousBuckets = aggregateTrendByBucket(params.previousTrend, bucketDays);

  const bucketCount = Math.max(currentBuckets.length, previousBuckets.length);
  const rows: BusinessTrendComparisonRow[] = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const current = currentBuckets[index];
    const previous = previousBuckets[index];

    rows.push({
      label: current?.label || previous?.label || `Bucket ${index + 1}`,
      currentRevenue: current?.revenue || 0,
      previousRevenue: previous?.revenue || 0,
      currentBookings: current?.bookings || 0,
      previousBookings: previous?.bookings || 0,
    });
  }

  return rows;
}

export function compareBusinessRevenueDrivers(params: {
  current: BusinessSalesMetrics;
  previous: BusinessSalesMetrics;
}) {
  const productDrivers = toDriverRows(
    params.current.products,
    params.previous.products,
    (row) => row.id || row.name,
    (row) => row.name,
    (row) => row.quantity,
  );

  const geographyDrivers = toDriverRows(
    params.current.cities,
    params.previous.cities,
    (row) => row.key,
    (row) => labelFromKey(row.key),
    (row) => row.bookings,
  );

  const sourceDrivers = toDriverRows(
    params.current.bookingSources,
    params.previous.bookingSources,
    (row) => row.source,
    (row) => row.source,
    (row) => row.bookings,
  );

  return {
    productDrivers,
    geographyDrivers,
    sourceDrivers,
  };
}

type RevenueBookingFact = {
  id: string;
  status: string;
  eventDate: string;
  createdAt: string;
  city: string;
  state: string;
  zip: string;
  totalAmount: number;
  discountAmount: number;
  deliveryFee: number;
};

const SALES_VALUE_BANDS: Array<{
  key: string;
  label: string;
  minInclusive: number | null;
  maxExclusive: number | null;
}> = [
  { key: "lt_300", label: "<$300", minInclusive: null, maxExclusive: 300 },
  { key: "300_499", label: "$300-$499", minInclusive: 300, maxExclusive: 500 },
  { key: "500_699", label: "$500-$699", minInclusive: 500, maxExclusive: 700 },
  { key: "700_999", label: "$700-$999", minInclusive: 700, maxExclusive: 1000 },
  { key: "gte_1000", label: "$1,000+", minInclusive: 1000, maxExclusive: null },
];

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MIN_GEOGRAPHY_BOOKINGS_FOR_DELTA = 2;
const HIGH_VALUE_BOOKING_THRESHOLD = 1000;

function normalizeCity(value: unknown) {
  const city = text(value);
  return city || "Unknown city";
}

function normalizeState(value: unknown) {
  const state = text(value);
  return state || "Unknown state";
}

function normalizeZip(value: unknown) {
  const zip = text(value);
  return zip || "Unknown ZIP";
}

function parseBookingFacts(bookings: BusinessSalesBooking[]) {
  return bookings
    .filter(isBusinessRevenueBooking)
    .map((booking) => {
      const eventDate = dateKey(booking.event_date);
      const createdAt = text(booking.created_at);

      return {
        id: text(booking.id),
        status: normalizeBusinessStatus(booking.status),
        eventDate,
        createdAt,
        city: normalizeCity(booking.setup_city),
        state: normalizeState(booking.setup_state),
        zip: normalizeZip(booking.setup_zip),
        totalAmount: amount(booking.total_amount),
        discountAmount: amount(booking.discount_amount),
        deliveryFee: amount(booking.delivery_fee),
      } as RevenueBookingFact;
    })
    .filter((booking) => Boolean(booking.eventDate));
}

function buildComparisonMetric(current: number, previous: number): BusinessComparisonMetric {
  return {
    current,
    previous,
    deltaPct: percentageDelta(current, previous),
  };
}

function quantile(values: number[], percentile: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function summarizeFacts(facts: RevenueBookingFact[]) {
  const revenue = facts.reduce((sum, booking) => sum + booking.totalAmount, 0);
  const bookingCount = facts.length;
  const averageBooking = bookingCount > 0 ? revenue / bookingCount : 0;
  const discounts = facts.reduce((sum, booking) => sum + booking.discountAmount, 0);
  const deliveryRevenue = facts.reduce((sum, booking) => sum + booking.deliveryFee, 0);

  const discountedBookings = facts.filter((booking) => booking.discountAmount > 0);
  const discountedBookingShare =
    bookingCount > 0 ? (discountedBookings.length / bookingCount) * 100 : 0;
  const averageDiscountPerDiscountedBooking =
    discountedBookings.length > 0 ? discounts / discountedBookings.length : 0;

  const discountRateDenominator = revenue + discounts;
  const discountRate = discountRateDenominator > 0 ? (discounts / discountRateDenominator) * 100 : 0;

  const deliveryRevenueShare = revenue > 0 ? (deliveryRevenue / revenue) * 100 : 0;

  const bookingValues = facts.map((booking) => booking.totalAmount);
  const medianBookingValue = quantile(bookingValues, 0.5);

  const highValueCount = facts.filter(
    (booking) => booking.totalAmount >= HIGH_VALUE_BOOKING_THRESHOLD,
  ).length;
  const highValueBookingShare = bookingCount > 0 ? (highValueCount / bookingCount) * 100 : 0;

  return {
    revenue,
    bookingCount,
    averageBooking,
    discounts,
    discountedBookingShare,
    averageDiscountPerDiscountedBooking,
    discountRate,
    deliveryRevenue,
    deliveryRevenueShare,
    medianBookingValue,
    highValueBookingShare,
  };
}

function buildValueBands(facts: RevenueBookingFact[]): BusinessSalesValueBandRow[] {
  const totalRevenue = facts.reduce((sum, booking) => sum + booking.totalAmount, 0);

  return SALES_VALUE_BANDS.map((band) => {
    const matched = facts.filter((booking) => {
      if (band.minInclusive !== null && booking.totalAmount < band.minInclusive) {
        return false;
      }

      if (band.maxExclusive !== null && booking.totalAmount >= band.maxExclusive) {
        return false;
      }

      return true;
    });

    const revenue = matched.reduce((sum, booking) => sum + booking.totalAmount, 0);

    return {
      key: band.key,
      label: band.label,
      minInclusive: band.minInclusive,
      maxExclusive: band.maxExclusive,
      bookingCount: matched.length,
      revenue,
      revenueSharePct: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
    };
  });
}

function buildWeekdayRows(facts: RevenueBookingFact[]): BusinessSalesWeekdayRow[] {
  const totalRevenue = facts.reduce((sum, booking) => sum + booking.totalAmount, 0);

  const map = new Map<number, { revenue: number; bookings: number }>();
  for (let day = 0; day < 7; day += 1) {
    map.set(day, { revenue: 0, bookings: 0 });
  }

  for (const booking of facts) {
    const date = new Date(`${booking.eventDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const weekday = date.getDay();
    const row = map.get(weekday);
    if (!row) {
      continue;
    }

    row.bookings += 1;
    row.revenue += booking.totalAmount;
    map.set(weekday, row);
  }

  return WEEKDAY_NAMES.map((name, dayIndex) => {
    const row = map.get(dayIndex) || { revenue: 0, bookings: 0 };
    const averageBookingValue = row.bookings > 0 ? row.revenue / row.bookings : 0;

    return {
      dayIndex,
      dayName: name,
      revenue: row.revenue,
      bookings: row.bookings,
      averageBookingValue,
      revenueSharePct: totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0,
    };
  });
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  const date = new Date(`${year}-${month}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function buildDailyTrendFromFacts(params: {
  facts: RevenueBookingFact[];
  range: BusinessAnalyticsRange;
}): BusinessSalesTrendRow[] {
  const map = new Map<string, BusinessSalesTrendRow>();

  for (const date of enumerateDates({ from: params.range.from, to: params.range.to })) {
    map.set(date, {
      date,
      bookings: 0,
      revenue: 0,
    });
  }

  for (const booking of params.facts) {
    const row = map.get(booking.eventDate) || {
      date: booking.eventDate,
      bookings: 0,
      revenue: 0,
    };

    row.bookings += 1;
    row.revenue += booking.totalAmount;
    map.set(booking.eventDate, row);
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildMonthlyTrendFromFacts(facts: RevenueBookingFact[]) {
  const map = new Map<string, { revenue: number; bookings: number }>();

  for (const booking of facts) {
    const key = monthKey(booking.eventDate);
    const row = map.get(key) || { revenue: 0, bookings: 0 };
    row.revenue += booking.totalAmount;
    row.bookings += 1;
    map.set(key, row);
  }

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, row]) => ({
      label: monthLabel(key),
      revenue: row.revenue,
      bookings: row.bookings,
    }));
}

function buildTrendRows(params: {
  currentFacts: RevenueBookingFact[];
  previousFacts: RevenueBookingFact[];
  range: BusinessAnalyticsRange;
}): BusinessTrendComparisonRow[] {
  const span = daySpan(params.range);

  if (span > 180) {
    const currentRows = buildMonthlyTrendFromFacts(params.currentFacts);
    const previousRows = buildMonthlyTrendFromFacts(params.previousFacts);
    const count = Math.max(currentRows.length, previousRows.length);
    const rows: BusinessTrendComparisonRow[] = [];

    for (let index = 0; index < count; index += 1) {
      const current = currentRows[index];
      const previous = previousRows[index];
      rows.push({
        label: current?.label || previous?.label || `Month ${index + 1}`,
        currentRevenue: current?.revenue || 0,
        previousRevenue: previous?.revenue || 0,
        currentBookings: current?.bookings || 0,
        previousBookings: previous?.bookings || 0,
      });
    }

    return rows;
  }

  const currentTrend = buildDailyTrendFromFacts({
    facts: params.currentFacts,
    range: params.range,
  });

  const previousTrend = buildDailyTrendFromFacts({
    facts: params.previousFacts,
    range: params.range,
  });

  return calculateBusinessTrendComparison({
    currentTrend,
    previousTrend,
    range: params.range,
  });
}

function formatCityLabel(city: string, state: string) {
  return `${city}, ${state}`;
}

function geographyRows(params: {
  currentFacts: RevenueBookingFact[];
  previousFacts: RevenueBookingFact[];
  mode: "city" | "zip";
}): BusinessSalesGeographyInsightRow[] {
  const collect = (facts: RevenueBookingFact[]) => {
    const map = new Map<string, { label: string; bookings: number; revenue: number }>();

    for (const booking of facts) {
      const key =
        params.mode === "city"
          ? `${booking.city.toLowerCase()}|${booking.state.toLowerCase()}`
          : booking.zip.toLowerCase();

      const label =
        params.mode === "city"
          ? formatCityLabel(booking.city, booking.state)
          : booking.zip;

      const row = map.get(key) || { label, bookings: 0, revenue: 0 };
      row.bookings += 1;
      row.revenue += booking.totalAmount;
      map.set(key, row);
    }

    return map;
  };

  const currentMap = collect(params.currentFacts);
  const previousMap = collect(params.previousFacts);
  const currentTotalRevenue = params.currentFacts.reduce((sum, booking) => sum + booking.totalAmount, 0);
  const previousTotalRevenue = params.previousFacts.reduce((sum, booking) => sum + booking.totalAmount, 0);

  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const rows: BusinessSalesGeographyInsightRow[] = [];

  for (const key of keys) {
    const current = currentMap.get(key) || { label: "Unknown", bookings: 0, revenue: 0 };
    const previous = previousMap.get(key) || { label: current.label, bookings: 0, revenue: 0 };

    rows.push({
      key,
      label: current.label || previous.label,
      currentRevenue: current.revenue,
      previousRevenue: previous.revenue,
      currentBookings: current.bookings,
      previousBookings: previous.bookings,
      currentAverageBooking: current.bookings > 0 ? current.revenue / current.bookings : 0,
      previousAverageBooking: previous.bookings > 0 ? previous.revenue / previous.bookings : 0,
      currentRevenueSharePct: currentTotalRevenue > 0 ? (current.revenue / currentTotalRevenue) * 100 : 0,
      previousRevenueSharePct: previousTotalRevenue > 0 ? (previous.revenue / previousTotalRevenue) * 100 : 0,
      revenueDeltaPct: percentageDelta(current.revenue, previous.revenue),
    });
  }

  rows.sort((a, b) => b.currentRevenue - a.currentRevenue || a.label.localeCompare(b.label));
  return rows;
}

function concentrationFromCities(rows: BusinessSalesGeographyInsightRow[], topN: number) {
  const totalRevenue = rows.reduce((sum, row) => sum + row.currentRevenue, 0);
  if (totalRevenue <= 0) {
    return 0;
  }

  const topRevenue = [...rows]
    .sort((a, b) => b.currentRevenue - a.currentRevenue)
    .slice(0, topN)
    .reduce((sum, row) => sum + row.currentRevenue, 0);

  return (topRevenue / totalRevenue) * 100;
}

function topBookingsShare(facts: RevenueBookingFact[], topN: number) {
  const totalRevenue = facts.reduce((sum, booking) => sum + booking.totalAmount, 0);
  if (totalRevenue <= 0) {
    return 0;
  }

  const topRevenue = [...facts]
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, topN)
    .reduce((sum, booking) => sum + booking.totalAmount, 0);

  return (topRevenue / totalRevenue) * 100;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function futureBookedRevenueHorizon(params: {
  futureFacts: RevenueBookingFact[];
  asOfDate: Date;
  days: number;
}) {
  const end = new Date(params.asOfDate);
  end.setDate(end.getDate() + params.days);

  const rows = params.futureFacts.filter((booking) => {
    const eventDate = new Date(`${booking.eventDate}T12:00:00`);
    return eventDate > params.asOfDate && eventDate <= end;
  });

  const revenue = rows.reduce((sum, booking) => sum + booking.totalAmount, 0);
  const bookingCount = rows.length;

  return {
    days: params.days,
    bookingCount,
    revenue,
    averageBookingValue: bookingCount > 0 ? revenue / bookingCount : 0,
  };
}

function salesSignalDeltaTitle(metricLabel: string, deltaPct: number | null) {
  if (deltaPct === null) {
    return `${metricLabel}: No comparable baseline`;
  }

  if (Math.abs(deltaPct) < 0.05) {
    return `${metricLabel}: No change`;
  }

  const sign = deltaPct > 0 ? "+" : "";
  return `${metricLabel} ${sign}${deltaPct.toFixed(1)}%`;
}

function salesSignalMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function buildSalesSignals(params: {
  summary: BusinessSalesInsights["summary"];
  cities: BusinessSalesGeographyInsightRow[];
  concentration: BusinessSalesInsights["concentration"];
}) {
  const signals: BusinessSignal[] = [];

  if ((params.summary.revenue.deltaPct || 0) >= 8) {
    signals.push({
      id: "sales-revenue-growth",
      type: "sales-revenue",
      severity: "positive",
      title: salesSignalDeltaTitle("Revenue", params.summary.revenue.deltaPct),
      explanation: `Revenue moved from ${salesSignalMoney(params.summary.revenue.previous)} to ${salesSignalMoney(params.summary.revenue.current)} in the selected event period.`,
      currentValue: params.summary.revenue.current,
      previousValue: params.summary.revenue.previous,
      deltaPct: params.summary.revenue.deltaPct,
    });
  }

  if ((params.summary.revenue.deltaPct || 0) <= -8) {
    signals.push({
      id: "sales-revenue-decline",
      type: "sales-revenue",
      severity: "warning",
      title: salesSignalDeltaTitle("Revenue", params.summary.revenue.deltaPct),
      explanation: `Revenue moved from ${salesSignalMoney(params.summary.revenue.previous)} to ${salesSignalMoney(params.summary.revenue.current)} in the selected event period.`,
      currentValue: params.summary.revenue.current,
      previousValue: params.summary.revenue.previous,
      deltaPct: params.summary.revenue.deltaPct,
    });
  }

  if ((params.summary.averageBooking.deltaPct || 0) <= -8) {
    signals.push({
      id: "sales-average-booking-decline",
      type: "sales-average-booking",
      severity: "warning",
      title: salesSignalDeltaTitle("Average booking", params.summary.averageBooking.deltaPct),
      explanation: `Average booking declined from ${salesSignalMoney(params.summary.averageBooking.previous)} to ${salesSignalMoney(params.summary.averageBooking.current)}.`,
      currentValue: params.summary.averageBooking.current,
      previousValue: params.summary.averageBooking.previous,
      deltaPct: params.summary.averageBooking.deltaPct,
    });
  }

  if ((params.summary.discountedBookingShare.deltaPct || 0) >= 10) {
    signals.push({
      id: "sales-discount-share-increase",
      type: "sales-discount",
      severity: "warning",
      title: salesSignalDeltaTitle("Discounted booking share", params.summary.discountedBookingShare.deltaPct),
      explanation: `Discounted booking share moved from ${params.summary.discountedBookingShare.previous.toFixed(1)}% to ${params.summary.discountedBookingShare.current.toFixed(1)}%.`,
      currentValue: params.summary.discountedBookingShare.current,
      previousValue: params.summary.discountedBookingShare.previous,
      deltaPct: params.summary.discountedBookingShare.deltaPct,
    });
  }

  if ((params.concentration.top3CityShare.current || 0) >= 70) {
    signals.push({
      id: "sales-concentration-high",
      type: "sales-concentration",
      severity: "warning",
      title: `Top 3 cities revenue share ${params.concentration.top3CityShare.current.toFixed(1)}%`,
      explanation: `Top 3 city concentration changed from ${params.concentration.top3CityShare.previous.toFixed(1)}% to ${params.concentration.top3CityShare.current.toFixed(1)}%.`,
      currentValue: params.concentration.top3CityShare.current,
      previousValue: params.concentration.top3CityShare.previous,
      deltaPct: params.concentration.top3CityShare.deltaPct,
    });
  }

  const qualifiedCities = params.cities.filter(
    (row) => Math.max(row.currentBookings, row.previousBookings) >= MIN_GEOGRAPHY_BOOKINGS_FOR_DELTA,
  );

  const topCityGrowth = [...qualifiedCities]
    .filter((row) => row.revenueDeltaPct !== null)
    .sort((a, b) => Number(b.revenueDeltaPct || 0) - Number(a.revenueDeltaPct || 0))[0];

  if (topCityGrowth && Number(topCityGrowth.revenueDeltaPct || 0) >= 12) {
    signals.push({
      id: "sales-city-growth",
      type: "sales-geography",
      severity: "positive",
      title: `${topCityGrowth.label} ${Number(topCityGrowth.revenueDeltaPct || 0).toFixed(1)}%`,
      explanation: `City revenue moved from ${salesSignalMoney(topCityGrowth.previousRevenue)} to ${salesSignalMoney(topCityGrowth.currentRevenue)}.`,
      currentValue: topCityGrowth.currentRevenue,
      previousValue: topCityGrowth.previousRevenue,
      deltaPct: topCityGrowth.revenueDeltaPct,
    });
  }

  const topCityDecline = [...qualifiedCities]
    .filter((row) => row.revenueDeltaPct !== null)
    .sort((a, b) => Number(a.revenueDeltaPct || 0) - Number(b.revenueDeltaPct || 0))[0];

  if (topCityDecline && Number(topCityDecline.revenueDeltaPct || 0) <= -12) {
    signals.push({
      id: "sales-city-decline",
      type: "sales-geography",
      severity: "warning",
      title: `${topCityDecline.label} ${Number(topCityDecline.revenueDeltaPct || 0).toFixed(1)}%`,
      explanation: `City revenue moved from ${salesSignalMoney(topCityDecline.previousRevenue)} to ${salesSignalMoney(topCityDecline.currentRevenue)}.`,
      currentValue: topCityDecline.currentRevenue,
      previousValue: topCityDecline.previousRevenue,
      deltaPct: topCityDecline.revenueDeltaPct,
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: "sales-stable",
      type: "sales",
      severity: "info",
      title: "Sales period is stable",
      explanation: "No sales metrics crossed deterministic signal thresholds in this period.",
    });
  }

  return signals.slice(0, 8);
}

export function calculateBusinessSalesInsights(params: {
  currentBookings: BusinessSalesBooking[];
  previousBookings: BusinessSalesBooking[];
  futureBookings: BusinessSalesBooking[];
  forwardCreatedFutureBookings: BusinessSalesBooking[];
  range: BusinessAnalyticsRange;
  asOfDate?: string;
}): BusinessSalesInsights {
  const currentFacts = parseBookingFacts(params.currentBookings);
  const previousFacts = parseBookingFacts(params.previousBookings);
  const futureFacts = parseBookingFacts(params.futureBookings);

  const currentSummary = summarizeFacts(currentFacts);
  const previousSummary = summarizeFacts(previousFacts);

  const summary: BusinessSalesInsights["summary"] = {
    revenue: buildComparisonMetric(currentSummary.revenue, previousSummary.revenue),
    bookings: buildComparisonMetric(currentSummary.bookingCount, previousSummary.bookingCount),
    averageBooking: buildComparisonMetric(currentSummary.averageBooking, previousSummary.averageBooking),
    discounts: buildComparisonMetric(currentSummary.discounts, previousSummary.discounts),
    discountedBookingShare: buildComparisonMetric(
      currentSummary.discountedBookingShare,
      previousSummary.discountedBookingShare,
    ),
    discountRate: buildComparisonMetric(currentSummary.discountRate, previousSummary.discountRate),
    averageDiscountPerDiscountedBooking: buildComparisonMetric(
      currentSummary.averageDiscountPerDiscountedBooking,
      previousSummary.averageDiscountPerDiscountedBooking,
    ),
    deliveryRevenue: buildComparisonMetric(currentSummary.deliveryRevenue, previousSummary.deliveryRevenue),
    deliveryRevenueShare: buildComparisonMetric(
      currentSummary.deliveryRevenueShare,
      previousSummary.deliveryRevenueShare,
    ),
    medianBookingValue: buildComparisonMetric(
      currentSummary.medianBookingValue,
      previousSummary.medianBookingValue,
    ),
    highValueBookingShare: buildComparisonMetric(
      currentSummary.highValueBookingShare,
      previousSummary.highValueBookingShare,
    ),
  };

  const trend = buildTrendRows({
    currentFacts,
    previousFacts,
    range: params.range,
  });

  const valueBands = buildValueBands(currentFacts);
  const weekdays = buildWeekdayRows(currentFacts);
  const cities = geographyRows({ currentFacts, previousFacts, mode: "city" });
  const zips = geographyRows({ currentFacts, previousFacts, mode: "zip" });

  const growingCities = [...cities]
    .filter((row) => Math.max(row.currentBookings, row.previousBookings) >= MIN_GEOGRAPHY_BOOKINGS_FOR_DELTA)
    .filter((row) => row.revenueDeltaPct !== null && Number(row.revenueDeltaPct) > 0)
    .sort((a, b) => Number(b.revenueDeltaPct || -Infinity) - Number(a.revenueDeltaPct || -Infinity))
    .slice(0, 5);

  const growingKeys = new Set(growingCities.map((row) => row.key));

  const decliningCities = [...cities]
    .filter((row) => Math.max(row.currentBookings, row.previousBookings) >= MIN_GEOGRAPHY_BOOKINGS_FOR_DELTA)
    .filter((row) => row.revenueDeltaPct !== null && Number(row.revenueDeltaPct) < 0)
    .filter((row) => !growingKeys.has(row.key))
    .sort((a, b) => Number(a.revenueDeltaPct || Infinity) - Number(b.revenueDeltaPct || Infinity))
    .slice(0, 5);

  const previousCityRows = geographyRows({
    currentFacts: previousFacts,
    previousFacts: [],
    mode: "city",
  });

  const concentration = {
    topCityShare: buildComparisonMetric(
      concentrationFromCities(cities, 1),
      concentrationFromCities(previousCityRows, 1),
    ),
    top3CityShare: buildComparisonMetric(
      concentrationFromCities(cities, 3),
      concentrationFromCities(previousCityRows, 3),
    ),
    top5CityShare: buildComparisonMetric(
      concentrationFromCities(cities, 5),
      concentrationFromCities(previousCityRows, 5),
    ),
    top10BookingsShare: buildComparisonMetric(
      topBookingsShare(currentFacts, 10),
      topBookingsShare(previousFacts, 10),
    ),
  };

  const asOfDate = params.asOfDate ? new Date(`${params.asOfDate}T12:00:00`) : new Date();
  const rawHorizons = [30, 60, 90].map((days) =>
    futureBookedRevenueHorizon({
      futureFacts,
      asOfDate,
      days,
    }),
  );

  const horizons = rawHorizons.map((row, index) => {
    if (index === 0) {
      return row;
    }

    const previous = rawHorizons[index - 1];

    return {
      ...row,
      bookingCount: Math.max(row.bookingCount, previous.bookingCount),
      revenue: Math.max(row.revenue, previous.revenue),
    };
  });

  const forwardBookingPaceRows = parseBookingFacts(params.forwardCreatedFutureBookings);

  const forwardBookingPace = {
    futureBookingsCreatedCount: forwardBookingPaceRows.length,
    futureRevenueCreated: forwardBookingPaceRows.reduce(
      (sum, booking) => sum + booking.totalAmount,
      0,
    ),
  };

  const opportunityRows = params.currentBookings.filter((booking) => {
    if ((booking as any).archived_at) {
      return false;
    }

    return BUSINESS_PREBOOKING_STATUSES.has(normalizeBusinessStatus((booking as any).status));
  });

  const opportunityAmount = opportunityRows.reduce(
    (sum, booking) => sum + amount((booking as any).total_amount),
    0,
  );

  const opportunityPipeline = {
    count: opportunityRows.length,
    potentialAmount: opportunityAmount > 0 ? opportunityAmount : null,
    statuses: ["quote", "pending_deposit"],
  };

  const cancelledRows = params.currentBookings.filter((booking) => {
    if ((booking as any).archived_at) {
      return false;
    }

    return normalizeBusinessStatus((booking as any).status) === "cancelled";
  });

  const refundedRows = params.currentBookings.filter((booking) => {
    if ((booking as any).archived_at) {
      return false;
    }

    return normalizeBusinessStatus((booking as any).status) === "refunded";
  });

  const relevantStatusRows = params.currentBookings.filter((booking) => {
    if ((booking as any).archived_at) {
      return false;
    }

    const status = normalizeBusinessStatus((booking as any).status);
    return isBusinessRevenueBooking(booking) || BUSINESS_EXCLUDED_BOOKING_STATUSES.has(status);
  });

  const denominator = relevantStatusRows.length;
  const cancellationSnapshot = {
    cancelledCount: cancelledRows.length,
    refundedCount: refundedRows.length,
    cancelledSharePct: denominator > 0 ? (cancelledRows.length / denominator) * 100 : 0,
    refundedSharePct: denominator > 0 ? (refundedRows.length / denominator) * 100 : 0,
  };

  const signals = buildSalesSignals({
    summary,
    cities,
    concentration,
  });

  return {
    summary,
    trend,
    valueBands,
    weekdays,
    cities,
    zips,
    growingCities,
    decliningCities,
    concentration,
    futureBookedRevenue: {
      asOfDate: toIsoDate(asOfDate),
      horizons,
    },
    forwardBookingPace,
    opportunityPipeline,
    cancellationSnapshot,
    thresholds: {
      minGeographyBookingsForDelta: MIN_GEOGRAPHY_BOOKINGS_FOR_DELTA,
      highValueBookingThreshold: HIGH_VALUE_BOOKING_THRESHOLD,
    },
    signals,
  };
}
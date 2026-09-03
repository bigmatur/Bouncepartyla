import { isBusinessRevenueBooking } from "./definitions";
import { percentageDelta } from "./comparisons";
import type {
  BusinessAnalyticsRange,
  BusinessComparisonMetric,
  BusinessCoverageLevel,
  BusinessCustomerAcquisitionSnapshot,
  BusinessCustomerConcentrationSnapshot,
  BusinessCustomerGeographyRow,
  BusinessCustomerInsights,
  BusinessCustomerMixSnapshot,
  BusinessSignal,
} from "./types";

type CustomerBookingRow = {
  id?: unknown;
  customer_id?: unknown;
  status?: unknown;
  archived_at?: unknown;
  created_at?: unknown;
  event_date?: unknown;
  setup_city?: unknown;
  setup_state?: unknown;
  total_amount?: unknown;
};

type CustomerRow = {
  id?: unknown;
  full_name?: unknown;
  name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
};

type BookingLeadRow = {
  booking_id?: unknown;
  source?: unknown;
};

type CrmIdentityRow = {
  customer_id?: unknown;
};

type BookingFact = {
  bookingId: string;
  customerId: string;
  createdDate: string;
  eventDate: string;
  revenue: number;
  city: string;
  state: string;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function amount(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function isoDate(value: unknown) {
  const raw = text(value);
  if (!raw) {
    return "";
  }

  return raw.slice(0, 10);
}

function parseDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(a: string, b: string) {
  const first = parseDate(a);
  const second = parseDate(b);
  if (!first || !second) {
    return null;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return (second.getTime() - first.getTime()) / msPerDay;
}

function isDateInRange(dateValue: string, range: BusinessAnalyticsRange) {
  return dateValue >= range.from && dateValue <= range.to;
}

function quantile(values: number[], percentile: number) {
  if (values.length === 0) {
    return null;
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

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toCoverageLevel(coveragePct: number): BusinessCoverageLevel {
  if (coveragePct >= 95) {
    return "high";
  }

  if (coveragePct >= 80) {
    return "partial";
  }

  return "limited";
}

function toComparisonMetric(current: number, previous: number): BusinessComparisonMetric {
  return {
    current,
    previous,
    deltaPct: percentageDelta(current, previous),
  };
}

function normalizeCity(value: unknown) {
  const city = text(value);
  return city || "Unknown city";
}

function normalizeState(value: unknown) {
  const state = text(value);
  return state || "Unknown state";
}

function bookingFacts(bookings: CustomerBookingRow[]) {
  return bookings
    .filter(isBusinessRevenueBooking)
    .map((booking) => ({
      bookingId: text(booking.id),
      customerId: text(booking.customer_id),
      createdDate: isoDate(booking.created_at),
      eventDate: isoDate(booking.event_date),
      revenue: amount(booking.total_amount),
      city: normalizeCity(booking.setup_city),
      state: normalizeState(booking.setup_state),
    }))
    .filter((row) => Boolean(row.bookingId));
}

function groupByCustomer(facts: BookingFact[]) {
  const map = new Map<string, BookingFact[]>();

  for (const row of facts) {
    if (!row.customerId) {
      continue;
    }

    const queue = map.get(row.customerId) || [];
    queue.push(row);
    map.set(row.customerId, queue);
  }

  return map;
}

function computeFirstDatesByCustomer(facts: BookingFact[]) {
  const grouped = groupByCustomer(facts);
  const firstCreated = new Map<string, string>();
  const firstEvent = new Map<string, string>();

  for (const [customerId, rows] of grouped.entries()) {
    const created = rows
      .map((row) => row.createdDate)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))[0] || "";

    const event = rows
      .map((row) => row.eventDate)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))[0] || "";

    if (created) {
      firstCreated.set(customerId, created);
    }

    if (event) {
      firstEvent.set(customerId, event);
    }
  }

  return {
    firstCreated,
    firstEvent,
    grouped,
  };
}

function computeEventMix(params: {
  eventFacts: BookingFact[];
  range: BusinessAnalyticsRange;
  firstEventByCustomer: Map<string, string>;
}): BusinessCustomerMixSnapshot {
  const identified = params.eventFacts.filter((row) => Boolean(row.customerId));
  const identifiedCustomers = new Set(identified.map((row) => row.customerId));

  const firstEventCustomers = new Set<string>();
  const returningCustomers = new Set<string>();
  let returningRevenue = 0;

  for (const row of identified) {
    const firstEvent = params.firstEventByCustomer.get(row.customerId) || "";

    if (firstEvent && isDateInRange(firstEvent, params.range)) {
      firstEventCustomers.add(row.customerId);
      continue;
    }

    if (firstEvent && firstEvent < params.range.from) {
      returningCustomers.add(row.customerId);
      returningRevenue += row.revenue;
    }
  }

  const identifiedRevenue = identified.reduce((sum, row) => sum + row.revenue, 0);

  return {
    identifiedCustomers: identifiedCustomers.size,
    firstEventCustomers: firstEventCustomers.size,
    returningCustomers: returningCustomers.size,
    returningRevenue,
    returningRevenueSharePct:
      identifiedRevenue > 0 ? (returningRevenue / identifiedRevenue) * 100 : 0,
  };
}

function computeAcquisition(params: {
  createdFacts: BookingFact[];
  range: BusinessAnalyticsRange;
  firstCreatedByCustomer: Map<string, string>;
}): BusinessCustomerAcquisitionSnapshot {
  const identified = params.createdFacts.filter((row) => Boolean(row.customerId));

  const newCustomers = new Set<string>();
  const repeatCustomers = new Set<string>();
  let repeatBookingCount = 0;
  let newRevenue = 0;
  let repeatRevenue = 0;

  for (const row of identified) {
    const firstCreated = params.firstCreatedByCustomer.get(row.customerId) || "";

    if (!firstCreated) {
      continue;
    }

    if (isDateInRange(firstCreated, params.range)) {
      newCustomers.add(row.customerId);
      newRevenue += row.revenue;
      continue;
    }

    if (firstCreated < params.range.from) {
      repeatCustomers.add(row.customerId);
      repeatBookingCount += 1;
      repeatRevenue += row.revenue;
    }
  }

  const identifiedRevenue = identified.reduce((sum, row) => sum + row.revenue, 0);

  return {
    newCustomers: newCustomers.size,
    repeatCustomersBookingInPeriod: repeatCustomers.size,
    revenueFromNewCustomers: newRevenue,
    revenueFromRepeatCustomers: repeatRevenue,
    repeatRevenueSharePct:
      identifiedRevenue > 0 ? (repeatRevenue / identifiedRevenue) * 100 : 0,
    repeatBookingSharePct:
      identified.length > 0 ? (repeatBookingCount / identified.length) * 100 : 0,
  };
}

function customerDisplayName(row: CustomerRow | undefined, customerId: string) {
  if (!row) {
    return `Customer ${customerId.slice(0, 8)}`;
  }

  const full = text(row.full_name || row.name);
  if (full) {
    return full;
  }

  const first = text(row.first_name);
  const last = text(row.last_name);
  const combined = `${first} ${last}`.trim();
  if (combined) {
    return combined;
  }

  return `Customer ${customerId.slice(0, 8)}`;
}

function customerRevenueShare(params: {
  facts: BookingFact[];
  topN: number;
}) {
  const identified = params.facts.filter((row) => Boolean(row.customerId));
  const total = identified.reduce((sum, row) => sum + row.revenue, 0);
  if (total <= 0) {
    return 0;
  }

  const revenueByCustomer = new Map<string, number>();
  for (const row of identified) {
    revenueByCustomer.set(
      row.customerId,
      (revenueByCustomer.get(row.customerId) || 0) + row.revenue,
    );
  }

  const top = [...revenueByCustomer.values()]
    .sort((a, b) => b - a)
    .slice(0, params.topN)
    .reduce((sum, value) => sum + value, 0);

  return (top / total) * 100;
}

function buildSignals(params: {
  confidence: BusinessCustomerInsights["confidence"];
  eventCurrent: BusinessCustomerMixSnapshot;
  eventPrevious: BusinessCustomerMixSnapshot;
  acquisitionCurrent: BusinessCustomerAcquisitionSnapshot;
  acquisitionPrevious: BusinessCustomerAcquisitionSnapshot;
  concentration: BusinessCustomerConcentrationSnapshot;
  repeatBehavior: BusinessCustomerInsights["repeatBehavior"];
}): BusinessSignal[] {
  const signals: BusinessSignal[] = [];

  const repeatShareDelta = percentageDelta(
    params.eventCurrent.returningRevenueSharePct,
    params.eventPrevious.returningRevenueSharePct,
  );

  if (repeatShareDelta !== null && Math.abs(repeatShareDelta) >= 8) {
    signals.push({
      id: "customer-repeat-share-change",
      type: "customer-repeat-share",
      severity: repeatShareDelta > 0 ? "positive" : "warning",
      title: `Returning revenue share ${repeatShareDelta > 0 ? "+" : ""}${repeatShareDelta.toFixed(1)}%`,
      explanation: `Returning revenue share moved from ${params.eventPrevious.returningRevenueSharePct.toFixed(1)}% to ${params.eventCurrent.returningRevenueSharePct.toFixed(1)}%.`,
      currentValue: params.eventCurrent.returningRevenueSharePct,
      previousValue: params.eventPrevious.returningRevenueSharePct,
      deltaPct: repeatShareDelta,
    });
  }

  const newCustomerDelta = percentageDelta(
    params.acquisitionCurrent.newCustomers,
    params.acquisitionPrevious.newCustomers,
  );

  if (newCustomerDelta !== null && Math.abs(newCustomerDelta) >= 12) {
    signals.push({
      id: "customer-acquisition-change",
      type: "customer-acquisition",
      severity: newCustomerDelta > 0 ? "positive" : "warning",
      title: `New customers ${newCustomerDelta > 0 ? "+" : ""}${newCustomerDelta.toFixed(1)}%`,
      explanation: `Newly acquired customers changed from ${params.acquisitionPrevious.newCustomers.toLocaleString("en-US")} to ${params.acquisitionCurrent.newCustomers.toLocaleString("en-US")} based on booking created date.`,
      currentValue: params.acquisitionCurrent.newCustomers,
      previousValue: params.acquisitionPrevious.newCustomers,
      deltaPct: newCustomerDelta,
    });
  }

  if (params.concentration.top5Share.current >= 55) {
    signals.push({
      id: "customer-concentration",
      type: "customer-concentration",
      severity: "warning",
      title: `Top 5 customers share ${params.concentration.top5Share.current.toFixed(1)}%`,
      explanation: `Top 5 customers account for ${params.concentration.top5Share.current.toFixed(1)}% of identified-customer booked revenue.`,
      currentValue: params.concentration.top5Share.current,
      previousValue: params.concentration.top5Share.previous,
      deltaPct: params.concentration.top5Share.deltaPct,
    });
  }

  if (params.repeatBehavior.timeToSecondMedianDays !== null && params.repeatBehavior.timeToSecondMedianDays > 180) {
    signals.push({
      id: "customer-time-to-second",
      type: "customer-repeat-interval",
      severity: "info",
      title: `Median time to second booking ${params.repeatBehavior.timeToSecondMedianDays.toFixed(1)} days`,
      explanation: `Observed across ${params.repeatBehavior.observedCustomers.toLocaleString("en-US")} customers with at least two bookings.`,
      currentValue: params.repeatBehavior.timeToSecondMedianDays,
    });
  }

  if (params.confidence.revenueIdentityCoverage.level === "limited") {
    signals.push({
      id: "customer-identity-coverage-warning",
      type: "customer-identity-coverage",
      severity: "warning",
      title: `Revenue identity coverage ${params.confidence.revenueIdentityCoverage.coveragePct.toFixed(1)}%`,
      explanation: "Customer-linked revenue coverage is limited; repeat metrics should be interpreted with caution.",
      currentValue: params.confidence.revenueIdentityCoverage.coveragePct,
      previousValue: 80,
      deltaPct: params.confidence.revenueIdentityCoverage.coveragePct - 80,
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: "customer-stable",
      type: "customer",
      severity: "info",
      title: "Customer indicators are stable",
      explanation: "No customer metrics crossed deterministic signal thresholds in this period.",
    });
  }

  return signals.slice(0, 8);
}

export function calculateBusinessCustomers(params: {
  range: BusinessAnalyticsRange;
  previousRange: BusinessAnalyticsRange;
  asOfDate: string;
  currentEventBookings: CustomerBookingRow[];
  previousEventBookings: CustomerBookingRow[];
  currentCreatedBookings: CustomerBookingRow[];
  previousCreatedBookings: CustomerBookingRow[];
  customerHistoryBookings: CustomerBookingRow[];
  customers: CustomerRow[];
  currentBookingLeads: BookingLeadRow[];
  crmIdentities: CrmIdentityRow[] | null;
}): BusinessCustomerInsights {
  const currentEventFacts = bookingFacts(params.currentEventBookings)
    .filter((row) => row.eventDate && isDateInRange(row.eventDate, params.range));

  const previousEventFacts = bookingFacts(params.previousEventBookings)
    .filter((row) => row.eventDate && isDateInRange(row.eventDate, params.previousRange));

  const currentCreatedFacts = bookingFacts(params.currentCreatedBookings)
    .filter((row) => row.createdDate && isDateInRange(row.createdDate, params.range));

  const previousCreatedFacts = bookingFacts(params.previousCreatedBookings)
    .filter((row) => row.createdDate && isDateInRange(row.createdDate, params.previousRange));

  const historyFacts = bookingFacts(params.customerHistoryBookings);

  const { firstCreated, firstEvent, grouped } = computeFirstDatesByCustomer(historyFacts);

  const linkedBookings = currentEventFacts.filter((row) => Boolean(row.customerId)).length;
  const totalBookings = currentEventFacts.length;
  const linkedRevenue = currentEventFacts
    .filter((row) => Boolean(row.customerId))
    .reduce((sum, row) => sum + row.revenue, 0);
  const totalRevenue = currentEventFacts.reduce((sum, row) => sum + row.revenue, 0);
  const distinctCustomerIds = new Set(
    currentEventFacts.map((row) => row.customerId).filter(Boolean),
  ).size;

  const bookingCoveragePct = totalBookings > 0 ? (linkedBookings / totalBookings) * 100 : 0;
  const revenueCoveragePct = totalRevenue > 0 ? (linkedRevenue / totalRevenue) * 100 : 0;

  const currentEventBookingMap = new Map(currentEventFacts.map((row) => [row.bookingId, row]));
  const leadSourcesByBooking = new Map<string, Set<string>>();
  for (const lead of params.currentBookingLeads || []) {
    const bookingId = text(lead.booking_id);
    if (!bookingId || !currentEventBookingMap.has(bookingId)) {
      continue;
    }

    const source = text(lead.source).toLowerCase() || "other";
    const queue = leadSourcesByBooking.get(bookingId) || new Set<string>();
    queue.add(source);
    leadSourcesByBooking.set(bookingId, queue);
  }

  const linkedLeadBookingCount = leadSourcesByBooking.size;
  const leadCoveragePct = totalBookings > 0 ? (linkedLeadBookingCount / totalBookings) * 100 : 0;

  const sourceMap = new Map<string, { linkedBookings: number; linkedRevenue: number }>();
  let multiSourceBookingCount = 0;

  for (const [bookingId, sources] of leadSourcesByBooking.entries()) {
    const fact = currentEventBookingMap.get(bookingId);
    if (!fact) {
      continue;
    }

    const normalizedSources = [...sources].sort((a, b) => a.localeCompare(b));
    if (normalizedSources.length > 1) {
      multiSourceBookingCount += 1;
    }

    const primary = normalizedSources[0] || "other";
    const current = sourceMap.get(primary) || { linkedBookings: 0, linkedRevenue: 0 };
    current.linkedBookings += 1;
    current.linkedRevenue += fact.revenue;
    sourceMap.set(primary, current);
  }

  const leadRows = [...sourceMap.entries()]
    .map(([source, row]) => ({
      source,
      linkedBookings: row.linkedBookings,
      linkedRevenue: row.linkedRevenue,
    }))
    .sort((a, b) => b.linkedRevenue - a.linkedRevenue || a.source.localeCompare(b.source));

  const crmCoverage = (() => {
    if (!params.crmIdentities) {
      return null;
    }

    const currentIds = new Set(
      currentEventFacts.map((row) => row.customerId).filter(Boolean),
    );

    const linkedIds = new Set(
      (params.crmIdentities || [])
        .map((row) => text(row.customer_id))
        .filter((customerId) => currentIds.has(customerId)),
    );

    const total = currentIds.size;
    const linked = linkedIds.size;
    const coveragePct = total > 0 ? (linked / total) * 100 : 0;

    return {
      linked,
      total,
      coveragePct,
      level: toCoverageLevel(coveragePct),
    };
  })();

  const confidence: BusinessCustomerInsights["confidence"] = {
    bookingIdentityCoverage: {
      linked: linkedBookings,
      total: totalBookings,
      coveragePct: bookingCoveragePct,
      level: toCoverageLevel(bookingCoveragePct),
    },
    revenueIdentityCoverage: {
      linked: linkedRevenue,
      total: totalRevenue,
      coveragePct: revenueCoveragePct,
      level: toCoverageLevel(revenueCoveragePct),
    },
    leadLinkageCoverage: {
      linked: linkedLeadBookingCount,
      total: totalBookings,
      coveragePct: leadCoveragePct,
      level: toCoverageLevel(leadCoveragePct),
    },
    crmIdentityCoverage: crmCoverage,
  };

  const eventCurrent = computeEventMix({
    eventFacts: currentEventFacts,
    range: params.range,
    firstEventByCustomer: firstEvent,
  });

  const eventPrevious = computeEventMix({
    eventFacts: previousEventFacts,
    range: params.previousRange,
    firstEventByCustomer: firstEvent,
  });

  const acquisitionCurrent = computeAcquisition({
    createdFacts: currentCreatedFacts,
    range: params.range,
    firstCreatedByCustomer: firstCreated,
  });

  const acquisitionPrevious = computeAcquisition({
    createdFacts: previousCreatedFacts,
    range: params.previousRange,
    firstCreatedByCustomer: firstCreated,
  });

  const currentRevenueByCustomer = new Map<string, number>();
  for (const row of currentEventFacts) {
    if (!row.customerId) {
      continue;
    }

    currentRevenueByCustomer.set(
      row.customerId,
      (currentRevenueByCustomer.get(row.customerId) || 0) + row.revenue,
    );
  }

  const customerById = new Map(
    (params.customers || []).map((row) => [text((row as any).id), row]),
  );

  const topCustomers = [...currentRevenueByCustomer.entries()]
    .map(([customerId, currentRevenue]) => {
      const rows = grouped.get(customerId) || [];
      const lifetimeBookedRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
      const lifetimeBookingCount = rows.length;
      const averageBookingValue =
        lifetimeBookingCount > 0 ? lifetimeBookedRevenue / lifetimeBookingCount : 0;

      const createdDates = rows
        .map((row) => row.createdDate)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      const eventDates = rows
        .map((row) => row.eventDate)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      return {
        customerId,
        customerName: customerDisplayName(customerById.get(customerId), customerId),
        lifetimeBookedRevenue,
        lifetimeBookingCount,
        averageBookingValue,
        firstBookingCreatedAt: createdDates[0] || null,
        firstEventDate: eventDates[0] || null,
        mostRecentBookingCreatedAt: createdDates[createdDates.length - 1] || null,
        repeatStatus: lifetimeBookingCount >= 2 ? "repeat" as const : "single" as const,
        currentRevenue,
      };
    })
    .sort(
      (a, b) =>
        b.currentRevenue - a.currentRevenue ||
        b.lifetimeBookedRevenue - a.lifetimeBookedRevenue ||
        a.customerId.localeCompare(b.customerId),
    )
    .slice(0, 15)
    .map(({ currentRevenue: _currentRevenue, ...row }) => row);

  const concentration: BusinessCustomerConcentrationSnapshot = {
    denominatorRevenue: linkedRevenue,
    top1Share: toComparisonMetric(
      customerRevenueShare({ facts: currentEventFacts, topN: 1 }),
      customerRevenueShare({ facts: previousEventFacts, topN: 1 }),
    ),
    top5Share: toComparisonMetric(
      customerRevenueShare({ facts: currentEventFacts, topN: 5 }),
      customerRevenueShare({ facts: previousEventFacts, topN: 5 }),
    ),
    top10Share: toComparisonMetric(
      customerRevenueShare({ facts: currentEventFacts, topN: 10 }),
      customerRevenueShare({ facts: previousEventFacts, topN: 10 }),
    ),
  };

  const createdDiffs: number[] = [];
  const eventDiffs: number[] = [];
  const secondBookingDiffs: number[] = [];
  const secondByCustomer = new Map<string, string>();
  const repeatBehaviorCustomerIds =
    currentRevenueByCustomer.size > 0
      ? [...currentRevenueByCustomer.keys()]
      : [...grouped.keys()];

  for (const customerId of repeatBehaviorCustomerIds) {
    const rows = grouped.get(customerId) || [];
    const createdDates = rows
      .map((row) => row.createdDate)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const eventDates = rows
      .map((row) => row.eventDate)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    if (createdDates.length >= 2) {
      const secondGap = daysBetween(createdDates[0], createdDates[1]);
      if (secondGap !== null && secondGap >= 0) {
        secondBookingDiffs.push(secondGap);
        secondByCustomer.set(customerId, createdDates[1]);
      }

      for (let index = 1; index < createdDates.length; index += 1) {
        const gap = daysBetween(createdDates[index - 1], createdDates[index]);
        if (gap !== null && gap >= 0) {
          createdDiffs.push(gap);
        }
      }
    }

    if (eventDates.length >= 2) {
      for (let index = 1; index < eventDates.length; index += 1) {
        const gap = daysBetween(eventDates[index - 1], eventDates[index]);
        if (gap !== null && gap >= 0) {
          eventDiffs.push(gap);
        }
      }
    }
  }

  const asOf = parseDate(params.asOfDate);
  const repeatWindows = [90, 180, 365].map((days) => {
    if (!asOf) {
      return {
        days,
        eligibleCustomers: 0,
        repeatedWithinWindow: 0,
        repeatRatePct: null,
      };
    }

    let eligibleCustomers = 0;
    let repeatedWithinWindow = 0;

    for (const customerId of repeatBehaviorCustomerIds) {
      const firstDate = firstCreated.get(customerId) || "";
      const first = parseDate(firstDate);
      if (!first) {
        continue;
      }

      const fullObservation = new Date(first);
      fullObservation.setDate(fullObservation.getDate() + days);
      if (fullObservation > asOf) {
        continue;
      }

      eligibleCustomers += 1;

      const secondDate = secondByCustomer.get(customerId) || "";
      if (!secondDate) {
        continue;
      }

      const second = parseDate(secondDate);
      if (!second) {
        continue;
      }

      if (second <= fullObservation) {
        repeatedWithinWindow += 1;
      }
    }

    return {
      days,
      eligibleCustomers,
      repeatedWithinWindow,
      repeatRatePct:
        eligibleCustomers > 0
          ? (repeatedWithinWindow / eligibleCustomers) * 100
          : null,
    };
  });

  const repeatBehavior: BusinessCustomerInsights["repeatBehavior"] = {
    createdIntervalAvgDays: average(createdDiffs),
    createdIntervalMedianDays: quantile(createdDiffs, 0.5),
    eventIntervalAvgDays: average(eventDiffs),
    eventIntervalMedianDays: quantile(eventDiffs, 0.5),
    timeToSecondAvgDays: average(secondBookingDiffs),
    timeToSecondMedianDays: quantile(secondBookingDiffs, 0.5),
    observedCustomers: secondBookingDiffs.length,
    repeatWindows,
  };

  const geographyMap = new Map<string, {
    label: string;
    identifiedCustomers: Set<string>;
    returningCustomers: Set<string>;
    totalRevenue: number;
    returningRevenue: number;
  }>();

  for (const row of currentEventFacts) {
    if (!row.customerId) {
      continue;
    }

    const key = `${row.city.toLowerCase()}|${row.state.toLowerCase()}`;
    const label = `${row.city}, ${row.state}`;
    const entry = geographyMap.get(key) || {
      label,
      identifiedCustomers: new Set<string>(),
      returningCustomers: new Set<string>(),
      totalRevenue: 0,
      returningRevenue: 0,
    };

    entry.identifiedCustomers.add(row.customerId);
    entry.totalRevenue += row.revenue;

    const firstEventDate = firstEvent.get(row.customerId) || "";
    if (firstEventDate && firstEventDate < params.range.from) {
      entry.returningCustomers.add(row.customerId);
      entry.returningRevenue += row.revenue;
    }

    geographyMap.set(key, entry);
  }

  const geography: BusinessCustomerGeographyRow[] = [...geographyMap.entries()]
    .map(([key, row]) => ({
      key,
      label: row.label,
      identifiedCustomers: row.identifiedCustomers.size,
      returningCustomers: row.returningCustomers.size,
      repeatCustomerSharePct:
        row.identifiedCustomers.size > 0
          ? (row.returningCustomers.size / row.identifiedCustomers.size) * 100
          : 0,
      totalRevenue: row.totalRevenue,
      returningRevenue: row.returningRevenue,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue || a.label.localeCompare(b.label))
    .slice(0, 10);

  const signals = buildSignals({
    confidence,
    eventCurrent,
    eventPrevious,
    acquisitionCurrent,
    acquisitionPrevious,
    concentration,
    repeatBehavior,
  });

  return {
    confidence,
    identity: {
      linkedBookings,
      totalBookings,
      linkedRevenue,
      totalRevenue,
      distinctCustomerIds,
      unidentifiedBookings: Math.max(0, totalBookings - linkedBookings),
    },
    eventMix: {
      current: eventCurrent,
      previous: eventPrevious,
    },
    acquisition: {
      current: acquisitionCurrent,
      previous: acquisitionPrevious,
    },
    topCustomers,
    concentration,
    repeatBehavior,
    geography,
    leadSources: {
      coverage: {
        linkedBookings: linkedLeadBookingCount,
        totalBookings,
        coveragePct: leadCoveragePct,
        adequate: leadCoveragePct >= 60,
      },
      rows: leadRows,
      multiSourceBookingCount,
    },
    signals,
  };
}

import "server-only";

import {
  intervalMinutes,
  intersectIntervals,
  mergeIntervals,
  subtractIntervals,
  type Interval,
} from "@/lib/staff-performance/intervals";
import {
  STAFF_PERFORMANCE_TIME_ZONE,
  losAngelesDateTimeToUtc,
  toLosAngelesDateKey,
} from "@/lib/staff-performance/period";
import type {
  BookingItemRow,
  ChecklistItemRow,
  DateRange,
  DriverDirectoryEntry,
  DriverOperationalQuality,
  DriverPerformanceDetail,
  DriverPerformanceMetrics,
  DriverPerformancePageData,
  DriverPerformanceSnapshot,
  ExceptionItem,
  HandoverRow,
  RouteStopRow,
  WorkingEmployeeRow,
  WorkingTimeReport,
} from "@/lib/staff-performance/types";

export const DEFAULT_LATE_TOLERANCE_MINUTES = 10;
export const VERY_LONG_ON_SITE_MINUTES = 120;
export const MAX_DERIVED_TRAVEL_GAP_MINUTES = 180;

function normalizeName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "driver";
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMissingTableOrColumnError(error: any) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42p01" ||
    code === "42703" ||
    code === "pgrst204" ||
    code === "pgrst202" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function isCompletedStatus(status: unknown) {
  const value = String(status || "").toLowerCase();
  return value === "installed" || value === "picked_up" || value === "completed";
}

function isCancelledStatus(status: unknown) {
  return String(status || "").toLowerCase() === "cancelled";
}

function isFailedStatus(status: unknown) {
  return String(status || "").toLowerCase() === "failed";
}

function isDeliveryStop(stop: RouteStopRow) {
  return String(stop.stop_type || "").toLowerCase() === "delivery";
}

function isPickupStop(stop: RouteStopRow) {
  return String(stop.stop_type || "").toLowerCase() === "pickup";
}

function isOperationalStop(stop: RouteStopRow) {
  return isDeliveryStop(stop) || isPickupStop(stop);
}

function isBreakStop(stop: RouteStopRow) {
  return (
    /\bbreak\b/i.test(String(stop.customer_name || "")) ||
    /\bbreak\b/i.test(String(stop.items_summary || "")) ||
    /\bbreak\b/i.test(String(stop.setup_notes || ""))
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: STAFF_PERFORMANCE_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function buildDateSeries(range: DateRange) {
  const values: string[] = [];
  const from = new Date(`${range.from}T12:00:00Z`);
  const to = new Date(`${range.to}T12:00:00Z`);

  while (from.getTime() <= to.getTime()) {
    const year = from.getUTCFullYear();
    const month = String(from.getUTCMonth() + 1).padStart(2, "0");
    const day = String(from.getUTCDate()).padStart(2, "0");
    const key = `${year}-${month}-${day}`;

    values.push(key);
    from.setUTCDate(from.getUTCDate() + 1);
  }

  return values;
}

function clipIntervalToDay(interval: Interval, dayStartMs: number, dayEndMs: number) {
  const startMs = Math.max(interval.startMs, dayStartMs);
  const endMs = Math.min(interval.endMs, dayEndMs);

  if (endMs <= startMs) {
    return null;
  }

  return { startMs, endMs };
}

function dayBoundaryMs(day: string) {
  const start = losAngelesDateTimeToUtc(day, "00:00:00");
  const end = losAngelesDateTimeToUtc(day, "23:59:59");

  if (!start || !end) {
    return null;
  }

  return {
    startMs: start.getTime(),
    endMs: end.getTime() + 999,
  };
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createDriverKey(params: { profileId: string | null; name: string }) {
  if (params.profileId) {
    return `profile-${params.profileId}`;
  }

  return `name-${slugify(params.name)}`;
}

function buildRouteDriverNameSet(stops: RouteStopRow[]) {
  const names = new Set<string>();

  for (const stop of stops) {
    const normalized = normalizeName(stop.driver_name);

    if (normalized) {
      names.add(normalized);
    }
  }

  return names;
}

function isPerformanceDriverEmployee(employee: WorkingEmployeeRow, routeDriverNames: Set<string>) {
  if (String(employee.role || "").toLowerCase() === "driver") {
    return true;
  }

  const normalizedDisplayName = normalizeName(employee.display_name);

  return Boolean(normalizedDisplayName && routeDriverNames.has(normalizedDisplayName));
}

function buildDriverDirectory(
  employees: WorkingEmployeeRow[],
  stops: RouteStopRow[],
  routeDriverNames: Set<string>,
) {
  const directory = new Map<string, DriverDirectoryEntry>();

  for (const employee of employees) {
    if (!isPerformanceDriverEmployee(employee, routeDriverNames)) {
      continue;
    }

    const name = String(employee.display_name || "").trim() || "Driver";
    const profileId = String(employee.profile_id || "").trim() || null;
    const normalizedName = normalizeName(name);

    const entry: DriverDirectoryEntry = {
      driverKey: createDriverKey({ profileId, name }),
      name,
      profileId,
      normalizedName,
    };

    directory.set(entry.driverKey, entry);
  }

  for (const stop of stops) {
    const name = String(stop.driver_name || "").trim();

    if (!name) {
      continue;
    }

    const normalizedName = normalizeName(name);

    const exists = Array.from(directory.values()).find((item) => item.normalizedName === normalizedName);

    if (exists) {
      continue;
    }

    const entry: DriverDirectoryEntry = {
      driverKey: createDriverKey({ profileId: null, name }),
      name,
      profileId: null,
      normalizedName,
    };

    directory.set(entry.driverKey, entry);
  }

  return Array.from(directory.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function isStaleOpenShift(shift: { clock_in_at: string; clock_out_at: string | null }) {
  if (shift.clock_out_at) {
    return false;
  }

  const inAt = parseTimestamp(shift.clock_in_at);

  if (!inAt) {
    return false;
  }

  return inAt.getTime() < Date.now() - 24 * 60 * 60 * 1000;
}

function plannedDateForStop(stop: RouteStopRow, value: string | null | undefined) {
  if (!stop.stop_date) {
    return null;
  }

  return losAngelesDateTimeToUtc(stop.stop_date, value || null);
}

function lateMinutesForStop(stop: RouteStopRow) {
  const arrivedAt = parseTimestamp(stop.arrived_at);

  if (!arrivedAt) {
    return null;
  }

  const planned = plannedDateForStop(stop, stop.scheduled_end_time || stop.scheduled_start_time);

  if (!planned) {
    return null;
  }

  const lateRaw = Math.round((arrivedAt.getTime() - planned.getTime()) / 60000) - DEFAULT_LATE_TOLERANCE_MINUTES;

  return Math.max(0, lateRaw);
}

function stopLink(stopId: string) {
  return `/admin/routes/driver/stops/${encodeURIComponent(stopId)}`;
}

function minuteText(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

function buildMetricAccumulator() {
  return {
    workingMinutes: 0,
    completedStops: 0,
    deliveries: 0,
    pickups: 0,
    onTimeStops: 0,
    lateStops: 0,
    punctualityEligibleStops: 0,
    lateMinutesTotal: 0,
    maxLateMinutes: 0,
    breakMinutes: 0,
    onSiteMinutes: 0,
    onSiteCount: 0,
    deliveryOnSiteMinutes: 0,
    deliveryOnSiteCount: 0,
    pickupOnSiteMinutes: 0,
    pickupOnSiteCount: 0,
    betweenStopsMinutes: 0,
    betweenStopsTransitions: 0,
    betweenStopsCandidates: 0,
    unclassifiedMinutes: 0,
    productsHandled: 0,
    exceptions: 0,
    onSiteCoverageCompletedStops: 0,
    onSiteCoverageEligibleStops: 0,
  };
}

function finalizeMetrics(acc: ReturnType<typeof buildMetricAccumulator>): DriverPerformanceMetrics {
  return {
    workingMinutes: acc.workingMinutes,
    completedStops: acc.completedStops,
    deliveries: acc.deliveries,
    pickups: acc.pickups,
    onTimePercent:
      acc.punctualityEligibleStops > 0
        ? (acc.onTimeStops / acc.punctualityEligibleStops) * 100
        : null,
    onTimeStops: acc.onTimeStops,
    lateStops: acc.lateStops,
    averageLateMinutes: acc.lateStops > 0 ? acc.lateMinutesTotal / acc.lateStops : null,
    maxLateMinutes: acc.lateStops > 0 ? acc.maxLateMinutes : null,
    explicitBreakMinutes: acc.breakMinutes,
    onSiteMinutes: acc.onSiteMinutes,
    averageOnSiteMinutes: acc.onSiteCount > 0 ? acc.onSiteMinutes / acc.onSiteCount : null,
    averageDeliveryOnSiteMinutes:
      acc.deliveryOnSiteCount > 0 ? acc.deliveryOnSiteMinutes / acc.deliveryOnSiteCount : null,
    averagePickupOnSiteMinutes:
      acc.pickupOnSiteCount > 0 ? acc.pickupOnSiteMinutes / acc.pickupOnSiteCount : null,
    onSiteCoverageLabel: `${acc.onSiteCoverageCompletedStops} / ${acc.onSiteCoverageEligibleStops} completed stops`,
    betweenStopsMinutes: acc.betweenStopsCandidates > 0 ? acc.betweenStopsMinutes : null,
    betweenStopsCoverageLabel:
      acc.betweenStopsCandidates > 0
        ? `${acc.betweenStopsTransitions} / ${acc.betweenStopsCandidates} stop transitions`
        : "Insufficient data",
    unclassifiedMinutes: acc.unclassifiedMinutes,
    productsHandled: acc.productsHandled,
    exceptions: acc.exceptions,
  };
}

function buildQualityAccumulator() {
  return {
    requiredDeliveryProofCompleted: 0,
    requiredDeliveryProofUploaded: 0,
    checklistExpectedChecks: 0,
    checklistCompletedChecks: 0,
    requiredDeliverySignatureStops: 0,
    requiredDeliverySignatureCompleted: 0,
    paymentReportEligibleStops: 0,
    paymentReportedStops: 0,
  };
}

function finalizeQuality(acc: ReturnType<typeof buildQualityAccumulator>): DriverOperationalQuality {
  return {
    requiredDeliveryProofCompleted: acc.requiredDeliveryProofCompleted,
    requiredDeliveryProofUploaded: acc.requiredDeliveryProofUploaded,
    checklistExpectedChecks: acc.checklistExpectedChecks,
    checklistCompletedChecks: acc.checklistCompletedChecks,
    requiredDeliverySignatureStops: acc.requiredDeliverySignatureStops,
    requiredDeliverySignatureCompleted: acc.requiredDeliverySignatureCompleted,
    paymentReportEligibleStops: acc.paymentReportEligibleStops,
    paymentReportedStops: acc.paymentReportedStops,
  };
}

function addUniqueException(collection: ExceptionItem[], candidate: ExceptionItem) {
  if (collection.some((item) => item.id === candidate.id)) {
    return;
  }

  collection.push(candidate);
}

function buildDriverDetail(params: {
  driver: DriverDirectoryEntry;
  range: DateRange;
  allDays: string[];
  employee: WorkingEmployeeRow | null;
  stops: RouteStopRow[];
  breakRowsByShiftId: Map<string, Array<{ started_at: string | null; ended_at: string | null; break_type: string | null }>>;
  bookingProducts: Map<string, { totalQuantity: number; categories: Map<string, number> }>;
  bookingChecklistRows: Map<string, ChecklistItemRow[]>;
  bookingHasSignedHandover: Set<string>;
}): DriverPerformanceDetail {
  const acc = buildMetricAccumulator();
  const qualityAcc = buildQualityAccumulator();
  const dayUsage = [] as DriverPerformanceDetail["dayUsage"];
  const dayStops = [] as DriverPerformanceDetail["dayStops"];
  const exceptions: ExceptionItem[] = [];
  const categoryTotals = new Map<string, number>();
  const nowIso = new Date().toISOString();
  const todayBusinessDate = toLosAngelesDateKey(nowIso);

  const shifts = params.employee?.shifts || [];

  const staleShifts = shifts.filter((shift) => isStaleOpenShift(shift));

  for (const staleShift of staleShifts) {
    addUniqueException(exceptions, {
      id: `stale:${staleShift.id}`,
      type: "stale_open_shift",
      dateTime: staleShift.clock_in_at,
      driverName: params.driver.name,
      reference: staleShift.id,
      description: "Open shift has been running longer than 24 hours.",
      href: `/admin/staff/time?from=${encodeURIComponent(params.range.from)}&to=${encodeURIComponent(params.range.to)}`,
    });
  }

  for (const day of params.allDays) {
    const boundary = dayBoundaryMs(day);

    if (!boundary) {
      continue;
    }

    const dayStopsRaw = params.stops.filter((stop) => stop.stop_date === day);
    const dayOperationalStops = dayStopsRaw.filter((stop) => isOperationalStop(stop) && !isBreakStop(stop));

    const workingIntervals = mergeIntervals(
      shifts
        .map((shift) => {
          const start = parseTimestamp(shift.clock_in_at);

          if (!start) {
            return null;
          }

          if (isStaleOpenShift(shift)) {
            return null;
          }

          const end = parseTimestamp(shift.clock_out_at) || new Date();

          if (end.getTime() <= start.getTime()) {
            return null;
          }

          return clipIntervalToDay(
            { startMs: start.getTime(), endMs: end.getTime() },
            boundary.startMs,
            boundary.endMs,
          );
        })
        .filter(Boolean) as Interval[],
    );

    const breakIntervals = mergeIntervals(
      shifts.flatMap((shift) => {
        const rows = params.breakRowsByShiftId.get(shift.id) || [];
        return rows
          .map((row) => {
            const start = parseTimestamp(row.started_at);
            const end = parseTimestamp(row.ended_at) || new Date();

            if (!start || end.getTime() <= start.getTime()) {
              return null;
            }

            const clipped = clipIntervalToDay(
              { startMs: start.getTime(), endMs: end.getTime() },
              boundary.startMs,
              boundary.endMs,
            );

            return clipped;
          })
          .filter(Boolean) as Interval[];
      }),
    );

    const onSiteCandidates = dayOperationalStops
      .map((stop) => {
        const arrived = parseTimestamp(stop.arrived_at);
        const completed = parseTimestamp(stop.completed_at);

        if (!arrived || !completed || completed.getTime() < arrived.getTime()) {
          return null;
        }

        return {
          stop,
          interval: {
            startMs: arrived.getTime(),
            endMs: completed.getTime(),
          },
        };
      })
      .filter(Boolean) as Array<{ stop: RouteStopRow; interval: Interval }>;

    const onSiteIntervals = mergeIntervals(
      intersectIntervals(
        onSiteCandidates.map((item) => item.interval),
        workingIntervals,
      ),
    );

    const sortableOnSite = onSiteCandidates
      .filter((item) => item.stop.stop_date === day)
      .sort((a, b) => a.interval.startMs - b.interval.startMs);

    const betweenStopCandidates: Interval[] = [];

    for (let index = 1; index < sortableOnSite.length; index += 1) {
      const previous = sortableOnSite[index - 1];
      const current = sortableOnSite[index];

      const gapMs = current.interval.startMs - previous.interval.endMs;

      if (gapMs <= 0) {
        continue;
      }

      const gapMinutes = gapMs / 60000;
      acc.betweenStopsCandidates += 1;

      if (gapMinutes > MAX_DERIVED_TRAVEL_GAP_MINUTES) {
        continue;
      }

      const clipped = clipIntervalToDay(
        {
          startMs: previous.interval.endMs,
          endMs: current.interval.startMs,
        },
        boundary.startMs,
        boundary.endMs,
      );

      if (!clipped) {
        continue;
      }

      betweenStopCandidates.push(clipped);
    }

    const betweenAfterWorking = intersectIntervals(mergeIntervals(betweenStopCandidates), workingIntervals);
    const betweenWithoutOnSite = subtractIntervals(betweenAfterWorking, onSiteIntervals);
    const betweenIntervals = subtractIntervals(betweenWithoutOnSite, breakIntervals);

    const classified = mergeIntervals([
      ...breakIntervals,
      ...onSiteIntervals,
      ...betweenIntervals,
    ]);
    const unclassifiedIntervals = subtractIntervals(workingIntervals, classified);

    const workingMinutes = intervalMinutes(workingIntervals);
    const breakMinutes = intervalMinutes(intersectIntervals(breakIntervals, workingIntervals));
    const onSiteMinutes = intervalMinutes(onSiteIntervals);
    const betweenMinutes = intervalMinutes(betweenIntervals);
    const unclassifiedMinutes = intervalMinutes(unclassifiedIntervals);

    const completedDayStops = dayOperationalStops.filter((stop) => isCompletedStatus(stop.status));

    let onSiteCoverageCount = 0;
    let dayProductsHandled = 0;
    let dayExceptionsCount = 0;
    let dayOnTimeStops = 0;
    let dayLateStops = 0;
    let dayPunctualityEligibleStops = 0;

    for (const stop of completedDayStops) {
      if (isDeliveryStop(stop)) {
        acc.deliveries += 1;
      }

      if (isPickupStop(stop)) {
        acc.pickups += 1;
      }

      acc.completedStops += 1;

      const onSitePairValid = Boolean(
        stop.arrived_at &&
          stop.completed_at &&
          parseTimestamp(stop.completed_at)?.getTime() >= (parseTimestamp(stop.arrived_at)?.getTime() || 0),
      );

      if (onSitePairValid) {
        onSiteCoverageCount += 1;
      } else {
        dayExceptionsCount += 1;
        addUniqueException(exceptions, {
          id: `invalid-pair:${stop.id}`,
          type: "invalid_arrival_completion_pair",
          dateTime: stop.completed_at || stop.arrived_at || `${day}T00:00:00.000Z`,
          driverName: params.driver.name,
          reference: stop.id,
          description: "Completed stop is missing a valid arrival-to-completion pair.",
          href: stopLink(stop.id),
        });
      }

      const lateMinutes = lateMinutesForStop(stop);

      if (lateMinutes !== null) {
        dayPunctualityEligibleStops += 1;

        if (lateMinutes > 0) {
          dayLateStops += 1;
          acc.lateStops += 1;
          acc.lateMinutesTotal += lateMinutes;
          acc.maxLateMinutes = Math.max(acc.maxLateMinutes, lateMinutes);
          dayExceptionsCount += 1;

          addUniqueException(exceptions, {
            id: `late:${stop.id}`,
            type: "late_stop",
            dateTime: stop.arrived_at || `${day}T00:00:00.000Z`,
            driverName: params.driver.name,
            reference: stop.id,
            description: `Arrival outside planned window by ${lateMinutes} minutes (includes ${DEFAULT_LATE_TOLERANCE_MINUTES} minute tolerance).`,
            href: stopLink(stop.id),
          });
        } else {
          dayOnTimeStops += 1;
          acc.onTimeStops += 1;
        }
      }

      const productInfo = stop.booking_id ? params.bookingProducts.get(stop.booking_id) : null;

      if (productInfo) {
        dayProductsHandled += productInfo.totalQuantity;

        for (const [category, quantity] of productInfo.categories.entries()) {
          categoryTotals.set(category, (categoryTotals.get(category) || 0) + quantity);
        }
      }

      if (isDeliveryStop(stop) && Boolean(stop.proof_photo_required)) {
        qualityAcc.requiredDeliveryProofCompleted += 1;

        if (Boolean(stop.proof_photo_uploaded)) {
          qualityAcc.requiredDeliveryProofUploaded += 1;
        } else {
          dayExceptionsCount += 1;
          addUniqueException(exceptions, {
            id: `proof:${stop.id}`,
            type: "missing_required_delivery_proof",
            dateTime: stop.completed_at || `${day}T00:00:00.000Z`,
            driverName: params.driver.name,
            reference: stop.id,
            description: "Required delivery proof is missing for a completed stop.",
            href: stopLink(stop.id),
          });
        }
      }

      if (isDeliveryStop(stop)) {
        qualityAcc.requiredDeliverySignatureStops += 1;

        if (stop.booking_id && params.bookingHasSignedHandover.has(stop.booking_id)) {
          qualityAcc.requiredDeliverySignatureCompleted += 1;
        }
      }

      if (isDeliveryStop(stop) && numberValue(stop.balance_due) > 0) {
        qualityAcc.paymentReportEligibleStops += 1;

        if (Boolean(stop.payment_collected)) {
          qualityAcc.paymentReportedStops += 1;
        }
      }

      const checklistRows = stop.booking_id ? params.bookingChecklistRows.get(stop.booking_id) || [] : [];

      if (checklistRows.length > 0) {
        for (const item of checklistRows) {
          if (isDeliveryStop(stop)) {
            qualityAcc.checklistExpectedChecks += 2;
            if (Boolean(item.loaded)) qualityAcc.checklistCompletedChecks += 1;
            if (Boolean(item.installed)) qualityAcc.checklistCompletedChecks += 1;
          }

          if (isPickupStop(stop)) {
            qualityAcc.checklistExpectedChecks += 2;
            if (Boolean(item.picked_up)) qualityAcc.checklistCompletedChecks += 1;
            if (Boolean(item.returned)) qualityAcc.checklistCompletedChecks += 1;
          }
        }
      }

      const validArrived = parseTimestamp(stop.arrived_at);
      const validCompleted = parseTimestamp(stop.completed_at);

      if (validArrived && validCompleted && validCompleted.getTime() >= validArrived.getTime()) {
        const minutes = Math.round((validCompleted.getTime() - validArrived.getTime()) / 60000);

        if (minutes > VERY_LONG_ON_SITE_MINUTES) {
          dayExceptionsCount += 1;
          addUniqueException(exceptions, {
            id: `long-on-site:${stop.id}`,
            type: "very_long_on_site",
            dateTime: stop.completed_at || `${day}T00:00:00.000Z`,
            driverName: params.driver.name,
            reference: stop.id,
            description: `On-site duration is ${minutes} minutes, above ${VERY_LONG_ON_SITE_MINUTES} minutes.`,
            href: stopLink(stop.id),
          });
        }
      }
    }

    for (const stop of dayOperationalStops) {
      const status = String(stop.status || "").toLowerCase();
      const isCompleted = isCompletedStatus(status);
      const isClosed = isCompleted || isCancelledStatus(status) || isFailedStatus(status);

      if (!isClosed && todayBusinessDate && day <= todayBusinessDate) {
        dayExceptionsCount += 1;
        addUniqueException(exceptions, {
          id: `unfinished:${stop.id}`,
          type: "incomplete_route",
          dateTime: stop.created_at || `${day}T00:00:00.000Z`,
          driverName: params.driver.name,
          reference: stop.id,
          description: "Stop is still unfinished for an operational day that has already started.",
          href: stopLink(stop.id),
        });
      }
    }

    const onSiteStopsWithDurations = sortableOnSite.filter((item) => {
      const clipped = clipIntervalToDay(item.interval, boundary.startMs, boundary.endMs);
      return Boolean(clipped);
    });

    const deliveryOnSite = onSiteStopsWithDurations
      .filter((item) => isDeliveryStop(item.stop))
      .map((item) => Math.round((item.interval.endMs - item.interval.startMs) / 60000));

    const pickupOnSite = onSiteStopsWithDurations
      .filter((item) => isPickupStop(item.stop))
      .map((item) => Math.round((item.interval.endMs - item.interval.startMs) / 60000));

    acc.workingMinutes += workingMinutes;
    acc.breakMinutes += breakMinutes;
    acc.onSiteMinutes += onSiteMinutes;
    acc.onSiteCount += onSiteStopsWithDurations.length;
    acc.deliveryOnSiteMinutes += deliveryOnSite.reduce((sum, value) => sum + value, 0);
    acc.deliveryOnSiteCount += deliveryOnSite.length;
    acc.pickupOnSiteMinutes += pickupOnSite.reduce((sum, value) => sum + value, 0);
    acc.pickupOnSiteCount += pickupOnSite.length;
    acc.betweenStopsMinutes += betweenMinutes;
    acc.betweenStopsTransitions += betweenStopCandidates.length;
    acc.unclassifiedMinutes += unclassifiedMinutes;
    acc.productsHandled += dayProductsHandled;
    acc.exceptions += dayExceptionsCount;
    acc.punctualityEligibleStops += dayPunctualityEligibleStops;
    acc.onSiteCoverageEligibleStops += completedDayStops.length;
    acc.onSiteCoverageCompletedStops += onSiteCoverageCount;

    dayUsage.push({
      date: day,
      workingMinutes,
      breakMinutes,
      onSiteMinutes,
      betweenStopsMinutes: betweenMinutes,
      unclassifiedMinutes,
      timingCoverageLabel:
        completedDayStops.length > 0
          ? `Valid timing on ${onSiteCoverageCount}/${completedDayStops.length} completed stops`
          : "No completed stops",
    });

    dayStops.push({
      date: day,
      deliveries: dayOperationalStops.filter((stop) => isDeliveryStop(stop) && isCompletedStatus(stop.status)).length,
      pickups: dayOperationalStops.filter((stop) => isPickupStop(stop) && isCompletedStatus(stop.status)).length,
      completed: dayOperationalStops.filter((stop) => isCompletedStatus(stop.status)).length,
      failed: dayOperationalStops.filter((stop) => isFailedStatus(stop.status)).length,
      cancelled: dayOperationalStops.filter((stop) => isCancelledStatus(stop.status)).length,
      lateStops: dayLateStops,
      onTimeStops: dayOnTimeStops,
      punctualityEligibleStops: dayPunctualityEligibleStops,
      productsHandled: dayProductsHandled,
      exceptions: dayExceptionsCount,
    });
  }

  const metrics = finalizeMetrics(acc);
  const quality = finalizeQuality(qualityAcc);

  const timelineDate = params.allDays[params.allDays.length - 1] || params.range.to;
  const timelineBoundary = dayBoundaryMs(timelineDate);

  let dayTimeline: DriverPerformanceDetail["dayTimeline"] = null;

  if (timelineBoundary) {
    const segments: DriverPerformanceDetail["dayTimeline"]["segments"] = [];
    const dayStopsRaw = params.stops.filter((stop) => stop.stop_date === timelineDate && isOperationalStop(stop));

    const shiftIntervals = mergeIntervals(
      shifts
        .map((shift) => {
          if (isStaleOpenShift(shift)) {
            return null;
          }

          const start = parseTimestamp(shift.clock_in_at);
          const end = parseTimestamp(shift.clock_out_at) || new Date();

          if (!start || end.getTime() <= start.getTime()) {
            return null;
          }

          return clipIntervalToDay(
            { startMs: start.getTime(), endMs: end.getTime() },
            timelineBoundary.startMs,
            timelineBoundary.endMs,
          );
        })
        .filter(Boolean) as Interval[],
    );

    const breakIntervals = mergeIntervals(
      shifts.flatMap((shift) => {
        const rows = params.breakRowsByShiftId.get(shift.id) || [];
        return rows
          .map((row) => {
            const start = parseTimestamp(row.started_at);
            const end = parseTimestamp(row.ended_at) || new Date();

            if (!start || end.getTime() <= start.getTime()) {
              return null;
            }

            return clipIntervalToDay(
              { startMs: start.getTime(), endMs: end.getTime() },
              timelineBoundary.startMs,
              timelineBoundary.endMs,
            );
          })
          .filter(Boolean) as Interval[];
      }),
    );

    const onSiteRaw = dayStopsRaw
      .map((stop) => {
        const arrived = parseTimestamp(stop.arrived_at);
        const completed = parseTimestamp(stop.completed_at);

        if (!arrived || !completed || completed.getTime() < arrived.getTime()) {
          return null;
        }

        const clipped = clipIntervalToDay(
          { startMs: arrived.getTime(), endMs: completed.getTime() },
          timelineBoundary.startMs,
          timelineBoundary.endMs,
        );

        if (!clipped) {
          return null;
        }

        return { stop, interval: clipped };
      })
      .filter(Boolean) as Array<{ stop: RouteStopRow; interval: Interval }>;

    const onSiteIntervals = mergeIntervals(onSiteRaw.map((item) => item.interval));

    const sortedOnSite = [...onSiteRaw].sort((a, b) => a.interval.startMs - b.interval.startMs);
    const betweenRaw: Interval[] = [];

    for (let index = 1; index < sortedOnSite.length; index += 1) {
      const previous = sortedOnSite[index - 1];
      const current = sortedOnSite[index];
      const gapMs = current.interval.startMs - previous.interval.endMs;

      if (gapMs <= 0) continue;
      if (gapMs / 60000 > MAX_DERIVED_TRAVEL_GAP_MINUTES) continue;

      const clipped = clipIntervalToDay(
        { startMs: previous.interval.endMs, endMs: current.interval.startMs },
        timelineBoundary.startMs,
        timelineBoundary.endMs,
      );

      if (clipped) {
        betweenRaw.push(clipped);
      }
    }

    const betweenIntervals = subtractIntervals(
      subtractIntervals(intersectIntervals(mergeIntervals(betweenRaw), shiftIntervals), breakIntervals),
      onSiteIntervals,
    );

    const classified = mergeIntervals([...breakIntervals, ...onSiteIntervals, ...betweenIntervals]);
    const unclassifiedIntervals = subtractIntervals(shiftIntervals, classified);

    for (const interval of shiftIntervals) {
      segments.push({
        kind: "shift",
        startAt: new Date(interval.startMs).toISOString(),
        endAt: new Date(interval.endMs).toISOString(),
        minutes: Math.round((interval.endMs - interval.startMs) / 60000),
        label: "Shift",
      });
    }

    for (const interval of breakIntervals) {
      segments.push({
        kind: "break",
        startAt: new Date(interval.startMs).toISOString(),
        endAt: new Date(interval.endMs).toISOString(),
        minutes: Math.round((interval.endMs - interval.startMs) / 60000),
        label: "Break",
      });
    }

    for (const item of onSiteRaw) {
      segments.push({
        kind: "on_site",
        startAt: new Date(item.interval.startMs).toISOString(),
        endAt: new Date(item.interval.endMs).toISOString(),
        minutes: Math.round((item.interval.endMs - item.interval.startMs) / 60000),
        label: isPickupStop(item.stop) ? "Pickup on-site" : "Delivery on-site",
        stopId: item.stop.id,
        stopType: item.stop.stop_type,
        scheduledStartTime: item.stop.scheduled_start_time,
        scheduledEndTime: item.stop.scheduled_end_time,
        arrivedAt: item.stop.arrived_at,
        completedAt: item.stop.completed_at,
      });
    }

    for (const interval of betweenIntervals) {
      segments.push({
        kind: "between_stops",
        startAt: new Date(interval.startMs).toISOString(),
        endAt: new Date(interval.endMs).toISOString(),
        minutes: Math.round((interval.endMs - interval.startMs) / 60000),
        label: "Between stops",
      });
    }

    for (const interval of unclassifiedIntervals) {
      segments.push({
        kind: "unclassified",
        startAt: new Date(interval.startMs).toISOString(),
        endAt: new Date(interval.endMs).toISOString(),
        minutes: Math.round((interval.endMs - interval.startMs) / 60000),
        label: "Unclassified",
      });
    }

    dayTimeline = {
      date: timelineDate,
      segments: segments.sort((a, b) => a.startAt.localeCompare(b.startAt)),
    };
  }

  const categoryBreakdown = Array.from(categoryTotals.entries())
    .map(([category, quantity]) => ({ category, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  return {
    driver: params.driver,
    metrics,
    quality,
    categoryBreakdown,
    dayUsage,
    dayStops,
    exceptions: exceptions
      .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
      .slice(0, 120),
    dayTimeline,
  };
}

async function loadWorkingTimeReport(supabase: any, range: DateRange) {
  const reportResult = await supabase.rpc("get_working_time_admin_report", {
    p_from: range.from,
    p_to: range.to,
  });

  if (reportResult.error) {
    throw new Error(reportResult.error.message);
  }

  return (reportResult.data || {
    from: range.from,
    to: range.to,
    employees: [],
  }) as WorkingTimeReport;
}

async function loadSnapshot(params: {
  supabase: any;
  range: DateRange;
  selectedDriverKey: string | null;
}): Promise<DriverPerformanceSnapshot> {
  const report = await loadWorkingTimeReport(params.supabase, params.range);

  const routeStopsResult = await params.supabase
    .from("route_stops")
    .select(
      [
        "id",
        "booking_id",
        "stop_date",
        "stop_type",
        "status",
        "driver_name",
        "customer_name",
        "items_summary",
        "setup_notes",
        "scheduled_start_time",
        "scheduled_end_time",
        "arrived_at",
        "completed_at",
        "balance_due",
        "payment_collected",
        "proof_photo_required",
        "proof_photo_uploaded",
        "created_at",
      ].join(","),
    )
    .gte("stop_date", params.range.from)
    .lte("stop_date", params.range.to)
    .order("stop_date", { ascending: true })
    .order("scheduled_start_time", { ascending: true, nullsFirst: false });

  if (routeStopsResult.error) {
    throw new Error(routeStopsResult.error.message);
  }

  const stops = ((routeStopsResult.data || []) as any[]).map((row) => ({
    id: String(row.id),
    booking_id: row.booking_id ? String(row.booking_id) : null,
    stop_date: row.stop_date ? String(row.stop_date) : null,
    stop_type: row.stop_type ? String(row.stop_type) : null,
    status: row.status ? String(row.status) : null,
    driver_name: row.driver_name ? String(row.driver_name) : null,
    customer_name: row.customer_name ? String(row.customer_name) : null,
    items_summary: row.items_summary ? String(row.items_summary) : null,
    setup_notes: row.setup_notes ? String(row.setup_notes) : null,
    scheduled_start_time: row.scheduled_start_time ? String(row.scheduled_start_time) : null,
    scheduled_end_time: row.scheduled_end_time ? String(row.scheduled_end_time) : null,
    arrived_at: row.arrived_at ? String(row.arrived_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    balance_due: row.balance_due == null ? null : numberValue(row.balance_due),
    payment_collected: Boolean(row.payment_collected),
    proof_photo_required: row.proof_photo_required == null ? null : Boolean(row.proof_photo_required),
    proof_photo_uploaded: row.proof_photo_uploaded == null ? null : Boolean(row.proof_photo_uploaded),
    created_at: row.created_at ? String(row.created_at) : null,
  })) as RouteStopRow[];

  const routeDriverNames = buildRouteDriverNameSet(stops);

  const drivers = buildDriverDirectory(report.employees || [], stops, routeDriverNames);
  const allShiftIds = (report.employees || [])
    .filter((employee) => isPerformanceDriverEmployee(employee, routeDriverNames))
    .flatMap((employee) => (employee.shifts || []).map((shift) => String(shift.id || "").trim()))
    .filter(Boolean);

  const bookingIds = Array.from(
    new Set(
      stops
        .map((stop) => stop.booking_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [breakRowsResult, bookingItemsResult, checklistResult, handoverResult, categoriesResult] = await Promise.all([
    allShiftIds.length > 0
      ? params.supabase
          .from("staff_time_breaks")
          .select("time_entry_id, started_at, ended_at, break_type")
          .in("time_entry_id", allShiftIds)
      : Promise.resolve({ data: [], error: null }),

    bookingIds.length > 0
      ? params.supabase
          .from("booking_items")
          .select("booking_id, quantity, products(category_id, name)")
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null }),

    bookingIds.length > 0
      ? params.supabase
          .from("booking_checklist_items")
          .select("booking_id, loaded, installed, picked_up, returned")
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null }),

    bookingIds.length > 0
      ? params.supabase
          .from("handover_documents")
          .select("booking_id, status")
          .in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null }),

    params.supabase.from("categories").select("id, name"),
  ]);

  if (breakRowsResult.error) {
    throw new Error(breakRowsResult.error.message);
  }

  if (bookingItemsResult.error) {
    throw new Error(bookingItemsResult.error.message);
  }

  if (checklistResult.error && !isMissingTableOrColumnError(checklistResult.error)) {
    throw new Error(checklistResult.error.message);
  }

  if (handoverResult.error && !isMissingTableOrColumnError(handoverResult.error)) {
    throw new Error(handoverResult.error.message);
  }

  if (categoriesResult.error && !isMissingTableOrColumnError(categoriesResult.error)) {
    throw new Error(categoriesResult.error.message);
  }

  const categoryNameById = new Map<string, string>();

  for (const row of (categoriesResult.data || []) as any[]) {
    const id = String(row?.id || "").trim();
    const name = String(row?.name || "").trim();

    if (id) {
      categoryNameById.set(id, name || "Uncategorized");
    }
  }

  const breakRowsByShiftId = new Map<string, Array<{ started_at: string | null; ended_at: string | null; break_type: string | null }>>();

  for (const row of (breakRowsResult.data || []) as any[]) {
    const shiftId = String(row?.time_entry_id || "").trim();

    if (!shiftId) {
      continue;
    }

    if (!breakRowsByShiftId.has(shiftId)) {
      breakRowsByShiftId.set(shiftId, []);
    }

    breakRowsByShiftId.get(shiftId)?.push({
      started_at: row?.started_at ? String(row.started_at) : null,
      ended_at: row?.ended_at ? String(row.ended_at) : null,
      break_type: row?.break_type ? String(row.break_type) : null,
    });
  }

  const bookingProducts = new Map<string, { totalQuantity: number; categories: Map<string, number> }>();

  for (const row of ((bookingItemsResult.data || []) as any[])) {
    const bookingId = String(row?.booking_id || "").trim();

    if (!bookingId) {
      continue;
    }

    const quantity = Math.max(0, Math.round(numberValue(row?.quantity || 0)));
    const product = Array.isArray(row?.products) ? row.products[0] || null : row?.products || null;
    const categoryId = String(product?.category_id || "").trim();
    const categoryName = categoryNameById.get(categoryId) || "Uncategorized";

    if (!bookingProducts.has(bookingId)) {
      bookingProducts.set(bookingId, {
        totalQuantity: 0,
        categories: new Map<string, number>(),
      });
    }

    const bucket = bookingProducts.get(bookingId)!;
    bucket.totalQuantity += quantity;
    bucket.categories.set(categoryName, (bucket.categories.get(categoryName) || 0) + quantity);
  }

  const bookingChecklistRows = new Map<string, ChecklistItemRow[]>();

  for (const row of ((checklistResult.data || []) as ChecklistItemRow[])) {
    const bookingId = String(row?.booking_id || "").trim();

    if (!bookingId) {
      continue;
    }

    if (!bookingChecklistRows.has(bookingId)) {
      bookingChecklistRows.set(bookingId, []);
    }

    bookingChecklistRows.get(bookingId)?.push(row);
  }

  const bookingHasSignedHandover = new Set<string>();

  for (const row of ((handoverResult.data || []) as HandoverRow[])) {
    const bookingId = String(row?.booking_id || "").trim();
    const status = String(row?.status || "").toLowerCase();

    if (bookingId && status === "signed") {
      bookingHasSignedHandover.add(bookingId);
    }
  }

  const employeeByDriver = new Map<string, WorkingEmployeeRow>();

  for (const employee of report.employees || []) {
    if (!isPerformanceDriverEmployee(employee, routeDriverNames)) {
      continue;
    }

    const profileKey = String(employee.profile_id || "").trim();
    const nameKey = normalizeName(employee.display_name);

    if (profileKey) {
      employeeByDriver.set(`profile:${profileKey}`, employee);
    }

    if (nameKey) {
      employeeByDriver.set(`name:${nameKey}`, employee);
    }
  }

  const allDays = buildDateSeries(params.range);

  const perDriver = drivers.map((driver) => {
    const employee =
      (driver.profileId ? employeeByDriver.get(`profile:${driver.profileId}`) : null) ||
      employeeByDriver.get(`name:${driver.normalizedName}`) ||
      null;

    const driverStops = stops.filter((stop) => normalizeName(stop.driver_name) === driver.normalizedName);

    return buildDriverDetail({
      driver,
      range: params.range,
      allDays,
      employee,
      stops: driverStops,
      breakRowsByShiftId,
      bookingProducts,
      bookingChecklistRows,
      bookingHasSignedHandover,
    });
  });

  const selectedDriver = params.selectedDriverKey
    ? perDriver.find((driver) => driver.driver.driverKey === params.selectedDriverKey) || null
    : null;

  const teamAccumulator = buildMetricAccumulator();
  const teamQualityAccumulator = buildQualityAccumulator();
  const dayUsageByDate = new Map<string, DriverPerformanceDetail["dayUsage"][number]>();
  const dayStopsByDate = new Map<string, DriverPerformanceDetail["dayStops"][number]>();
  const teamExceptions: ExceptionItem[] = [];
  const categoryTotals = new Map<string, number>();

  for (const detail of perDriver) {
    const metrics = detail.metrics;
    const quality = detail.quality;

    teamAccumulator.workingMinutes += metrics.workingMinutes;
    teamAccumulator.completedStops += metrics.completedStops;
    teamAccumulator.deliveries += metrics.deliveries;
    teamAccumulator.pickups += metrics.pickups;
    teamAccumulator.onTimeStops += metrics.onTimeStops;
    teamAccumulator.lateStops += metrics.lateStops;
    teamAccumulator.punctualityEligibleStops += metrics.onTimeStops + metrics.lateStops;
    teamAccumulator.lateMinutesTotal += (metrics.averageLateMinutes || 0) * metrics.lateStops;
    teamAccumulator.maxLateMinutes = Math.max(teamAccumulator.maxLateMinutes, metrics.maxLateMinutes || 0);
    teamAccumulator.breakMinutes += metrics.explicitBreakMinutes;
    teamAccumulator.onSiteMinutes += metrics.onSiteMinutes;
    const [coverageCompletedRaw, coverageEligibleRaw] = String(
      metrics.onSiteCoverageLabel || "0 / 0 completed stops",
    ).split("/");
    teamAccumulator.onSiteCount += Number(coverageCompletedRaw || 0);
    teamAccumulator.onSiteCoverageCompletedStops += Number(coverageCompletedRaw || 0);
    teamAccumulator.onSiteCoverageEligibleStops += Number((coverageEligibleRaw || "0").split(" ")[0] || 0);
    teamAccumulator.deliveryOnSiteMinutes += (metrics.averageDeliveryOnSiteMinutes || 0) * metrics.deliveries;
    teamAccumulator.deliveryOnSiteCount += metrics.deliveries;
    teamAccumulator.pickupOnSiteMinutes += (metrics.averagePickupOnSiteMinutes || 0) * metrics.pickups;
    teamAccumulator.pickupOnSiteCount += metrics.pickups;
    teamAccumulator.betweenStopsMinutes += metrics.betweenStopsMinutes || 0;
    teamAccumulator.betweenStopsTransitions += metrics.betweenStopsMinutes === null ? 0 : 1;
    teamAccumulator.betweenStopsCandidates += metrics.betweenStopsMinutes === null ? 0 : 1;
    teamAccumulator.unclassifiedMinutes += metrics.unclassifiedMinutes;
    teamAccumulator.productsHandled += metrics.productsHandled;
    teamAccumulator.exceptions += metrics.exceptions;

    teamQualityAccumulator.requiredDeliveryProofCompleted += quality.requiredDeliveryProofCompleted;
    teamQualityAccumulator.requiredDeliveryProofUploaded += quality.requiredDeliveryProofUploaded;
    teamQualityAccumulator.checklistExpectedChecks += quality.checklistExpectedChecks;
    teamQualityAccumulator.checklistCompletedChecks += quality.checklistCompletedChecks;
    teamQualityAccumulator.requiredDeliverySignatureStops += quality.requiredDeliverySignatureStops;
    teamQualityAccumulator.requiredDeliverySignatureCompleted += quality.requiredDeliverySignatureCompleted;
    teamQualityAccumulator.paymentReportEligibleStops += quality.paymentReportEligibleStops;
    teamQualityAccumulator.paymentReportedStops += quality.paymentReportedStops;

    for (const day of detail.dayUsage) {
      if (!dayUsageByDate.has(day.date)) {
        dayUsageByDate.set(day.date, { ...day });
        continue;
      }

      const existing = dayUsageByDate.get(day.date)!;
      existing.workingMinutes += day.workingMinutes;
      existing.breakMinutes += day.breakMinutes;
      existing.onSiteMinutes += day.onSiteMinutes;
      existing.betweenStopsMinutes += day.betweenStopsMinutes;
      existing.unclassifiedMinutes += day.unclassifiedMinutes;
      existing.timingCoverageLabel = "Aggregated across selected drivers";
    }

    for (const day of detail.dayStops) {
      if (!dayStopsByDate.has(day.date)) {
        dayStopsByDate.set(day.date, { ...day });
        continue;
      }

      const existing = dayStopsByDate.get(day.date)!;
      existing.deliveries += day.deliveries;
      existing.pickups += day.pickups;
      existing.completed += day.completed;
      existing.failed += day.failed;
      existing.cancelled += day.cancelled;
      existing.lateStops += day.lateStops;
      existing.onTimeStops += day.onTimeStops;
      existing.punctualityEligibleStops += day.punctualityEligibleStops;
      existing.productsHandled += day.productsHandled;
      existing.exceptions += day.exceptions;
    }

    for (const exception of detail.exceptions) {
      addUniqueException(teamExceptions, exception);
    }

    for (const row of detail.categoryBreakdown) {
      categoryTotals.set(row.category, (categoryTotals.get(row.category) || 0) + row.quantity);
    }
  }

  const teamDayUsage = Array.from(dayUsageByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const teamDayStops = Array.from(dayStopsByDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  const teamCategoryBreakdown = Array.from(categoryTotals.entries())
    .map(([category, quantity]) => ({ category, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  const teamMetrics = finalizeMetrics(teamAccumulator);
  const teamQuality = finalizeQuality(teamQualityAccumulator);

  return {
    period: params.range,
    drivers,
    selectedDriverKey: selectedDriver?.driver.driverKey || null,
    selectedDriverName: selectedDriver?.driver.name || null,
    teamMetrics,
    teamQuality,
    teamDayUsage,
    teamDayStops,
    teamCategoryBreakdown,
    teamExceptions: teamExceptions.sort((a, b) => b.dateTime.localeCompare(a.dateTime)).slice(0, 200),
    perDriver,
  };
}

export async function loadDriverPerformancePageData(params: {
  supabase: any;
  range: DateRange;
  comparisonRange: DateRange | null;
  selectedDriverKey: string | null;
}) : Promise<DriverPerformancePageData> {
  const snapshot = await loadSnapshot({
    supabase: params.supabase,
    range: params.range,
    selectedDriverKey: params.selectedDriverKey,
  });

  const selectedDriver = params.selectedDriverKey
    ? snapshot.perDriver.find((row) => row.driver.driverKey === params.selectedDriverKey) || null
    : null;

  const comparisonSnapshot = params.comparisonRange
    ? await loadSnapshot({
        supabase: params.supabase,
        range: params.comparisonRange,
        selectedDriverKey: params.selectedDriverKey,
      })
    : null;

  const comparisonSelectedDriver = params.selectedDriverKey && comparisonSnapshot
    ? comparisonSnapshot.perDriver.find((row) => row.driver.driverKey === params.selectedDriverKey) || null
    : null;

  const staleShiftCount = snapshot.perDriver.reduce((count, driver) => {
    return count + driver.exceptions.filter((item) => item.type === "stale_open_shift").length;
  }, 0);

  const unlinkedDriverShiftCount = 0;

  const notes = [
    `Late stop threshold uses ${DEFAULT_LATE_TOLERANCE_MINUTES} minute tolerance because no persisted lateness setting exists yet.`,
    `Between Stops is derived from previous completion to next arrival and excludes explicit break overlap where timestamps are available.`,
    "Equipment workload reflects currently available booking and operational records and may change if booking records are edited later.",
  ];

  return {
    snapshot,
    comparisonSnapshot,
    selectedDriver,
    comparisonSelectedDriver,
    staleShiftCount,
    unlinkedDriverShiftCount,
    notes,
  };
}

export function formatDuration(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(Number(minutes))) {
    return "Insufficient data";
  }

  return minuteText(Number(minutes));
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) {
    return "Insufficient data";
  }

  return `${Number(value).toFixed(digits)}%`;
}

export function formatDeltaPoints(current: number | null, previous: number | null) {
  if (current == null || previous == null) {
    return "No comparison";
  }

  const delta = current - previous;

  if (Math.abs(delta) < 0.05) {
    return "0.0 pp";
  }

  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} pp`;
}

export function formatDeltaCount(current: number | null, previous: number | null) {
  if (current == null || previous == null) {
    return "No comparison";
  }

  const delta = current - previous;

  if (delta === 0) {
    return "0";
  }

  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toLocaleString("en-US")}`;
}

export function formatDeltaPercent(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) {
    return "No comparison";
  }

  const delta = ((current - previous) / Math.abs(previous)) * 100;

  if (!Number.isFinite(delta)) {
    return "No comparison";
  }

  if (Math.abs(delta) < 0.05) {
    return "0.0%";
  }

  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

export function formatDateTimeLabel(value: string) {
  return formatDateTime(value);
}

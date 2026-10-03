import type { DateRange, PeriodPreset, ResolvedPeriod } from "@/lib/staff-performance/types";

const LOS_ANGELES_TIME_ZONE = "America/Los_Angeles";
export const MAX_CUSTOM_RANGE_DAYS = 93;

function datePartsInTimeZone(date: Date, timeZone = LOS_ANGELES_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function parseDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDate(date: Date, timeZone = LOS_ANGELES_TIME_ZONE) {
  const parts = datePartsInTimeZone(date, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysBetweenInclusive(from: string, to: string) {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);

  if (!fromDate || !toDate) {
    return null;
  }

  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
}

function startOfMonth(date: Date) {
  const parts = datePartsInTimeZone(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, 1, 12, 0, 0));
}

function endOfMonth(date: Date) {
  const parts = datePartsInTimeZone(date);
  return new Date(Date.UTC(parts.year, parts.month, 0, 12, 0, 0));
}

function labelForPeriod(preset: PeriodPreset, range: DateRange) {
  if (preset === "day") {
    return range.from;
  }

  if (preset === "week") {
    return `${range.from} to ${range.to}`;
  }

  if (preset === "month") {
    return `${range.from.slice(0, 7)}`;
  }

  return `${range.from} to ${range.to}`;
}

function previousEquivalentRange(preset: PeriodPreset, range: DateRange) {
  const fromDate = parseDate(range.from);
  const toDate = parseDate(range.to);

  if (!fromDate || !toDate) {
    return null;
  }

  if (preset === "day") {
    const previous = addDays(fromDate, -1);
    const iso = formatDate(previous);
    return { from: iso, to: iso };
  }

  if (preset === "week") {
    return {
      from: formatDate(addDays(fromDate, -7)),
      to: formatDate(addDays(toDate, -7)),
    };
  }

  if (preset === "month") {
    const previousMonth = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() - 1, 15, 12, 0, 0));
    return {
      from: formatDate(startOfMonth(previousMonth)),
      to: formatDate(endOfMonth(previousMonth)),
    };
  }

  const span = daysBetweenInclusive(range.from, range.to);

  if (!span || span <= 0) {
    return null;
  }

  const previousTo = addDays(fromDate, -1);
  const previousFrom = addDays(previousTo, -(span - 1));

  return {
    from: formatDate(previousFrom),
    to: formatDate(previousTo),
  };
}

export function resolveStaffPerformancePeriod(searchParams: Record<string, string | string[] | undefined> | undefined): ResolvedPeriod {
  const errors: string[] = [];
  const now = new Date();
  const todayIso = formatDate(now);

  const presetRaw = String(searchParams?.period || "week").toLowerCase();
  const preset: PeriodPreset =
    presetRaw === "day" || presetRaw === "week" || presetRaw === "month" || presetRaw === "custom"
      ? presetRaw
      : "week";

  const anchorInput = Array.isArray(searchParams?.anchor) ? searchParams?.anchor[0] : searchParams?.anchor;
  const parsedAnchor = parseDate(anchorInput || todayIso) || parseDate(todayIso)!;
  const anchorDate = formatDate(parsedAnchor);

  let range: DateRange;

  if (preset === "custom") {
    const fromInput = Array.isArray(searchParams?.from) ? searchParams?.from[0] : searchParams?.from;
    const toInput = Array.isArray(searchParams?.to) ? searchParams?.to[0] : searchParams?.to;

    const parsedFrom = parseDate(fromInput);
    const parsedTo = parseDate(toInput);

    if (!parsedFrom || !parsedTo) {
      errors.push("Custom period requires valid From and To dates.");
      range = { from: todayIso, to: todayIso };
    } else {
      const from = formatDate(parsedFrom);
      const to = formatDate(parsedTo);
      const span = daysBetweenInclusive(from, to);

      if (from > to) {
        errors.push("Custom period end date cannot be earlier than start date.");
      }

      if (span && span > MAX_CUSTOM_RANGE_DAYS) {
        errors.push(`Custom period cannot exceed ${MAX_CUSTOM_RANGE_DAYS} days.`);
      }

      range = { from, to };
    }
  } else if (preset === "day") {
    range = { from: anchorDate, to: anchorDate };
  } else if (preset === "week") {
    range = {
      from: formatDate(addDays(parsedAnchor, -6)),
      to: formatDate(parsedAnchor),
    };
  } else {
    range = {
      from: formatDate(startOfMonth(parsedAnchor)),
      to: formatDate(endOfMonth(parsedAnchor)),
    };
  }

  const compareWithPrevious = String(searchParams?.compare || "0") === "1";
  const comparisonRange = compareWithPrevious ? previousEquivalentRange(preset, range) : null;

  return {
    preset,
    range,
    label: labelForPeriod(preset, range),
    anchorDate,
    compareWithPrevious,
    comparisonRange,
    errors,
  };
}

export function shiftResolvedPeriod(period: ResolvedPeriod, direction: "previous" | "next") {
  const fromDate = parseDate(period.range.from);
  const toDate = parseDate(period.range.to);

  if (!fromDate || !toDate) {
    return period;
  }

  const sign = direction === "next" ? 1 : -1;

  if (period.preset === "day") {
    const moved = addDays(fromDate, sign);
    const iso = formatDate(moved);

    return {
      ...period,
      anchorDate: iso,
      range: { from: iso, to: iso },
      label: labelForPeriod("day", { from: iso, to: iso }),
      comparisonRange: period.compareWithPrevious
        ? previousEquivalentRange("day", { from: iso, to: iso })
        : null,
    };
  }

  if (period.preset === "week") {
    const movedTo = addDays(toDate, sign * 7);
    const movedRange = {
      from: formatDate(addDays(movedTo, -6)),
      to: formatDate(movedTo),
    };

    return {
      ...period,
      anchorDate: movedRange.to,
      range: movedRange,
      label: labelForPeriod("week", movedRange),
      comparisonRange: period.compareWithPrevious
        ? previousEquivalentRange("week", movedRange)
        : null,
    };
  }

  if (period.preset === "month") {
    const currentMonthAnchor = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() + sign, 15, 12, 0, 0));
    const movedRange = {
      from: formatDate(startOfMonth(currentMonthAnchor)),
      to: formatDate(endOfMonth(currentMonthAnchor)),
    };

    return {
      ...period,
      anchorDate: movedRange.from,
      range: movedRange,
      label: labelForPeriod("month", movedRange),
      comparisonRange: period.compareWithPrevious
        ? previousEquivalentRange("month", movedRange)
        : null,
    };
  }

  const span = daysBetweenInclusive(period.range.from, period.range.to) || 1;
  const movedRange = {
    from: formatDate(addDays(fromDate, sign * span)),
    to: formatDate(addDays(toDate, sign * span)),
  };

  return {
    ...period,
    range: movedRange,
    label: labelForPeriod("custom", movedRange),
    comparisonRange: period.compareWithPrevious
      ? previousEquivalentRange("custom", movedRange)
      : null,
  };
}

export function periodQueryParams(period: ResolvedPeriod, overrides?: Partial<Record<string, string>>) {
  const params = new URLSearchParams();

  params.set("period", period.preset);

  if (period.preset === "custom") {
    params.set("from", period.range.from);
    params.set("to", period.range.to);
  } else {
    params.set("anchor", period.anchorDate);
  }

  if (period.compareWithPrevious) {
    params.set("compare", "1");
  }

  for (const [key, value] of Object.entries(overrides || {})) {
    if (value === "") {
      params.delete(key);
      continue;
    }

    params.set(key, value);
  }

  return params.toString();
}

export function toBusinessDateLabel(isoDate: string) {
  const parsed = parseDate(isoDate);

  if (!parsed) {
    return isoDate;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: LOS_ANGELES_TIME_ZONE,
  }).format(parsed);
}

export function toLosAngelesDateKey(dateInput: Date | string | null | undefined) {
  if (!dateInput) {
    return null;
  }

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return formatDate(date);
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return asUtc - date.getTime();
}

export function losAngelesDateTimeToUtc(date: string, time: string | null | undefined) {
  const dateMatch = String(date || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  const timeMatch = String(time || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const firstOffset = timeZoneOffsetMs(utcGuess, LOS_ANGELES_TIME_ZONE);
  let result = new Date(utcGuess.getTime() - firstOffset);

  const correctedOffset = timeZoneOffsetMs(result, LOS_ANGELES_TIME_ZONE);

  if (correctedOffset !== firstOffset) {
    result = new Date(utcGuess.getTime() - correctedOffset);
  }

  return result;
}

export const STAFF_PERFORMANCE_TIME_ZONE = LOS_ANGELES_TIME_ZONE;

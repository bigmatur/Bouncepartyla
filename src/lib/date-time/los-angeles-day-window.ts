const LOS_ANGELES_TIME_ZONE = "America/Los_Angeles";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value || "00";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")) % 24,
    minute: Number(value("minute")),
    second: Number(value("second")),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const zoned = getDatePartsInTimeZone(date, timeZone);

  const zonedAsUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second
  );

  return zonedAsUtc - date.getTime();
}

function zonedDateTimeToUtcIso(params: {
  date: string;
  hour: number;
  minute: number;
  second?: number;
  timeZone: string;
}) {
  const [yearRaw, monthRaw, dayRaw] = params.date.split("-");
  const year = Number(yearRaw || 0);
  const month = Number(monthRaw || 1);
  const day = Number(dayRaw || 1);
  const second = Number(params.second || 0);

  const utcGuess = new Date(
    Date.UTC(year, month - 1, day, params.hour, params.minute, second)
  );

  const initialOffset = getTimeZoneOffsetMs(utcGuess, params.timeZone);
  let resolvedUtc = new Date(utcGuess.getTime() - initialOffset);

  const correctedOffset = getTimeZoneOffsetMs(resolvedUtc, params.timeZone);

  if (correctedOffset !== initialOffset) {
    resolvedUtc = new Date(utcGuess.getTime() - correctedOffset);
  }

  return resolvedUtc.toISOString();
}

function addOneDay(date: string) {
  const [yearRaw, monthRaw, dayRaw] = date.split("-");
  const year = Number(yearRaw || 0);
  const month = Number(monthRaw || 1);
  const day = Number(dayRaw || 1);
  const next = new Date(Date.UTC(year, month - 1, day + 1));

  const y = String(next.getUTCFullYear());
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

export function getTodayInLosAngeles(now = new Date()) {
  const parts = getDatePartsInTimeZone(now, LOS_ANGELES_TIME_ZONE);
  const y = String(parts.year);
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

export function isValidIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

export function normalizeLosAngelesDateInput(rawDate: string | undefined) {
  if (!rawDate) {
    return getTodayInLosAngeles();
  }

  const trimmed = String(rawDate).trim();

  if (!isValidIsoDate(trimmed)) {
    return getTodayInLosAngeles();
  }

  return trimmed;
}

export function getLosAngelesDayWindowUtc(date: string) {
  const normalized = normalizeLosAngelesDateInput(date);

  const reservedFrom = zonedDateTimeToUtcIso({
    date: normalized,
    hour: 0,
    minute: 0,
    second: 0,
    timeZone: LOS_ANGELES_TIME_ZONE,
  });

  const reservedUntil = zonedDateTimeToUtcIso({
    date: addOneDay(normalized),
    hour: 0,
    minute: 0,
    second: 0,
    timeZone: LOS_ANGELES_TIME_ZONE,
  });

  return {
    date: normalized,
    reservedFrom,
    reservedUntil,
  };
}

export type TimeFormat = "12h" | "24h";
export type DateFormat = "us" | "eu";

export function formatTime(
  value: string | Date | null | undefined,
  timeFormat: TimeFormat = "12h"
) {
  if (!value) return "";

  const date =
    typeof value === "string"
      ? value.includes("T")
        ? new Date(value)
        : new Date(`2000-01-01T${value}`)
      : value;

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: timeFormat === "12h",
  }).format(date);
}

export function formatDate(
  value: string | Date | null | undefined,
  dateFormat: DateFormat = "us"
) {
  if (!value) return "";

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "";

  const locale = dateFormat === "eu" ? "en-GB" : "en-US";

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  dateFormat: DateFormat = "us",
  timeFormat: TimeFormat = "12h"
) {
  if (!value) return "";

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "";

  return `${formatDate(date, dateFormat)} ${formatTime(date, timeFormat)}`;
}

export function datePlaceholder(dateFormat: DateFormat = "us") {
  return dateFormat === "eu" ? "DD/MM/YYYY" : "MM/DD/YYYY";
}

export function timePlaceholder(timeFormat: TimeFormat = "12h") {
  return timeFormat === "12h" ? "9:00 AM" : "09:00";
}

export function timeInputToDisplay(
  value: string | null | undefined,
  timeFormat: TimeFormat = "12h"
) {
  if (!value) return "";

  return formatTime(value, timeFormat);
}

export function systemLocale(dateFormat: DateFormat = "us") {
  return dateFormat === "eu" ? "en-GB" : "en-US";
}
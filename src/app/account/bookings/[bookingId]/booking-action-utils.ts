type CopyBookingDetailsInput = {
  bookingNumber: string | null;
  setupAddress: string;
  pageUrl: string;
};

type BuildCalendarUrlInput = {
  title: string;
  eventDate: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  setupAddress: string;
  bookingNumber: string | null;
};

async function copyText(value: string) {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");

  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");

  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy failed");
  }
}

export async function copyBookingDetails({
  bookingNumber,
  setupAddress,
  pageUrl,
}: CopyBookingDetailsInput) {
  const lines = [
    bookingNumber
      ? `Booking ${bookingNumber}`
      : "Bounce Party LA booking",
    setupAddress || null,
    pageUrl,
  ].filter(
    (value): value is string => Boolean(value),
  );

  await copyText(lines.join("\n"));
}

export function buildGoogleMapsUrl(
  setupAddress: string,
) {
  if (!setupAddress.trim()) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    setupAddress,
  )}`;
}

function compactCalendarDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function buildCalendarDate(
  dateValue: string,
  timeValue: string | null,
) {
  const safeTime = timeValue || "00:00:00";

  const date = new Date(
    `${dateValue}T${safeTime}`,
  );

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

export function buildGoogleCalendarUrl({
  title,
  eventDate,
  eventStartTime,
  eventEndTime,
  setupAddress,
  bookingNumber,
}: BuildCalendarUrlInput) {
  const start = buildCalendarDate(
    eventDate,
    eventStartTime,
  );

  if (!start) {
    return null;
  }

  const end =
    buildCalendarDate(
      eventDate,
      eventEndTime,
    ) ||
    new Date(start.getTime() + 60 * 60 * 1000);

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${compactCalendarDate(
      start,
    )}/${compactCalendarDate(end)}`,
    details: bookingNumber
      ? `Bounce Party LA booking ${bookingNumber}`
      : "Bounce Party LA booking",
  });

  if (setupAddress) {
    params.set("location", setupAddress);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

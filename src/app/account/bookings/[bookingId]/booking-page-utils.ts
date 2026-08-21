import type {
  BookingDetails,
  BookingPhoto,
  BookingRecord,
} from "./booking-types";

function formatTime(
  value: string | null | undefined,
) {
  if (!value) {
    return null;
  }

  const [hours, minutes] = value.split(":");

  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (
    Number.isNaN(parsedHours) ||
    Number.isNaN(parsedMinutes)
  ) {
    return null;
  }

  const date = new Date();

  date.setHours(
    parsedHours,
    parsedMinutes,
    0,
    0,
  );

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function buildEventTime(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
) {
  const start = formatTime(startTime);
  const end = formatTime(endTime);

  if (start && end) {
    return `${start} – ${end}`;
  }

  return start || end;
}

export function buildSetupAddress(
  booking: Pick<
    BookingRecord,
    | "setup_address"
    | "setup_city"
    | "setup_state"
    | "setup_zip"
  >,
) {
  return [
    booking.setup_address,
    booking.setup_city,
    booking.setup_state,
    booking.setup_zip,
  ]
    .filter(
      (part): part is string =>
        Boolean(part?.trim()),
    )
    .join(", ");
}

function createBookingPhoto(
  type: "setup" | "pickup",
  url: string,
): BookingPhoto {
  return {
    id: `booking-${type}-photo`,
    photo_type: type,
    photo_url: url,
    caption:
      type === "setup"
        ? "Setup photo"
        : "Pickup photo",
    created_at: "",
  };
}

export function buildBookingPhotos(
  details: BookingDetails,
) {
  const bookingPhotos: BookingPhoto[] = [];

  if (details.booking.setup_photo_url) {
    bookingPhotos.push(
      createBookingPhoto(
        "setup",
        details.booking.setup_photo_url,
      ),
    );
  }

  if (details.booking.pickup_photo_url) {
    bookingPhotos.push(
      createBookingPhoto(
        "pickup",
        details.booking.pickup_photo_url,
      ),
    );
  }

  const allPhotos = [
    ...bookingPhotos,
    ...details.photos,
  ];

  return allPhotos.filter(
    (photo, index, photos) =>
      photos.findIndex(
        (candidate) =>
          candidate.photo_url === photo.photo_url,
      ) === index,
  );
}


export function normalizeBookingDetails(
  details: Partial<BookingDetails>,
): BookingDetails {
  return {
    booking: details.booking as BookingDetails["booking"],
    items: Array.isArray(details.items)
      ? details.items
      : [],
    modifiers: Array.isArray(details.modifiers)
      ? details.modifiers
      : [],
    contract:
      details.contract &&
      typeof details.contract === "object"
        ? details.contract
        : null,
    payments: Array.isArray(details.payments)
      ? details.payments
      : [],
    photos: Array.isArray(details.photos)
      ? details.photos
      : [],
    route_stops: Array.isArray(details.route_stops)
      ? details.route_stops
      : [],
  };
}

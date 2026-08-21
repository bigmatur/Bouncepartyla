import type {
  BookingDetails,
  BookingPhoto,
} from "./booking-types";

import {
  buildBookingPhotos,
  buildEventTime,
  buildSetupAddress,
} from "./booking-page-utils";

export type BookingPageModel = {
  heroTitle: string;
  metadataTitle: string;
  eventTime: string | null;
  setupAddress: string;
  photos: BookingPhoto[];
  contract: BookingDetails["contract"];
};

function buildPrimaryTitle(
  details: BookingDetails,
) {
  return (
    details.items[0]?.product_name ||
    details.booking.booking_number ||
    "Your Party"
  );
}

function buildMetadataTitle(
  details: BookingDetails,
  primaryTitle: string,
) {
  const bookingNumber =
    details.booking.booking_number;

  if (
    !bookingNumber ||
    bookingNumber === primaryTitle
  ) {
    return primaryTitle;
  }

  return `${primaryTitle} · ${bookingNumber}`;
}

export function buildBookingPageModel(
  details: BookingDetails,
): BookingPageModel {
  const heroTitle = buildPrimaryTitle(details);

  return {
    heroTitle,
    metadataTitle: buildMetadataTitle(
      details,
      heroTitle,
    ),
    eventTime: buildEventTime(
      details.booking.event_start_time,
      details.booking.event_end_time,
    ),
    setupAddress: buildSetupAddress(
      details.booking,
    ),
    photos: buildBookingPhotos(details),
    contract: details.contract,
  };
}

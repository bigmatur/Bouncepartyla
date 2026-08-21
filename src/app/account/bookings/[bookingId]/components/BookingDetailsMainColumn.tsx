import type { BookingDetails } from "../booking-types";
import type { BookingPageModel } from "../booking-view-model";

import BookingAddOns from "./BookingAddOns";
import BookingDeliveryTracking from "./BookingDeliveryTracking";
import BookingEquipment from "./BookingEquipment";
import BookingNotes from "./BookingNotes";
import BookingPhotos from "./BookingPhotos";
import BookingPreparationCard from "./BookingPreparationCard";
import BookingSafetyCard from "./BookingSafetyCard";

type BookingDetailsMainColumnProps = {
  details: BookingDetails;
  model: BookingPageModel;
};

export default function BookingDetailsMainColumn({
  details,
  model,
}: BookingDetailsMainColumnProps) {
  const { booking } = details;

  const bookingLevelModifiers =
    details.modifiers.filter(
      (modifier) => !modifier.booking_item_id,
    );

  return (
    <div className="order-2 space-y-4 sm:space-y-6 lg:order-1">
      <BookingEquipment
        items={details.items}
        modifiers={details.modifiers}
      />

      {bookingLevelModifiers.length > 0 ? (
        <BookingAddOns
          modifiers={bookingLevelModifiers}
        />
      ) : null}

      <BookingDeliveryTracking
        eventDate={booking.event_date}
        eventStartTime={booking.event_start_time}
        eventEndTime={booking.event_end_time}
        deliveryDate={booking.delivery_date}
        pickupDate={booking.pickup_date}
        deliveryWindowStart={booking.delivery_window_start}
        deliveryWindowEnd={booking.delivery_window_end}
        pickupWindowStart={booking.pickup_window_start}
        pickupWindowEnd={booking.pickup_window_end}
        deliveryStatus={booking.delivery_status}
        pickupStatus={booking.pickup_status}
        setupAddress={model.setupAddress}
        routeStops={details.route_stops}
      />

      <BookingPreparationCard
        venueType={booking.venue_type}
        surfaceType={booking.surface_type}
        generatorRequired={
          booking.generator_required
        }
        powerAvailable={booking.power_available}
      />

      <BookingSafetyCard items={details.items} />

      <BookingPhotos photos={model.photos} />

      <BookingNotes
        notes={booking.customer_notes}
      />
    </div>
  );
}

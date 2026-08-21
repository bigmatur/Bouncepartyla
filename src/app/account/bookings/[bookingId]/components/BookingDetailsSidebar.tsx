import type { BookingDetails } from "../booking-types";
import type { BookingPageModel } from "../booking-view-model";

import BookingContractCard from "./BookingContractCard";
import BookingCountdown from "./BookingCountdown";
import BookingHelpCard from "./BookingHelpCard";
import BookingPayments from "./BookingPayments";
import BookingPriceSummary from "./BookingPriceSummary";
import BookingProgress from "./BookingProgress";

type BookingDetailsSidebarProps = {
  details: BookingDetails;
  model: BookingPageModel;
  adminPreview?: boolean;
};

export default function BookingDetailsSidebar({
  details,
  model,
  adminPreview = false,
}: BookingDetailsSidebarProps) {
  const { booking, payments } = details;

  return (
    <aside className="order-1 flex flex-col gap-4 sm:gap-6 lg:order-2 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1 print:static print:max-h-none print:overflow-visible print:pr-0">
      <div className="order-1">
        <BookingPriceSummary booking={booking} />
      </div>

      <div className="order-3 lg:order-5">
        <BookingPayments booking={booking} payments={payments} />
      </div>

      <div className="order-2 lg:order-4">
        <BookingContractCard
          bookingId={booking.id}
          contract={model.contract}
          fallbackStatus={booking.contract_status}
          adminPreview={adminPreview}
        />
      </div>

      <div className="order-5 lg:order-3">
        <BookingCountdown
          eventDate={booking.event_date}
          eventStartTime={booking.event_start_time}
          bookingStatus={booking.status}
        />
      </div>

      <div className="order-4 lg:order-2">
        <BookingProgress
          bookingStatus={booking.status}
          paymentStatus={booking.payment_status}
          contractStatus={booking.contract_status}
          deliveryStatus={booking.delivery_status}
          pickupStatus={booking.pickup_status}
        />
      </div>

      <div className="order-6">
        <BookingHelpCard bookingNumber={booking.booking_number} />
      </div>
    </aside>
  );
}

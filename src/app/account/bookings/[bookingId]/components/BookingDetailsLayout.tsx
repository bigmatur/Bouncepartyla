import Link from "next/link";

import type { BookingDetails } from "../booking-types";
import type { BookingPageModel } from "../booking-view-model";

import BookingDetailsMainColumn from "./BookingDetailsMainColumn";
import BookingDetailsHeaderActions from "./BookingDetailsHeaderActions";
import BookingDetailsSidebar from "./BookingDetailsSidebar";
import BookingHero from "./BookingHero";
import BookingStatusNotice from "./BookingStatusNotice";
import BookingCompletionPanel from "../complete/BookingCompletionPanel";

type BookingDetailsLayoutProps = {
  details: BookingDetails;
  model: BookingPageModel;
  adminPreview?: boolean;
  completionMode?: boolean;
  completionStatus?: string;
  completionError?: string;
};

export default function BookingDetailsLayout({
  details,
  model,
  adminPreview = false,
  completionMode = false,
  completionStatus,
  completionError,
}: BookingDetailsLayoutProps) {
  const { booking } = details;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-5 sm:py-10">
      <div className="flex items-center justify-between gap-3 print:hidden sm:gap-4">
        <Link
          href={adminPreview ? `/admin/bookings/${booking.id}` : "/account"}
          className="inline-flex items-center gap-2 text-xs font-semibold text-black/55 transition hover:text-black sm:text-sm"
        >
          <span aria-hidden="true">←</span>
          {adminPreview ? "Back to admin booking" : "Back to my bookings"}
        </Link>

        <BookingDetailsHeaderActions
          bookingNumber={booking.booking_number}
          setupAddress={model.setupAddress}
          eventDate={booking.event_date}
          eventStartTime={booking.event_start_time}
          eventEndTime={booking.event_end_time}
          eventTitle={model.heroTitle}
        />
      </div>

      <BookingHero
        booking={booking}
        title={model.heroTitle}
        eventTime={model.eventTime}
        setupAddress={model.setupAddress}
      />

      <BookingStatusNotice
        bookingStatus={booking.status}
        paymentStatus={booking.payment_status}
        balanceDue={booking.balance_due}
        eventDate={booking.event_date}
      />

      {completionMode ? (
        <BookingCompletionPanel
          bookingId={booking.id}
          details={details}
          contractSigned={details.contract?.status === "signed" || booking.contract_status === "signed"}
          depositAmount={Number(booking.deposit_amount || 0)}
          amountPaid={Number(booking.amount_paid || 0)}
          status={completionStatus}
          error={completionError}
        />
      ) : null}

      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <BookingDetailsMainColumn
          details={details}
          model={model}
        />

        <BookingDetailsSidebar
          details={details}
          model={model}
          adminPreview={adminPreview}
        />
      </div>
    </main>
  );
}

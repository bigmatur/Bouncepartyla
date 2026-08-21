import type { CreateBookingItemInput } from "@/lib/booking/createBooking";

export type BookingActor = "customer" | "staff";

export type BookingCompletionStrategy =
  | "customer_contract_and_payment"
  | "staff_send_to_customer";

export type BookingCustomerCommand = {
  customerId?: string;
  authUserId?: string;
  name: string;
  email?: string;
  phone?: string;
};

export type BookingEventCommand = {
  eventDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
  setupAddress?: string;
  setupCity?: string;
  setupState?: string;
  setupZip?: string;
};

export type BookingReservationWindow = {
  reservedFrom: string;
  reservedUntil: string;
};

export type CreateBookingCommand = {
  actor: BookingActor;
  completionStrategy: BookingCompletionStrategy;
  attemptId?: string;
  customer: BookingCustomerCommand;
  event: BookingEventCommand;
  items: CreateBookingItemInput[];
  reservationWindow: BookingReservationWindow;
};

export type BookingEngineResult = {
  booking: any;
  bookingItems?: any[];
  customer?: any;
  reusedExistingBooking: boolean;
};

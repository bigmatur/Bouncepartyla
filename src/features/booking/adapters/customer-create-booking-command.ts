import type { CreateBookingItemInput } from "@/lib/booking/createBooking";
import type { CreateBookingCommand } from "@/features/booking/domain/booking-command";

export function buildCustomerCreateBookingCommand(input: {
  attemptId?: string;
  customerId?: string;
  authUserId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  items: CreateBookingItemInput[];
  eventDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
  setupAddress?: string;
  setupCity?: string;
  setupState?: string;
  setupZip?: string;
  reservedFrom: string;
  reservedUntil: string;
}): CreateBookingCommand {
  return {
    actor: "customer",
    completionStrategy: "customer_contract_and_payment",
    attemptId: input.attemptId,
    customer: {
      customerId: input.customerId,
      authUserId: input.authUserId,
      name: input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
    },
    event: {
      eventDate: input.eventDate,
      eventStartTime: input.eventStartTime,
      eventEndTime: input.eventEndTime,
      setupAddress: input.setupAddress,
      setupCity: input.setupCity,
      setupState: input.setupState,
      setupZip: input.setupZip,
    },
    items: input.items,
    reservationWindow: {
      reservedFrom: input.reservedFrom,
      reservedUntil: input.reservedUntil,
    },
  };
}

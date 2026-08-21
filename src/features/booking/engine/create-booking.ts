import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBooking as createLegacyBooking,
  type CreateBookingInput,
} from "@/lib/booking/createBooking";
import type {
  BookingEngineResult,
  CreateBookingCommand,
} from "@/features/booking/domain/booking-command";

function assertSupportedCompletionStrategy(command: CreateBookingCommand) {
  if (
    command.actor === "customer" &&
    command.completionStrategy !== "customer_contract_and_payment"
  ) {
    throw new Error("Unsupported customer booking completion strategy.");
  }

  if (
    command.actor === "staff" &&
    command.completionStrategy !== "staff_send_to_customer"
  ) {
    throw new Error("Unsupported staff booking completion strategy.");
  }
}

function toLegacyInput(command: CreateBookingCommand): CreateBookingInput {
  return {
    customerId: command.customer.customerId,
    customerAuthUserId: command.customer.authUserId,
    customerName: command.customer.name,
    customerEmail: command.customer.email,
    customerPhone: command.customer.phone,
    bookingAttemptId: command.attemptId,
    items: command.items,
    eventDate: command.event.eventDate,
    eventStartTime: command.event.eventStartTime,
    eventEndTime: command.event.eventEndTime,
    setupAddress: command.event.setupAddress,
    setupCity: command.event.setupCity,
    setupZip: command.event.setupZip,
    reservedFrom: command.reservationWindow.reservedFrom,
    reservedUntil: command.reservationWindow.reservedUntil,
    provisionalCustomerCheckout:
      command.actor === "customer" &&
      command.completionStrategy === "customer_contract_and_payment",
  };
}

export async function executeCreateBooking(params: {
  supabase: SupabaseClient;
  command: CreateBookingCommand;
}): Promise<BookingEngineResult> {
  assertSupportedCompletionStrategy(params.command);

  const result = await createLegacyBooking({
    supabase: params.supabase,
    input: toLegacyInput(params.command),
  });

  return {
    booking: result.booking,
    bookingItems: result.bookingItems,
    customer: result.customer,
    reusedExistingBooking: Boolean(result.reusedExistingBooking),
  };
}

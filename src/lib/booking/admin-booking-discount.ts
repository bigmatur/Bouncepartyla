import type { SupabaseClient } from "@supabase/supabase-js";

import { verifyBookingDiscountPassword } from "@/lib/booking/discount-password";

export type UpdateBookingDiscountInput = {
  supabase: SupabaseClient;
  bookingId: string;
  discountAmount: number;
  discountPassword?: string;
};

export type UpdateBookingDiscountResult = {
  bookingId: string;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  balanceDue: number;
};

function isPaidPaymentStatus(status: unknown) {
  const normalized = String(status || "paid").toLowerCase();

  return (
    normalized === "paid" ||
    normalized === "completed" ||
    normalized === "succeeded"
  );
}

export async function updateBookingDiscountCore(
  input: UpdateBookingDiscountInput,
): Promise<UpdateBookingDiscountResult> {
  const bookingId = String(input.bookingId || "").trim();
  const requestedDiscount = Number(input.discountAmount);
  const discountPassword = String(input.discountPassword || "").trim();

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  if (!Number.isFinite(requestedDiscount)) {
    throw new Error("Discount amount is invalid.");
  }

  const bookingResult = await input.supabase
    .from("bookings")
    .select(
      "id, subtotal, discount_amount, delivery_fee, tax_rate, tax_amount, total_amount, balance_due",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingResult.error) {
    throw new Error(bookingResult.error.message);
  }

  if (!bookingResult.data) {
    throw new Error("Booking not found.");
  }

  const booking = bookingResult.data as any;

  const subtotal = Number(booking.subtotal || 0);
  const currentDiscountAmount = Number(booking.discount_amount || 0);
  const currentTaxAmount = Number(booking.tax_amount || 0);
  const currentTotalAmount = Number(booking.total_amount || 0);
  const currentBalanceDue = Number(booking.balance_due || 0);
  const deliveryFee = Number(booking.delivery_fee || 0);
  const taxRate = Number(booking.tax_rate || 0);

  const discountAmount = Number(
    Math.max(0, Math.min(requestedDiscount, subtotal)).toFixed(2),
  );

  const discountChanged =
    discountAmount.toFixed(2) !== currentDiscountAmount.toFixed(2);

  if (discountChanged) {
    const authorization = await verifyBookingDiscountPassword({
      supabase: input.supabase,
      password: discountPassword,
    });

    if (!authorization.ok) {
      throw new Error(authorization.message);
    }
  }

  const taxableSubtotal = Number(
    Math.max(0, subtotal - discountAmount).toFixed(2),
  );

  const taxAmount = Number(
    ((taxableSubtotal + deliveryFee) * (taxRate / 100)).toFixed(2),
  );

  const totalAmount = Number(
    (taxableSubtotal + deliveryFee + taxAmount).toFixed(2),
  );

  const paymentsResult = await input.supabase
    .from("payments")
    .select("amount, status")
    .eq("booking_id", bookingId);

  if (paymentsResult.error) {
    throw new Error(paymentsResult.error.message);
  }

  const paidAmount = (paymentsResult.data || []).reduce(
    (sum: number, payment: any) =>
      isPaidPaymentStatus(payment.status)
        ? sum + Number(payment.amount || 0)
        : sum,
    0,
  );

  const balanceDue = Number(
    Math.max(0, totalAmount - paidAmount).toFixed(2),
  );

  const bookingUpdateResult = await input.supabase
    .from("bookings")
    .update({
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      balance_due: balanceDue,
    })
    .eq("id", bookingId);

  if (bookingUpdateResult.error) {
    throw new Error(bookingUpdateResult.error.message);
  }

  const routeStopsUpdateResult = await input.supabase
    .from("route_stops")
    .update({
      balance_due: balanceDue,
    })
    .eq("booking_id", bookingId)
    .eq("stop_type", "delivery")
    .not("status", "in", "(cancelled,failed)");

  if (routeStopsUpdateResult.error) {
    const rollbackResult = await input.supabase
      .from("bookings")
      .update({
        discount_amount: currentDiscountAmount,
        tax_amount: currentTaxAmount,
        total_amount: currentTotalAmount,
        balance_due: currentBalanceDue,
      })
      .eq("id", bookingId);

    if (rollbackResult.error) {
      throw new Error(
        `${routeStopsUpdateResult.error.message}. Booking rollback also failed: ${rollbackResult.error.message}`,
      );
    }

    throw new Error(routeStopsUpdateResult.error.message);
  }

  return {
    bookingId,
    discountAmount,
    taxAmount,
    totalAmount,
    balanceDue,
  };
}

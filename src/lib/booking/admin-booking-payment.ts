import type { SupabaseClient } from "@supabase/supabase-js";

import { verifyBookingDiscountPassword } from "@/lib/booking/discount-password";
import { processNotificationQueueBestEffort } from "@/lib/notifications/engine";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";

export type AddBookingPaymentInput = {
  supabase: SupabaseClient;
  bookingId: string;
  amount: number;
  method: string;
  baseAmount?: number;
  tipAmount?: number;
  note?: string;
  discountAmount?: number;
  discountPassword?: string;
  stripeSuccessPath: string;
  stripeCancelPath: string;
};

export type AddBookingPaymentResult = {
  bookingId: string;
  paymentId: string | null;
  method: string;
  amount: number;
  baseAmount: number;
  tipAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  balanceDue: number;
  paidAt: string | null;
  stripeCheckoutUrl: string | null;
};

export async function addBookingPaymentCore(
  input: AddBookingPaymentInput,
): Promise<AddBookingPaymentResult> {
  const bookingId = String(input.bookingId || "").trim();
  const method = String(input.method || "").trim().toLowerCase();
  const amount = Number(input.amount);
  const baseAmount = Math.max(0, Number(input.baseAmount || 0));
  const tipAmount = Math.max(0, Number(input.tipAmount || 0));
  const note = String(input.note || "").trim();
  const discountPassword = String(input.discountPassword || "").trim();

  if (!bookingId) throw new Error("Booking ID is required.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be greater than 0.");
  }
  if (!method) throw new Error("Payment method is required.");

  let paymentId = "";
  let paidAt: string | null = null;

  if (method !== "stripe") {
    paidAt = new Date().toISOString();
    const result = await input.supabase
      .from("payments")
      .insert({
        booking_id: bookingId,
        amount,
        method,
        status: "paid",
        tip_amount: Number(tipAmount.toFixed(2)),
        note: note || null,
        paid_at: paidAt,
      })
      .select("id")
      .single();

    if (result.error) throw new Error(result.error.message);
    paymentId = String((result.data as any)?.id || "");
  }

  const bookingResult = await input.supabase
    .from("bookings")
    .select("id, subtotal, discount_amount, delivery_fee, tax_rate, total_amount, balance_due, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingResult.error || !bookingResult.data) {
    if (paymentId) {
      await input.supabase.from("payments").delete().eq("id", paymentId);
    }
    throw new Error(bookingResult.error?.message || "Booking not found.");
  }

  const booking = bookingResult.data as any;
  const subtotal = Number(booking.subtotal || 0);
  const currentDiscountAmount = Number(booking.discount_amount || 0);
  const deliveryFee = Number(booking.delivery_fee || 0);
  const taxRate = Number(booking.tax_rate || 0);
  const currentTotalAmount = Number(booking.total_amount || 0);
  const currentBalance = Number(booking.balance_due || 0);

  const requestedDiscount =
    input.discountAmount === undefined || input.discountAmount === null
      ? currentDiscountAmount
      : Number(input.discountAmount);

  const discountAmount = Number(
    Math.max(
      0,
      Math.min(
        Number.isFinite(requestedDiscount)
          ? requestedDiscount
          : currentDiscountAmount,
        subtotal,
      ),
    ).toFixed(2),
  );

  const discountChanged =
    currentDiscountAmount.toFixed(2) !== discountAmount.toFixed(2);

  if (discountChanged && discountAmount > 0) {
    const authorization = await verifyBookingDiscountPassword({
      supabase: input.supabase,
      password: discountPassword,
    });

    if (!authorization.ok) {
      if (paymentId) {
        await input.supabase.from("payments").delete().eq("id", paymentId);
      }
      throw new Error(authorization.message);
    }
  }

  const taxableSubtotal = Number((subtotal - discountAmount).toFixed(2));
  const taxAmount = Number(
    ((taxableSubtotal + deliveryFee) * (taxRate / 100)).toFixed(2),
  );
  const totalAmount = Number(
    (taxableSubtotal + deliveryFee + taxAmount).toFixed(2),
  );
  const discountDelta = Number(
    (currentTotalAmount - totalAmount).toFixed(2),
  );
  const balanceAfterDiscount = Number(
    Math.max(0, currentBalance - discountDelta).toFixed(2),
  );

  const appliedBaseAmount = Number(
    Math.max(0, baseAmount > 0 ? baseAmount : amount - tipAmount).toFixed(2),
  );

  const nextBalance =
    method === "stripe"
      ? balanceAfterDiscount
      : Number(
          Math.max(0, balanceAfterDiscount - appliedBaseAmount).toFixed(2),
        );

  const bookingUpdatePayload: Record<string, any> = {
    balance_due: nextBalance,
  };

  if (discountChanged) {
    bookingUpdatePayload.discount_amount = discountAmount;
    bookingUpdatePayload.tax_amount = taxAmount;
    bookingUpdatePayload.total_amount = totalAmount;
  }

  const bookingUpdateResult = await input.supabase
    .from("bookings")
    .update(bookingUpdatePayload)
    .eq("id", bookingId);

  if (bookingUpdateResult.error) {
    if (paymentId) {
      await input.supabase.from("payments").delete().eq("id", paymentId);
    }
    throw new Error(bookingUpdateResult.error.message);
  }

  const routeStopsUpdateResult = await input.supabase
    .from("route_stops")
    .update({ balance_due: nextBalance })
    .eq("booking_id", bookingId)
    .eq("stop_type", "delivery")
    .not("status", "in", "(cancelled,failed)");

  if (routeStopsUpdateResult.error) {
    if (paymentId) {
      await input.supabase.from("payments").delete().eq("id", paymentId);
    }
    await input.supabase
      .from("bookings")
      .update({ balance_due: currentBalance })
      .eq("id", bookingId);
    throw new Error(routeStopsUpdateResult.error.message);
  }

  if (method === "stripe") {
    const session = await createStripeCheckoutSession({
      bookingId,
      amount,
      baseAmount:
        baseAmount > 0 ? baseAmount : Math.max(0, amount - tipAmount),
      tipAmount,
      source: "admin_booking",
      successPath: input.stripeSuccessPath,
      cancelPath: input.stripeCancelPath,
      description: "Bounce Party LA booking payment",
    });

    return {
      bookingId,
      paymentId: null,
      method,
      amount,
      baseAmount: appliedBaseAmount,
      tipAmount,
      discountAmount,
      taxAmount,
      totalAmount,
      balanceDue: nextBalance,
      paidAt: null,
      stripeCheckoutUrl: session.url,
    };
  }

  await processNotificationQueueBestEffort({ bookingId, limit: 20 });

  return {
    bookingId,
    paymentId: paymentId || null,
    method,
    amount,
    baseAmount: appliedBaseAmount,
    tipAmount,
    discountAmount,
    taxAmount,
    totalAmount,
    balanceDue: nextBalance,
    paidAt,
    stripeCheckoutUrl: null,
  };
}

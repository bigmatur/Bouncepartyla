"use server";

import { redirect } from "next/navigation";
import { requireCustomerAccess } from "@/lib/auth/require-customer";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";

export async function payCustomerBookingBalanceByCardAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId") || "").trim();
  if (!bookingId) throw new Error("Booking ID is required.");

  const { supabase, access } = await requireCustomerAccess();
  const result = await supabase
    .from("bookings")
    .select("id, booking_number, balance_due")
    .eq("id", bookingId)
    .maybeSingle();

  if (result.error || !result.data) {
    throw new Error("Booking not found or not available for this customer.");
  }

  const balanceDue = Math.max(0, Number((result.data as any).balance_due || 0));
  if (balanceDue <= 0) {
    redirect(`/account/bookings/${bookingId}`);
  }

  const session = await createStripeCheckoutSession({
    bookingId,
    amount: balanceDue,
    baseAmount: balanceDue,
    tipAmount: 0,
    customerEmail: access.user?.email || null,
    source: "customer_checkout",
    successPath: `/account/bookings/${bookingId}`,
    cancelPath: `/account/bookings/${bookingId}`,
    description: `Bounce Party LA balance ${(result.data as any).booking_number || String(bookingId).slice(0, 8)}`,
  });

  redirect(session.url);
}

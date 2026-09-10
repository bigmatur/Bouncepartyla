import {
  isBusinessRevenueBooking,
  isSuccessfulBusinessPayment,
} from "./definitions";

export type BusinessOverviewBooking = {
  id?: unknown;
  status?: unknown;
  archived_at?: unknown;
  total_amount?: unknown;
  amount_paid?: unknown;
  balance_due?: unknown;
  discount_amount?: unknown;
  delivery_fee?: unknown;
  tax_amount?: unknown;
};

export type BusinessOverviewPayment = {
  id?: unknown;
  status?: unknown;
  amount?: unknown;
  tip_amount?: unknown;
};

export type BusinessOverviewMetrics = {
  bookingCount: number;
  bookedRevenue: number;
  bookingCollected: number;
  bookingOutstanding: number;
  bookingCollectionRate: number;
  collected: number;
  averageBookingValue: number;
  discounts: number;
  deliveryRevenue: number;
  tax: number;
  tips: number;
  paymentCount: number;
};

function amount(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function calculateBusinessOverview(
  bookings: BusinessOverviewBooking[],
  payments: BusinessOverviewPayment[],
): BusinessOverviewMetrics {
  const revenueBookings = bookings.filter(isBusinessRevenueBooking);
  const successfulPayments = payments.filter(isSuccessfulBusinessPayment);

  const bookedRevenue = revenueBookings.reduce(
    (sum, booking) => sum + amount(booking.total_amount),
    0,
  );

  const bookingCollected = revenueBookings.reduce(
    (sum, booking) => sum + Math.max(0, amount(booking.amount_paid)),
    0,
  );

  const bookingOutstanding = revenueBookings.reduce(
    (sum, booking) => sum + Math.max(0, amount(booking.balance_due)),
    0,
  );

  const collected = successfulPayments.reduce(
    (sum, payment) => sum + amount(payment.amount),
    0,
  );

  const discounts = revenueBookings.reduce(
    (sum, booking) => sum + amount(booking.discount_amount),
    0,
  );

  const deliveryRevenue = revenueBookings.reduce(
    (sum, booking) => sum + amount(booking.delivery_fee),
    0,
  );

  const tax = revenueBookings.reduce(
    (sum, booking) => sum + amount(booking.tax_amount),
    0,
  );

  const tips = successfulPayments.reduce(
    (sum, payment) => sum + amount(payment.tip_amount),
    0,
  );

  const bookingCollectionRate =
    bookedRevenue > 0
      ? Math.min(100, (bookingCollected / bookedRevenue) * 100)
      : 0;

  return {
    bookingCount: revenueBookings.length,
    bookedRevenue,
    bookingCollected,
    bookingOutstanding,
    bookingCollectionRate,
    collected,
    averageBookingValue:
      revenueBookings.length > 0
        ? bookedRevenue / revenueBookings.length
        : 0,
    discounts,
    deliveryRevenue,
    tax,
    tips,
    paymentCount: successfulPayments.length,
  };
}
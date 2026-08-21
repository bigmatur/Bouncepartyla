export type BookingItemLike = {
  quantity?: number | string | null;
  products?: any;
  product?: any;
  setup_duration_min?: number | string | null;
  teardown_duration_min?: number | string | null;
};

function getOne<T = any>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function positiveQuantity(
  value: number | string | null | undefined,
) {
  const parsed = Number(value ?? 1);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : 1;
}

function durationMinutes(value: unknown) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : 0;
}

export function bookingItemsProductSummary(
  bookingItems: BookingItemLike[] | null | undefined,
  fallback = "Route stop",
) {
  const names = (
    Array.isArray(bookingItems) ? bookingItems : []
  )
    .map((item) => {
      const product = getOne<any>(item?.products) || getOne<any>(item?.product);
      const name = String(product?.name || "").trim();

      if (!name) {
        return null;
      }

      const quantity = positiveQuantity(item?.quantity);

      return quantity > 1
        ? `${name} ×${quantity}`
        : name;
    })
    .filter(
      (value): value is string => Boolean(value),
    );

  return names.length > 0
    ? names.join(" + ")
    : fallback;
}

export function totalBookingSetupMinutes(
  bookingItems: BookingItemLike[] | null | undefined,
) {
  return (
    Array.isArray(bookingItems) ? bookingItems : []
  ).reduce((total, item) => {
    const product = getOne<any>(item?.products) || getOne<any>(item?.product);

    return (
      total +
      durationMinutes(
        product?.setup_duration_min ?? item?.setup_duration_min,
      ) * positiveQuantity(item?.quantity)
    );
  }, 0);
}

export function totalBookingTeardownMinutes(
  bookingItems: BookingItemLike[] | null | undefined,
) {
  return (
    Array.isArray(bookingItems) ? bookingItems : []
  ).reduce((total, item) => {
    const product = getOne<any>(item?.products) || getOne<any>(item?.product);

    return (
      total +
      durationMinutes(
        product?.teardown_duration_min ?? item?.teardown_duration_min,
      ) * positiveQuantity(item?.quantity)
    );
  }, 0);
}

export function resolveBookingRouteDurations(
  bookingItems: BookingItemLike[] | null | undefined,
  fallback?: {
    setupMinutes?: number | string | null;
    teardownMinutes?: number | string | null;
  },
) {
  const items = Array.isArray(bookingItems) ? bookingItems : [];
  const calculatedSetup = totalBookingSetupMinutes(items);
  const calculatedTeardown = totalBookingTeardownMinutes(items);
  const hasBookingItems = items.length > 0;

  const fallbackSetup = durationMinutes(fallback?.setupMinutes);
  const fallbackTeardown = durationMinutes(fallback?.teardownMinutes);

  return {
    setupMinutes:
      hasBookingItems && calculatedSetup > 0
        ? calculatedSetup
        : fallbackSetup,
    teardownMinutes:
      hasBookingItems && calculatedTeardown > 0
        ? calculatedTeardown
        : fallbackTeardown,
    source: hasBookingItems ? "booking_items" : "route_stop_fallback",
  } as const;
}

import { checkBookingItemAvailabilityAction } from "@/lib/booking/check-booking-item-availability";

export type BookingAvailabilityActor = "customer" | "cashier";

export type BookingAvailabilityItem = {
  productId: string;
  quantity: number;
  selectedModifierGroupOptionIds?: string[];
};

export type BookingAvailabilityResult = {
  productId: string;
  quantity: number;
  reservedFrom: string;
  reservedUntil: string;
  components: any[];
};

export async function validateBookingItemsAvailability(params: {
  items: BookingAvailabilityItem[];
  eventDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
  bookingActor: BookingAvailabilityActor;
}): Promise<BookingAvailabilityResult[]> {
  const results: BookingAvailabilityResult[] = [];

  for (const item of params.items) {
    const productId = String(item.productId || "").trim();
    const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));

    if (!productId) {
      throw new Error("A selected product is missing its product ID.");
    }

    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("quantity", String(quantity));
    formData.set("eventDate", params.eventDate);
    formData.set("eventStartTime", params.eventStartTime || "");
    formData.set("eventEndTime", params.eventEndTime || "");
    formData.set("bookingActor", params.bookingActor);

    for (const optionId of Array.from(
      new Set(
        (item.selectedModifierGroupOptionIds || [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    )) {
      formData.append("selectedModifierGroupOptionIds", optionId);
    }

    const result = await checkBookingItemAvailabilityAction(formData);

    if (!result.available) {
      throw new Error(
        String(
          result.message ||
            "A selected product is not available for the selected date and time.",
        ),
      );
    }

    const reservedFrom = String(result.reservedFrom || "").trim();
    const reservedUntil = String(result.reservedUntil || "").trim();

    if (!reservedFrom || !reservedUntil) {
      throw new Error("Failed to calculate the inventory reservation window.");
    }

    results.push({
      productId,
      quantity,
      reservedFrom,
      reservedUntil,
      components: Array.isArray(result.components) ? result.components : [],
    });
  }

  return results;
}

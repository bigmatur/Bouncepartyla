import type {
  DeliveryCalculationInput,
  DeliveryCalculationResult,
} from "@/types/pricing";

type DeliveryZone = {
  id: string;
  zip: string | null;
  city: string | null;
  base_fee: number;
  free_delivery_min_order: number | null;
  active: boolean;
};

export function calculateDeliveryFromZones(
  input: DeliveryCalculationInput,
  zones: DeliveryZone[]
): DeliveryCalculationResult {
  const zip = input.zip.trim();
  const city = input.city.trim().toLowerCase();

  const matchedZone =
    zones.find((zone) => zone.zip === zip && zone.active) ||
    zones.find(
      (zone) =>
        zone.city?.toLowerCase() === city &&
        zone.active
    );

  if (!matchedZone) {
    return {
      deliveryFee: 0,
      source: "fallback",
      warning: "Delivery zone not found. Manual delivery fee required.",
    };
  }

  let deliveryFee = Number(matchedZone.base_fee || 0);

  if (
    matchedZone.free_delivery_min_order &&
    input.subtotal >= matchedZone.free_delivery_min_order
  ) {
    deliveryFee = 0;
  }

  return {
    deliveryFee,
    source: "zone",
    zoneId: matchedZone.id,
  };
}
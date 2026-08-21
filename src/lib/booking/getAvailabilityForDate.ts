import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailabilityResult } from "@/types/availability";
import { checkProductsAvailability } from "./availability";
import { getAvailabilityData } from "./getAvailabilityData";

export async function getAvailabilityForDate(params: {
  supabase: SupabaseClient;
  reservedFrom: string;
  reservedUntil: string;
  quantity?: number;
}): Promise<AvailabilityResult[]> {
  const quantity = params.quantity ?? 1;

  const data = await getAvailabilityData({
    supabase: params.supabase,
    reservedFrom: params.reservedFrom,
    reservedUntil: params.reservedUntil,
  });

  return checkProductsAvailability({
    products: data.products,
    input: {
      quantity,
      reservedFrom: params.reservedFrom,
      reservedUntil: params.reservedUntil,
    },
    recipes: data.recipes,
    units: data.units,
    reservations: data.reservations,
  });
}
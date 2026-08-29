"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cleanupExpiredCustomerCheckoutHoldsBestEffort } from "@/lib/booking/inventory-integrity";
import {
  checkBookingItemAvailabilityCore,
  getAdminInventorySnapshotCore,
} from "@/lib/booking/booking-availability-core";

export async function checkBookingItemAvailabilityAction(
  formData: FormData,
) {
  const supabase = await createClient();

  // Safety net only. If cleanup fails, availability still continues.
  await cleanupExpiredCustomerCheckoutHoldsBestEffort(
    supabase as any,
    25,
  );

  return checkBookingItemAvailabilityCore(
    supabase,
    formData,
  );
}

export async function checkPublicBookingItemAvailabilityAction(
  formData: FormData,
) {
  const supabase = createServiceClient();

  // Opportunistic integrity repair before calculating availability.
  // Only expired customer_self_service unpaid holds are eligible.
  // Admin-created bookings can never match the cleanup RPC filter.
  await cleanupExpiredCustomerCheckoutHoldsBestEffort(
    supabase as any,
    25,
  );

  const safeFormData = new FormData();

  safeFormData.set(
    "productId",
    String(formData.get("productId") || "").trim(),
  );

  safeFormData.set(
    "quantity",
    "1",
  );

  safeFormData.set(
    "eventDate",
    String(formData.get("eventDate") || "").trim(),
  );

  safeFormData.set(
    "eventStartTime",
    String(formData.get("eventStartTime") || "").trim(),
  );

  safeFormData.set(
    "eventEndTime",
    String(formData.get("eventEndTime") || "").trim(),
  );

  safeFormData.set(
    "bookingActor",
    "customer",
  );

  safeFormData.set(
    "modifierCount",
    "0",
  );

  const result =
    await checkBookingItemAvailabilityCore(
      supabase,
      safeFormData,
    );

  if (!result?.available) {
    console.info(
      "[public-availability] unavailable",
      {
        productId:
          String(formData.get("productId") || ""),
        eventDate:
          String(formData.get("eventDate") || ""),
        eventStartTime:
          String(formData.get("eventStartTime") || ""),
        eventEndTime:
          String(formData.get("eventEndTime") || ""),
        internalMessage:
          result?.message || null,
        missingComponents:
          Array.isArray(result?.missingComponents)
            ? result.missingComponents.map((item: any) => ({
                componentName: item?.componentName || null,
                inventoryItemName: item?.inventoryItemName || null,
                quantityNeeded: item?.quantityNeeded ?? null,
                quantityAvailable: item?.quantityAvailable ?? null,
                reason: item?.reason || null,
              }))
            : [],
      },
    );
  }

  return {
    available:
      Boolean(result?.available),
    message:
      result?.available
        ? "Available for the selected date and time."
        : "Not available for the selected date and time.",
  };
}

export async function getAdminInventorySnapshotAction(
  formData: FormData,
) {
  const supabase = await createClient();

  return getAdminInventorySnapshotCore(
    supabase,
    formData,
  );
}

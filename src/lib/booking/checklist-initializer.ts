import { initializeBookingChecklistFromReservationsInsertOnly } from "@/lib/booking/operational-equipment";

export type ChecklistInitOutcome =
  | {
      ok: true;
      reason: "initialized";
      payload: unknown;
    }
  | {
      ok: false;
      reason: "rpc_unavailable" | "rpc_error" | "rpc_unsuccessful_payload";
      details: unknown;
    };

export async function runChecklistInitializationBestEffort(params: {
  supabase: any;
  bookingId: string;
  context: {
    completionStrategy: "staff_complete_now" | "staff_send_to_customer";
    status: string;
    source: "admin_new_booking" | "mobile_admin_new_booking";
  };
}) {
  const { supabase, bookingId, context } = params;

  try {
    const checklistInitResult =
      await initializeBookingChecklistFromReservationsInsertOnly({
        supabase,
        bookingId,
      });

    if (checklistInitResult.status === "unavailable") {
      const details = {
        bookingId,
        reason: "rpc_unavailable",
        context,
      };

      console.error("Checklist initialization unavailable", details);

      return {
        ok: false,
        reason: "rpc_unavailable",
        details,
      } satisfies ChecklistInitOutcome;
    }

    if (checklistInitResult.status === "failed") {
      const details = {
        bookingId,
        reason: "rpc_unsuccessful_payload",
        payload: checklistInitResult.payload || null,
        context,
      };

      console.error("Checklist initialization returned failed payload", details);

      return {
        ok: false,
        reason: "rpc_unsuccessful_payload",
        details,
      } satisfies ChecklistInitOutcome;
    }

    const payload = checklistInitResult.payload;
    const initSuccess =
      payload &&
      typeof payload === "object" &&
      (payload as any).success === true;

    if (!initSuccess) {
      const details = {
        bookingId,
        reason: "rpc_unsuccessful_payload",
        payload: payload || null,
        context,
      };

      console.error("Checklist initialization returned unsuccessful payload", details);

      return {
        ok: false,
        reason: "rpc_unsuccessful_payload",
        details,
      } satisfies ChecklistInitOutcome;
    }

    return {
      ok: true,
      reason: "initialized",
      payload,
    } satisfies ChecklistInitOutcome;
  } catch (error) {
    const details = {
      bookingId,
      reason: "rpc_error",
      error: error instanceof Error ? error.message : String(error),
      context,
    };

    console.error("Checklist initialization RPC failed", details);

    return {
      ok: false,
      reason: "rpc_error",
      details,
    } satisfies ChecklistInitOutcome;
  }
}

export function getChecklistInitializationRecoveryProcedure(params: {
  bookingId: string;
}) {
  const { bookingId } = params;

  return [
    `1) Open booking ${bookingId} in admin and verify booking/items/reservations are present.`,
    "2) Confirm migration 132 is applied in the target environment if RPC is unavailable.",
    "3) Re-run checklist initialization only for this booking via explicit admin maintenance action/RPC call.",
    "4) Verify booking_checklist_items contains booking_item and inventory_reservation source rows.",
    "5) Re-open Route Board/driver checklist views and confirm items are visible.",
  ].join(" ");
}

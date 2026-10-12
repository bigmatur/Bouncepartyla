import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomerApprovalReason = "last_minute" | "park_venue_capacity";

export type CustomerApprovalEvaluation = {
  ok: boolean;
  requiresApproval: boolean;
  reasons: CustomerApprovalReason[];
  configErrors: string[];
  hasParkVenue: boolean;
  parkVenueCount: number;
  parkVenueLimit: number;
  timezone: string;
  thresholdValue: number;
  thresholdUnit: "hours" | "days";
};

function asTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export async function evaluateCustomerBookingApproval(params: {
  supabase: SupabaseClient;
  eventDate: string;
  eventStartTime?: string;
  selectedModifierOptionIds: string[];
  bookingId?: string;
}): Promise<CustomerApprovalEvaluation> {
  const optionIds = Array.from(
    new Set(
      (params.selectedModifierOptionIds || [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );

  const { data, error } = await params.supabase.rpc(
    "evaluate_customer_booking_approval",
    {
      p_event_date: params.eventDate,
      p_event_start_time: params.eventStartTime || null,
      p_selected_modifier_option_ids: optionIds,
      p_booking_id: params.bookingId || null,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const payload =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;

  if (!payload) {
    throw new Error("Approval rules response is invalid.");
  }

  const reasons = asTextArray(payload.reasons).filter(
    (reason): reason is CustomerApprovalReason =>
      reason === "last_minute" || reason === "park_venue_capacity",
  );

  const configErrors = asTextArray(payload.config_errors);

  return {
    ok: payload.ok === true,
    requiresApproval: payload.requires_approval === true,
    reasons,
    configErrors,
    hasParkVenue: payload.has_park_venue === true,
    parkVenueCount: Math.max(0, Number(payload.park_venue_count || 0)),
    parkVenueLimit: Math.max(0, Number(payload.park_venue_limit || 0)),
    timezone: String(payload.timezone || "America/Los_Angeles"),
    thresholdValue: Math.max(1, Number(payload.last_minute_threshold_value || 24)),
    thresholdUnit:
      String(payload.last_minute_threshold_unit || "hours") === "days"
        ? "days"
        : "hours",
  };
}

export async function requestCustomerBookingApproval(params: {
  supabase: SupabaseClient;
  bookingId: string;
  reasons: CustomerApprovalReason[];
  snapshot: Record<string, unknown>;
  customerComment?: string;
}) {
  const { data, error } = await params.supabase.rpc(
    "request_my_customer_booking_approval",
    {
      p_booking_id: params.bookingId,
      p_reasons: params.reasons,
      p_snapshot: params.snapshot,
      p_customer_comment: params.customerComment || null,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const payload =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;

  if (!payload || payload.success !== true) {
    throw new Error(String(payload?.status || "approval_request_failed"));
  }

  return payload;
}

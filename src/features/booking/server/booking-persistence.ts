import type { SupabaseClient } from "@supabase/supabase-js";

export type PersistedBookingResult = {
  booking: any;
  reusedExistingBooking: boolean;
};

function errorMentionsColumn(error: any, columnName: string) {
  const text = `${String(error?.message || "")} ${String(error?.details || "")} ${String(error?.hint || "")}`.toLowerCase();
  return text.includes(columnName.toLowerCase());
}

export async function findBookingByAttemptId(params: {
  supabase: SupabaseClient;
  bookingAttemptId?: string | null;
}) {
  const bookingAttemptId = String(params.bookingAttemptId || "").trim();
  if (!bookingAttemptId) return null;

  const result = await params.supabase
    .from("bookings")
    .select("*")
    .eq("booking_attempt_id", bookingAttemptId)
    .limit(1)
    .maybeSingle();

  // 42703 keeps older databases usable until migration 024 is applied.
  if (result.error && String(result.error.code || "") !== "42703") {
    throw new Error(result.error.message);
  }

  return result.data || null;
}

export async function insertBookingIdempotently(params: {
  supabase: SupabaseClient;
  payload: Record<string, any>;
  bookingAttemptId?: string | null;
  optionalFallbackColumns?: string[];
  select?: string;
}): Promise<PersistedBookingResult> {
  const {
    supabase,
    optionalFallbackColumns = [],
    select = "*",
  } = params;
  const bookingAttemptId = String(params.bookingAttemptId || "").trim() || null;

  const existing = await findBookingByAttemptId({ supabase, bookingAttemptId });
  if (existing) {
    return { booking: existing, reusedExistingBooking: true };
  }

  let payload = {
    ...params.payload,
    ...(bookingAttemptId ? { booking_attempt_id: bookingAttemptId } : {}),
  };

  const attemptedFallbacks = new Set<string>();

  while (true) {
    const result = await supabase
      .from("bookings")
      .insert(payload)
      .select(select)
      .single();

    if (!result.error && result.data) {
      return { booking: result.data, reusedExistingBooking: false };
    }

    const error = result.error;

    if (String(error?.code || "") === "23505" && bookingAttemptId) {
      const concurrentExisting = await findBookingByAttemptId({
        supabase,
        bookingAttemptId,
      });
      if (concurrentExisting) {
        return { booking: concurrentExisting, reusedExistingBooking: true };
      }
    }

    const fallbackColumn = ["booking_attempt_id", ...optionalFallbackColumns]
      .find((columnName) =>
        !attemptedFallbacks.has(columnName) &&
        Object.prototype.hasOwnProperty.call(payload, columnName) &&
        errorMentionsColumn(error, columnName),
      );

    if (fallbackColumn) {
      attemptedFallbacks.add(fallbackColumn);
      const nextPayload = { ...payload };
      delete nextPayload[fallbackColumn];
      payload = nextPayload;
      continue;
    }

    throw new Error(error?.message || "Could not create booking.");
  }
}

export async function rollbackBookingGraph(params: {
  supabase: SupabaseClient;
  bookingId: string;
  extraChildTables?: string[];
}) {
  const childTables = Array.from(new Set([
    "route_stops",
    "payments",
    "contracts",
    "inventory_reservations",
    "booking_modifiers",
    "booking_items",
    "booking_price_calculations",
    "delivery_calculations",
    ...(params.extraChildTables || []),
  ]));

  const rollbackErrors: string[] = [];

  for (const tableName of childTables) {
    const result = await params.supabase
      .from(tableName as any)
      .delete()
      .eq("booking_id", params.bookingId);

    // Missing optional tables should not prevent deleting the booking itself.
    if (result.error && !["42P01", "42703"].includes(String(result.error.code || ""))) {
      rollbackErrors.push(`${tableName}: ${result.error.message}`);
    }
  }

  const bookingDelete = await params.supabase
    .from("bookings")
    .delete()
    .eq("id", params.bookingId);

  if (bookingDelete.error) {
    rollbackErrors.push(`bookings: ${bookingDelete.error.message}`);
  }

  if (rollbackErrors.length > 0) {
    throw new Error(`Booking rollback was incomplete. ${rollbackErrors.join(" | ")}`);
  }
}

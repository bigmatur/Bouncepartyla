import "server-only";

type SupabaseLike = any;

function isMissingTableError(error: any) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42p01" ||
    message.includes("could not find the table") ||
    message.includes("relation") ||
    message.includes("schema cache")
  );
}

function isMissingColumnError(error: any) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42703" ||
    code === "pgrst204" ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") &&
      message.includes("column") &&
      message.includes("schema cache")) ||
    (message.includes("schema cache") && message.includes("column"))
  );
}

function shouldIgnoreOptionalTableError(error: any) {
  return isMissingTableError(error) || isMissingColumnError(error);
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function getBookingForAdminAction(
  supabase: SupabaseLike,
  bookingId: string,
) {
  const result = await supabase
    .from("bookings")
    .select("id, booking_number, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    throw new Error("Booking not found.");
  }

  return result.data as {
    id: string;
    booking_number?: string | null;
    status?: string | null;
  };
}

export async function releaseSerializedUnitsForBooking(
  supabase: SupabaseLike,
  bookingId: string,
) {
  const reservationsResult = await supabase
    .from("inventory_reservations")
    .select("inventory_unit_id")
    .eq("booking_id", bookingId)
    .not("inventory_unit_id", "is", null);

  if (reservationsResult.error) {
    if (shouldIgnoreOptionalTableError(reservationsResult.error)) {
      return;
    }

    throw new Error(reservationsResult.error.message);
  }

  const unitIds = Array.from(
    new Set(
      (reservationsResult.data || [])
        .map((row: any) => String(row.inventory_unit_id || ""))
        .filter(Boolean),
    ),
  );

  if (unitIds.length === 0) {
    return;
  }

  const updateResult = await supabase
    .from("inventory_units")
    .update({
      status: "available",
      updated_at: new Date().toISOString(),
    })
    .in("id", unitIds);

  if (
    updateResult.error &&
    !shouldIgnoreOptionalTableError(updateResult.error)
  ) {
    throw new Error(updateResult.error.message);
  }
}

async function releaseBookingReservations(
  supabase: SupabaseLike,
  bookingId: string,
) {
  await releaseSerializedUnitsForBooking(supabase, bookingId);

  let updateResult = await supabase
    .from("inventory_reservations")
    .update({
      status: "cancelled",
    })
    .eq("booking_id", bookingId)
    .in("status", ["reserved", "picked", "loaded", "installed"]);

  if (!updateResult.error) {
    return;
  }

  if (shouldIgnoreOptionalTableError(updateResult.error)) {
    return;
  }

  const deleteResult = await supabase
    .from("inventory_reservations")
    .delete()
    .eq("booking_id", bookingId)
    .in("status", ["reserved", "picked", "loaded", "installed"]);

  if (
    deleteResult.error &&
    !shouldIgnoreOptionalTableError(deleteResult.error)
  ) {
    throw new Error(deleteResult.error.message);
  }
}

async function cancelBookingRouteStops(
  supabase: SupabaseLike,
  bookingId: string,
) {
  let result = await supabase
    .from("route_stops")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("booking_id", bookingId)
    .not("status", "in", "(cancelled,completed,failed)");

  if (!result.error) {
    return;
  }

  if (shouldIgnoreOptionalTableError(result.error)) {
    return;
  }

  const fallbackResult = await supabase
    .from("route_stops")
    .update({
      status: "cancelled",
    })
    .eq("booking_id", bookingId)
    .not("status", "in", "(cancelled,completed,failed)");

  if (
    fallbackResult.error &&
    !shouldIgnoreOptionalTableError(fallbackResult.error)
  ) {
    throw new Error(fallbackResult.error.message);
  }
}

export async function cancelBookingWithSupabase(
  supabase: SupabaseLike,
  bookingId: string,
  cancellationReason: string,
) {
  const booking = await getBookingForAdminAction(supabase, bookingId);
  const currentStatus = normalizeStatus(booking.status);

  if (currentStatus === "cancelled") {
    return {
      booking,
      alreadyCancelled: true,
    };
  }

  if (currentStatus === "closed") {
    throw new Error(
      "Closed booking cannot be cancelled. Reopen it before cancelling.",
    );
  }

  await releaseBookingReservations(supabase, bookingId);
  await cancelBookingRouteStops(supabase, bookingId);

  const now = new Date().toISOString();
  const cancellationNote = cancellationReason
    ? `Booking cancelled. Reason: ${cancellationReason}`
    : "Booking cancelled by admin.";

  let updateResult = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      archived_at: null,
      cancellation_reason: cancellationReason || null,
      cancelled_at: now,
      updated_at: now,
    })
    .eq("id", bookingId);

  if (updateResult.error && isMissingColumnError(updateResult.error)) {
    updateResult = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        notes: cancellationNote,
        updated_at: now,
      })
      .eq("id", bookingId);
  }

  if (updateResult.error && isMissingColumnError(updateResult.error)) {
    updateResult = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
      })
      .eq("id", bookingId);
  }

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  return {
    booking: {
      ...booking,
      status: "cancelled",
    },
    alreadyCancelled: false,
  };
}

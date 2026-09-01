import "server-only";

function isMissingArchivedAtError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42703" ||
    (message.includes("archived_at") && message.includes("bookings"))
  );
}

export async function setBookingArchivedCore(params: {
  supabase: any;
  bookingId: string;
  archived: boolean;
  archiveReason?: string | null;
}) {
  const bookingId = String(params.bookingId || "").trim();

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  let bookingResult = await params.supabase
    .from("bookings")
    .select("id,status,archived_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingResult.error && isMissingArchivedAtError(bookingResult.error)) {
    bookingResult = await params.supabase
      .from("bookings")
      .select("id,status")
      .eq("id", bookingId)
      .maybeSingle();
  }

  if (bookingResult.error) {
    throw new Error(bookingResult.error.message);
  }

  if (!bookingResult.data) {
    throw new Error("Booking was not found.");
  }

  const booking = bookingResult.data as
    | { id?: string; status?: string | null; archived_at?: string | null }
    | null;

  if (params.archived && String(booking?.status || "").toLowerCase() === "cancelled") {
    throw new Error(
      "Cancelled bookings must be handled through the existing cancellation workflow.",
    );
  }

  const now = new Date().toISOString();
  const reason =
    String(params.archiveReason || "").trim() || "Archived from bookings list";

  let updateResult = await params.supabase
    .from("bookings")
    .update(
      params.archived
        ? {
            archived_at: now,
            archive_reason: reason,
            updated_at: now,
          }
        : {
            archived_at: null,
            archive_reason: null,
            updated_at: now,
          },
    )
    .eq("id", bookingId);

  if (updateResult.error && isMissingArchivedAtError(updateResult.error)) {
    if (!params.archived) {
      throw new Error(
        "This database schema does not support restoring archived bookings yet.",
      );
    }

    updateResult = await params.supabase
      .from("bookings")
      .update({ status: "closed", updated_at: now })
      .eq("id", bookingId);
  }

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  return {
    bookingId,
    archived: params.archived,
    archivedAt: params.archived ? now : null,
  };
}

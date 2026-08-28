"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUnifiedAccess, isStaffRole, type AppPermission } from "@/lib/auth/access";
import { cancelBookingWithSupabase } from "@/lib/booking/cancel-booking";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

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
    (message.includes("column") &&
      message.includes("does not exist")) ||
    (message.includes("could not find") &&
      message.includes("column") &&
      message.includes("schema cache")) ||
    (message.includes("schema cache") &&
      message.includes("column"))
  );
}

function isForeignKeyError(error: any) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "23503" ||
    message.includes("foreign key constraint") ||
    message.includes("violates foreign key")
  );
}

function shouldIgnoreOptionalTableError(error: any) {
  return isMissingTableError(error) || isMissingColumnError(error);
}

async function assertBookingPermission(supabase: any, permission: AppPermission) {
  const access = await getUnifiedAccess(supabase);

  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can(permission)) {
    throw new Error(`Access denied. Missing permission: ${permission}`);
  }

  return access;
}

async function verifyBookingExists(bookingId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_number, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Booking not found.");
  }

  return data as {
    id: string;
    booking_number?: string | null;
    status?: string | null;
  };
}

async function releaseSerializedUnitsForBooking(bookingId: string) {
  const supabase = await createClient();

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
        .filter(Boolean)
    )
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

async function releaseBookingReservations(bookingId: string) {
  const supabase = await createClient();

  await releaseSerializedUnitsForBooking(bookingId);

  /*
   * Для отменённого заказа сохраняем складскую историю,
   * но переводим активные резервы в cancelled.
   */
  const updateResult = await supabase
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

  /*
   * Fallback для старой структуры, где status может не принимать cancelled.
   * В таком случае удаляем только активные складские резервы заказа.
   */
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

async function cancelBookingRouteStops(bookingId: string) {
  const supabase = await createClient();

  const result = await supabase
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

  /*
   * Fallback, если updated_at отсутствует.
   */
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

async function revalidateBookingPages(bookingId: string) {
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/routes");
  revalidatePath("/admin/routes/driver");
  revalidatePath("/admin/routes/driver/checklists");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/edit-items`);
  revalidatePath(`/admin/bookings/${bookingId}/routes`);
  revalidatePath(`/admin/bookings/${bookingId}/workflow`);
}

export async function archiveBookingAction(formData: FormData) {
  const supabase = await createClient();
  await assertBookingPermission(supabase, "bookings.archive");

  const bookingId = getString(formData, "bookingId");
  const archiveReason = getString(formData, "archiveReason") || null;

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  const booking = await verifyBookingExists(bookingId);
  const currentStatus = normalizeStatus(booking.status);

  if (currentStatus === "cancelled") {
    throw new Error("Cancelled booking must be restored or deleted, not archived.");
  }

  const now = new Date().toISOString();
  const { data: authData } = await supabase.auth.getUser();

  const result = await supabase
    .from("bookings")
    .update({
      archived_at: now,
      archived_by: authData.user?.id || null,
      archive_reason: archiveReason,
      updated_at: now,
    })
    .eq("id", bookingId)
    .is("archived_at", null);

  if (result.error && isMissingColumnError(result.error)) {
    const fallbackResult = await supabase
      .from("bookings")
      .update({
        archived_at: now,
        archived_by: authData.user?.id || null,
        updated_at: now,
      })
      .eq("id", bookingId)
      .is("archived_at", null);

    if (fallbackResult.error) {
      throw new Error("Booking archive requires the latest database migration.");
    }

    await revalidateBookingPages(bookingId);
    redirect(`/admin/bookings/${bookingId}?saved=booking-archived`);
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  await revalidateBookingPages(bookingId);

  redirect(`/admin/bookings/${bookingId}?saved=booking-archived`);
}

export async function restoreArchivedBookingAction(formData: FormData) {
  const supabase = await createClient();
  await assertBookingPermission(supabase, "bookings.restore");

  const bookingId = getString(formData, "bookingId");

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  const result = await supabase
    .from("bookings")
    .update({
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .not("archived_at", "is", null);

  if (result.error && isMissingColumnError(result.error)) {
    const fallbackResult = await supabase
      .from("bookings")
      .update({
        archived_at: null,
        archived_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .not("archived_at", "is", null);

    if (fallbackResult.error) {
      throw new Error("Booking restore requires the latest database migration.");
    }

    await revalidateBookingPages(bookingId);
    redirect(`/admin/bookings/${bookingId}?saved=booking-restored`);
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  await revalidateBookingPages(bookingId);

  redirect(`/admin/bookings/${bookingId}?saved=booking-restored`);
}

/**
 * Отменяет заказ, но не удаляет историю.
 *
 * Выполняет:
 * 1. освобождение складских резервов;
 * 2. возврат serialized units в available;
 * 3. отмену delivery/pickup stops;
 * 4. изменение статуса заказа на cancelled.
 *
 * В проекте сейчас не используется Supabase Auth,
 * поэтому функция не вызывает supabase.auth.getUser().
 */
export async function cancelBookingAction(formData: FormData) {
  const supabase = await createClient();
  await assertBookingPermission(supabase, "bookings.cancel");

  const bookingId = getString(formData, "bookingId");
  const cancellationReason = getString(formData, "cancellationReason");

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  const result = await cancelBookingWithSupabase(
    supabase,
    bookingId,
    cancellationReason
  );

  await revalidateBookingPages(bookingId);

  if (result.alreadyCancelled) {
    redirect(`/admin/bookings/${bookingId}?saved=booking-already-cancelled`);
  }

  redirect(`/admin/bookings/${bookingId}?saved=booking-cancelled`);
}

async function deleteRowsByBookingId(
  tableName: string,
  bookingId: string
) {
  const supabase = await createClient();

  const result = await supabase
    .from(tableName)
    .delete()
    .eq("booking_id", bookingId);

  if (!result.error) {
    return;
  }

  if (shouldIgnoreOptionalTableError(result.error)) {
    return;
  }

  throw new Error(
    `Failed deleting related rows from ${tableName}: ${result.error.message}`
  );
}

async function deleteBookingRelations(bookingId: string) {
  /*
   * Сначала удаляются наиболее зависимые записи.
   * Таблицы, которых нет в текущей схеме, безопасно пропускаются.
   */
  const tables = [
    "booking_checklist_item_photos",
    "booking_checklist_items",
    "booking_photos",
    "route_stop_photos",
    "route_stops",
    "inventory_movements",
    "inventory_reservations",
    "booking_modifiers",
    "booking_items",
    "payments",
    "contracts",
    "booking_notes",
    "booking_status_history",
    "booking_activity",
  ];

  for (const tableName of tables) {
    await deleteRowsByBookingId(tableName, bookingId);
  }
}

/**
 * Полностью удаляет отменённый заказ.
 *
 * Для защиты требуется:
 * - заказ уже имеет status=cancelled;
 * - пользователь ввёл booking number или полный booking id;
 * - передано confirmDelete=true.
 *
 * В проекте пока нет Supabase Auth, поэтому ограничение выполняется
 * через размещение кнопки только внутри административной страницы.
 */
export async function deleteBookingPermanentlyAction(formData: FormData) {
  const supabase = await createClient();
  await assertBookingPermission(supabase, "bookings.delete");

  const bookingId = getString(formData, "bookingId");
  const confirmation = getString(formData, "confirmation");
  const confirmDelete = ["true", "1", "on"].includes(
    getString(formData, "confirmDelete").toLowerCase()
  );

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  if (!confirmDelete) {
    throw new Error("Permanent deletion was not confirmed.");
  }

  const booking = await verifyBookingExists(bookingId);
  const bookingStatus = normalizeStatus(booking.status);

  if (bookingStatus !== "cancelled") {
    throw new Error(
      "Cancel the booking before deleting it permanently."
    );
  }

  const bookingNumber = String(booking.booking_number || "").trim();
  const normalizedConfirmation = confirmation.trim().toLowerCase();

  const validConfirmations = [
    bookingId.toLowerCase(),
    bookingNumber.toLowerCase(),
    `#${bookingNumber}`.toLowerCase(),
  ].filter(Boolean);

  if (
    !normalizedConfirmation ||
    !validConfirmations.includes(normalizedConfirmation)
  ) {
    throw new Error(
      `Enter ${bookingNumber || bookingId} to confirm permanent deletion.`
    );
  }

  await releaseSerializedUnitsForBooking(bookingId);
  await deleteBookingRelations(bookingId);

  let deleteBookingResult = await supabase
    .from("bookings")
    .delete()
    .eq("id", bookingId);

  if (
    deleteBookingResult.error &&
    isForeignKeyError(deleteBookingResult.error)
  ) {
    throw new Error(
      `Booking still has connected records and could not be deleted: ${deleteBookingResult.error.message}`
    );
  }

  if (deleteBookingResult.error) {
    throw new Error(deleteBookingResult.error.message);
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/routes");
  revalidatePath("/admin/routes/driver");
  revalidatePath("/admin/routes/driver/checklists");

  redirect("/admin/bookings?saved=booking-deleted");
}
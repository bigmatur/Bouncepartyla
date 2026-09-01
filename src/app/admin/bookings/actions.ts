"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUnifiedAccess } from "@/lib/auth/access";
import { createBooking } from "@/lib/booking/createBooking";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function subtractMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() - minutes * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function toLaDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00-07:00`);
}

function isMissingArchivedAtError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42703" ||
    (message.includes("archived_at") && message.includes("bookings"))
  );
}

function isMissingArchiveReasonError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42703" ||
    code === "pgrst204" ||
    message.includes("archive_reason")
  );
}

function sanitizeReturnTo(value: string) {
  if (!value.startsWith("/admin/bookings")) {
    return "/admin/bookings";
  }

  return value;
}

function withSavedCode(path: string, saved: string) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set("saved", saved);
  return `${url.pathname}${url.search}`;
}

async function getReservedWindow(params: {
  productId: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
}) {
  const supabase = await createClient();

  const productResult = await supabase
    .from("products")
    .select(
      `
      id,
      setup_minutes,
      teardown_minutes,
      buffer_before_minutes,
      buffer_after_minutes
    `
    )
    .eq("id", params.productId)
    .single();

  if (productResult.error) {
    throw new Error(productResult.error.message);
  }

  const product = productResult.data;

  const eventStart = toLaDateTime(params.eventDate, params.eventStartTime);
  const eventEnd = toLaDateTime(params.eventDate, params.eventEndTime);

  if (eventEnd <= eventStart) {
    throw new Error("End time must be after start time.");
  }

  const reservedFrom = subtractMinutes(
    eventStart,
    Number(product.setup_minutes || 0) +
      Number(product.buffer_before_minutes || 0)
  );

  const reservedUntil = addMinutes(
    eventEnd,
    Number(product.teardown_minutes || 0) +
      Number(product.buffer_after_minutes || 0)
  );

  return {
    reservedFrom: reservedFrom.toISOString(),
    reservedUntil: reservedUntil.toISOString(),
  };
}

export async function createBookingAction(formData: FormData) {
  const customerId = getString(formData, "customerId");
  const customerName = getString(formData, "customerName");
  const customerPhone = getString(formData, "customerPhone");
  const customerEmail = getString(formData, "customerEmail");

  const productId = getString(formData, "productId");

  const eventDate = getString(formData, "eventDate");
  const eventStartTime = getString(formData, "eventStartTime");
  const eventEndTime = getString(formData, "eventEndTime");

  const setupAddress = getString(formData, "setupAddress");
  const setupCity = getString(formData, "setupCity");
  const setupZip = getString(formData, "setupZip");

  const selectedModifierGroupOptionIds = formData
    .getAll("selectedModifierGroupOptionIds")
    .map((value) => String(value))
    .filter(Boolean);

  if (!productId) {
    throw new Error("Product is required.");
  }

  if (!eventDate || !eventStartTime || !eventEndTime) {
    throw new Error("Event date, start time and end time are required.");
  }

  if (!customerId && !customerName) {
    throw new Error("Customer is required.");
  }

  const supabase = await createClient();

  const reservedWindow = await getReservedWindow({
    productId,
    eventDate,
    eventStartTime,
    eventEndTime,
  });

  const result = await createBooking({
    supabase,
    input: {
      customerId: customerId || undefined,
      customerName,
      customerPhone,
      customerEmail,
      productId,
      selectedModifierGroupOptionIds,
      eventDate,
      eventStartTime,
      eventEndTime,
      setupAddress,
      setupCity,
      setupZip,
      reservedFrom: reservedWindow.reservedFrom,
      reservedUntil: reservedWindow.reservedUntil,
    },
  });

  redirect(`/admin/bookings/${result.booking.id}`);
}

export async function archiveSelectedBookingsAction(formData: FormData) {
  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user) {
    redirect("/login");
  }

  if (!access.isActive || !access.can("bookings.edit")) {
    redirect("/unauthorized");
  }

  const returnTo = sanitizeReturnTo(getString(formData, "returnTo") || "/admin/bookings");
  const archiveReasonRaw = getString(formData, "archiveReason");
  const archiveReason = archiveReasonRaw || "Archived from bookings list";

  const bookingIds = Array.from(
    new Set(
      formData
        .getAll("bookingIds")
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  if (bookingIds.length === 0) {
    redirect(withSavedCode(returnTo, "bulk-archive-empty"));
  }

  let archiveResult = await supabase
    .from("bookings")
    .update({
      archived_at: new Date().toISOString(),
      archive_reason: archiveReason,
    })
    .in("id", bookingIds);

  if (archiveResult.error && isMissingArchiveReasonError(archiveResult.error)) {
    archiveResult = await supabase
      .from("bookings")
      .update({
        archived_at: new Date().toISOString(),
      })
      .in("id", bookingIds);
  }

  if (archiveResult.error && isMissingArchivedAtError(archiveResult.error)) {
    archiveResult = await supabase
      .from("bookings")
      .update({ status: "closed" })
      .in("id", bookingIds);
  }

  if (archiveResult.error) {
    redirect(withSavedCode(returnTo, "bulk-archive-error"));
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/bookings/archive");

  redirect(withSavedCode(returnTo, "bulk-archived"));
}
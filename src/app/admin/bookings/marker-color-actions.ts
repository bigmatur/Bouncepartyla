"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidateMarkerColorPaths(bookingId: string) {
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/routes");
  revalidatePath("/admin/routes/driver");
  revalidatePath("/admin/routes/live");
}

export async function updateBookingMarkerColorAction(formData: FormData) {
  const bookingId = String(formData.get("bookingId") || "").trim();
  const markerColor = String(formData.get("markerColor") || "").trim();
  const returnTo = String(formData.get("returnTo") || "/admin/bookings").trim();

  if (!bookingId) {
    return;
  }

  const color = /^#[0-9a-fA-F]{6}$/.test(markerColor) ? markerColor : "";
  const supabase = await createClient();

  const bookingResult = await supabase
    .from("bookings")
    .select("id, internal_notes")
    .eq("id", bookingId)
    .maybeSingle();

  if (!bookingResult.error) {
    const existingNotes = String(bookingResult.data?.internal_notes || "");
    const withoutMarkerTag = existingNotes
      .replace(/\s*\[marker_color:\s*#[0-9a-fA-F]{6}\s*\]\s*/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const markerTag = color ? `[marker_color:${color}]` : "";
    const nextInternalNotes = [withoutMarkerTag, markerTag]
      .filter(Boolean)
      .join(" ")
      .trim() || null;

    await supabase
      .from("bookings")
      .update({ internal_notes: nextInternalNotes })
      .eq("id", bookingId);
  }

  const calculationsResult = await supabase
    .from("booking_price_calculations")
    .select("id, calculation_snapshot")
    .eq("booking_id", bookingId);

  if (calculationsResult.error) {
    revalidateMarkerColorPaths(bookingId);
    redirect(returnTo || "/admin/bookings");
  }

  const calculationRows = calculationsResult.data || [];

  if (calculationRows.length > 0) {
    for (const row of calculationRows) {
      const existingSnapshot = row.calculation_snapshot || {};
      const nextSnapshot = {
        ...existingSnapshot,
        marker_color: color || existingSnapshot.marker_color || null,
      };

      const updateResult = await supabase
        .from("booking_price_calculations")
        .update({ calculation_snapshot: nextSnapshot })
        .eq("id", row.id)
        .select("id")
        .maybeSingle();

      if (updateResult.error) {
        revalidateMarkerColorPaths(bookingId);
        redirect(returnTo || "/admin/bookings");
      }
    }
  } else {
    const nextSnapshot = {
      marker_color: color || null,
    };

    const insertResult = await supabase
      .from("booking_price_calculations")
      .insert({
        booking_id: bookingId,
        calculation_snapshot: nextSnapshot,
      });

    if (insertResult.error) {
      revalidateMarkerColorPaths(bookingId);
      redirect(returnTo || "/admin/bookings");
    }
  }

  revalidateMarkerColorPaths(bookingId);

  redirect(returnTo || "/admin/bookings");
}
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/auth/require-admin";

type NotificationDestinationRow = {
  id: string;
  booking_id: string | null;
};

function toDeliveryId(formData: FormData) {
  return String(formData.get("deliveryId") || "").trim();
}

function adminNotificationDestination(bookingId: string | null | undefined) {
  const normalizedBookingId = String(bookingId || "").trim();
  if (normalizedBookingId) {
    return `/admin/bookings/${normalizedBookingId}`;
  }

  return "/admin";
}

export async function openOwnAdminNotificationAction(formData: FormData) {
  const { supabase, access } = await requireAdminUser();
  const authUserId = String(access.user?.id || "").trim();
  const deliveryId = toDeliveryId(formData);

  if (!deliveryId || !authUserId) {
    redirect("/admin/my-notifications");
  }

  const markResult = await supabase.rpc("mark_my_notification_read", {
    p_delivery_id: deliveryId,
  });

  if (markResult.error) {
    throw new Error(markResult.error.message);
  }

  const deliveryResult = await supabase
    .from("notification_deliveries")
    .select("id,booking_id")
    .eq("id", deliveryId)
    .eq("channel", "in_app")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (deliveryResult.error) {
    throw new Error(deliveryResult.error.message);
  }

  const delivery = deliveryResult.data as NotificationDestinationRow | null;

  revalidatePath("/admin/my-notifications");
  redirect(adminNotificationDestination(delivery?.booking_id || null));
}

export async function markAllOwnAdminNotificationsReadAction() {
  const { supabase } = await requireAdminUser();

  const markResult = await supabase.rpc("mark_all_my_notifications_read");
  if (markResult.error) {
    throw new Error(markResult.error.message);
  }

  revalidatePath("/admin/my-notifications");
  redirect("/admin/my-notifications?read=all");
}

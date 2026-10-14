"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomerAccess } from "@/lib/auth/require-customer";

type NotificationDestinationRow = {
  id: string;
  booking_id: string | null;
};

function enabled(formData: FormData, key: string) {
  return ["1","true","on","yes"].includes(String(formData.get(key) || "").toLowerCase());
}

function toDeliveryId(formData: FormData) {
  return String(formData.get("deliveryId") || "").trim();
}

function customerNotificationDestination(bookingId: string | null | undefined) {
  const normalizedBookingId = String(bookingId || "").trim();
  if (normalizedBookingId) {
    return `/account/bookings/${normalizedBookingId}`;
  }

  return "/account";
}

export async function openCustomerNotificationAction(formData: FormData) {
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  if (canPreviewCustomer || access.role !== "customer") {
    redirect("/account/notifications?error=Inbox+is+read-only+in+preview+mode");
  }

  const deliveryId = toDeliveryId(formData);
  if (!deliveryId) {
    redirect("/account/notifications");
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
    .maybeSingle();

  if (deliveryResult.error) {
    throw new Error(deliveryResult.error.message);
  }

  const delivery = deliveryResult.data as NotificationDestinationRow | null;

  const destination = customerNotificationDestination(
    delivery?.booking_id || null,
  );

  revalidatePath("/account/notifications");
  redirect(destination);
}

export async function markAllCustomerNotificationsReadAction() {
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  if (canPreviewCustomer || access.role !== "customer") {
    redirect("/account/notifications?error=Inbox+is+read-only+in+preview+mode");
  }

  const markAllResult = await supabase.rpc("mark_all_my_notifications_read");
  if (markAllResult.error) {
    throw new Error(markAllResult.error.message);
  }

  revalidatePath("/account/notifications");
  redirect("/account/notifications?read=all");
}

export async function saveNotificationPreferencesAction(formData: FormData) {
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();
  if (canPreviewCustomer || access.role !== "customer") {
    redirect("/account/notifications/settings?error=Preferences+cannot+be+changed+in+preview+mode");
  }

  const customerResult = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", access.user?.id || "")
    .limit(1)
    .maybeSingle();
  if (customerResult.error) throw new Error(customerResult.error.message);
  if (!customerResult.data?.id) throw new Error("Customer profile is not linked.");

  const categoriesResult = await supabase
    .from("notification_categories")
    .select("code,customer_configurable,mandatory")
    .eq("active", true);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);

  for (const category of categoriesResult.data || []) {
    if (!category.customer_configurable || category.mandatory) continue;
    const row = {
      customer_id: customerResult.data.id,
      category_code: category.code,
      email_enabled: enabled(formData, `${category.code}:email`),
      sms_enabled: enabled(formData, `${category.code}:sms`),
      in_app_enabled: enabled(formData, `${category.code}:in_app`),
    };
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(row, { onConflict: "customer_id,category_code" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/account/notifications/settings");
  redirect("/account/notifications/settings?saved=1");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomerAccess } from "@/lib/auth/require-customer";

function enabled(formData: FormData, key: string) {
  return ["1","true","on","yes"].includes(String(formData.get(key) || "").toLowerCase());
}

export async function saveNotificationPreferencesAction(formData: FormData) {
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();
  if (canPreviewCustomer || access.role !== "customer") {
    redirect("/account/notifications?error=Preferences+cannot+be+changed+in+preview+mode");
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

  revalidatePath("/account/notifications");
  redirect("/account/notifications?saved=1");
}

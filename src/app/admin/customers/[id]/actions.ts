"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

export async function updateCustomerAction(formData: FormData) {
  const supabase = await createClient();

  const customerId = getString(formData, "customerId");

  if (!customerId) {
    throw new Error("Missing customer id.");
  }

  const { error } = await supabase
    .from("customers")
    .update({
      full_name: getString(formData, "fullName"),
      phone: getNullableString(formData, "phone"),
      email: getNullableString(formData, "email"),
      notes: getNullableString(formData, "notes"),
    })
    .eq("id", customerId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/bookings/new");
}
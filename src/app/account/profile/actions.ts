"use server";

import { redirect } from "next/navigation";

import { requireCustomerAccess } from "@/lib/auth/require-customer";

function profileRedirect(params: Record<string, string>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params || {})) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();

    if (!normalizedKey || !normalizedValue) continue;
    query.set(normalizedKey, normalizedValue);
  }

  return `/account/profile${query.toString() ? `?${query.toString()}` : ""}`;
}

function isMissingColumnError(error: any, columnName: string) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  if (code === "42703") {
    return true;
  }

  return message.includes("column") && message.includes(String(columnName || "").toLowerCase());
}

export async function updateCustomerProfileAction(formData: FormData) {
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  if (access.role !== "customer" || canPreviewCustomer) {
    redirect(
      profileRedirect({
        error: "Profile editing is only available for customer accounts.",
      }),
    );
  }

  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const phone = String(formData.get("phone") || "").trim();

  if (!firstName) {
    redirect(
      profileRedirect({
        error: "First name is required.",
      }),
    );
  }

  if (phone.length > 40) {
    redirect(
      profileRedirect({
        error: "Phone is too long.",
      }),
    );
  }

  let targetCustomerId = access.customerId;

  if (!targetCustomerId) {
    const lookupResult = await supabase
      .from("customers")
      .select("id")
      .eq("auth_user_id", String(access.user?.id || ""))
      .maybeSingle();

    if (lookupResult.error) {
      if (isMissingColumnError(lookupResult.error, "auth_user_id")) {
        redirect(
          profileRedirect({
            error: "Profile link is not configured yet. Contact support.",
          }),
        );
      }

      redirect(
        profileRedirect({
          error: lookupResult.error.message || "Could not load customer profile.",
        }),
      );
    }

    targetCustomerId = lookupResult.data?.id || null;
  }

  if (!targetCustomerId) {
    redirect(
      profileRedirect({
        error: "Customer profile not linked to this account.",
      }),
    );
  }

  const updateResult = await supabase
    .from("customers")
    .update({
      first_name: firstName,
      last_name: lastName || null,
      full_name: fullName,
      phone: phone || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetCustomerId)
    .select("id")
    .maybeSingle();

  if (updateResult.error) {
    redirect(
      profileRedirect({
        error: updateResult.error.message || "Could not save profile.",
      }),
    );
  }

  redirect(
    profileRedirect({
      saved: "1",
    }),
  );
}

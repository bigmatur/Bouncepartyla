"use server";

import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function safeCustomerNextPath(nextPath: string) {
  return nextPath.startsWith("/account")
    ? nextPath
    : "/account";
}

function createPasswordUrl(values: Record<string, string>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();

    if (!normalizedKey || !normalizedValue) {
      continue;
    }

    params.set(normalizedKey, normalizedValue);
  }

  return `/create-password?${params.toString()}`;
}

function customerLoginUrl(nextPath: string, error?: string) {
  const params = new URLSearchParams({
    next: nextPath,
    mode: "customer",
  });

  if (error) {
    params.set("error", error);
  }

  return `/login?${params.toString()}`;
}

export async function createCustomerPasswordAction(formData: FormData) {
  const nextPath = safeCustomerNextPath(
    safeNextPath(formData.get("next")) || "/account",
  );

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!password) {
    redirect(
      createPasswordUrl({
        error: "Enter a password.",
        next: nextPath,
      }),
    );
  }

  if (password.length < 6) {
    redirect(
      createPasswordUrl({
        error: "Password must be at least 6 characters.",
        next: nextPath,
      }),
    );
  }

  if (password !== confirmPassword) {
    redirect(
      createPasswordUrl({
        error: "Password confirmation does not match.",
        next: nextPath,
      }),
    );
  }

  const supabase = await createClient();
  const userResult = await supabase.auth.getUser();

  if (!userResult.data.user) {
    redirect(
      customerLoginUrl(
        nextPath,
        "Please sign in again to create your password.",
      ),
    );
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    redirect(
      createPasswordUrl({
        error: error.message || "Could not create password. Please try again.",
        next: nextPath,
      }),
    );
  }

  redirect(nextPath);
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function signupUrl(values: Record<string, string>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();

    if (normalizedKey && normalizedValue) {
      params.set(normalizedKey, normalizedValue);
    }
  }

  return `/signup?${params.toString()}`;
}

function normalizePhone(value: string) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) return "";

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (
    digits.length === 11 &&
    digits.startsWith("1")
  ) {
    return `+${digits}`;
  }

  if (raw.startsWith("+") && digits.length >= 10) {
    return `+${digits}`;
  }

  return raw;
}

function authErrorMessage(error: unknown) {
  const value = error as {
    message?: unknown;
    status?: unknown;
  } | null;

  const message = String(value?.message || "").trim();
  const normalized = message.toLowerCase();

  if (normalized.includes("rate limit")) {
    return "Too many requests. Please wait a minute and try again.";
  }

  if (
    normalized.includes("smtp") ||
    normalized.includes("error sending") ||
    normalized.includes("email provider")
  ) {
    return "Email delivery is not configured yet. Please contact Bounce Party LA.";
  }

  if (
    normalized.includes("redirect") ||
    normalized.includes("redirect url")
  ) {
    return "The signup callback URL is not allowed in Supabase Auth settings.";
  }

  return message
    ? `We could not send the verification email. ${message}`
    : "We could not send the verification email.";
}

export async function requestCustomerSignupLinkAction(
  formData: FormData,
) {
  const firstName = String(
    formData.get("firstName") || "",
  ).trim();

  const lastName = String(
    formData.get("lastName") || "",
  ).trim();

  const email = String(
    formData.get("email") || "",
  )
    .trim()
    .toLowerCase();

  const phone = normalizePhone(
    String(formData.get("phone") || ""),
  );

  const nextPath =
    safeNextPath(
      formData.get("next"),
    ) || "/account";

  if (!firstName) {
    redirect(
      signupUrl({
        error: "Enter your first name.",
        next: nextPath,
        email,
        phone,
        firstName,
        lastName,
      }),
    );
  }

  if (!email || !email.includes("@")) {
    redirect(
      signupUrl({
        error: "Enter a valid email address.",
        next: nextPath,
        email,
        phone,
        firstName,
        lastName,
      }),
    );
  }

  const phoneDigits =
    phone.replace(/\D/g, "");

  if (phoneDigits.length < 10) {
    redirect(
      signupUrl({
        error: "Enter a valid phone number.",
        next: nextPath,
        email,
        phone,
        firstName,
        lastName,
      }),
    );
  }

  const requestHeaders =
    await headers();

  const origin =
    requestHeaders.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3001";

  const callbackUrl = new URL(
    "/auth/customer/callback",
    origin,
  );

  callbackUrl.searchParams.set(
    "next",
    nextPath,
  );

  const supabase =
    await createClient();

  const { error } =
    await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo:
          callbackUrl.toString(),
        data: {
          account_intent:
            "customer_signup",
          first_name: firstName,
          last_name: lastName,
          phone,
        },
      },
    });

  if (error) {
    console.error(
      "Customer signup link error:",
      error,
    );

    redirect(
      signupUrl({
        error:
          authErrorMessage(error),
        next: nextPath,
        email,
        phone,
        firstName,
        lastName,
      }),
    );
  }

  redirect(
    signupUrl({
      sent: "1",
      next: nextPath,
      email,
    }),
  );
}

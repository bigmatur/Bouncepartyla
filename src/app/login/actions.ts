"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getUnifiedAccess, resolvePostLoginPath, safeNextPath } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function loginUrl(values: Record<string, string>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values || {})) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();

    if (!normalizedKey || !normalizedValue) {
      continue;
    }

    params.set(normalizedKey, normalizedValue);
  }

  return `/login?${params.toString()}`;
}

function loginErrorUrl(message: string, nextPath: string) {
  return loginUrl({
    error: message,
    next: nextPath,
  });
}

function formatSupabaseErrorDetails(error: unknown) {
  const value = error as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
    name?: unknown;
  } | null;

  const message = String(value?.message || "").trim();
  const code = String(value?.code || "").trim();
  const status = String(value?.status || "").trim();
  const name = String(value?.name || "").trim();

  let json = "";

  try {
    const rawJson = JSON.stringify(error);

    if (rawJson && rawJson !== "{}") {
      json = rawJson;
    }
  } catch {
    json = "";
  }

  const detail = [message, code && `code=${code}`, status && `status=${status}`, name, json]
    .filter(Boolean)
    .join(" | ");

  return {
    detail: detail || "empty error object",
    normalized: detail.toLowerCase(),
  };
}

function passwordResetErrorMessage(error: unknown) {
  const { detail, normalized } = formatSupabaseErrorDetails(error);

  if (normalized.includes("authretryablefetcherror") || normalized.includes("status=500")) {
    return "Password reset is temporarily unavailable because Supabase Auth returned a server error (500). Please retry in 1-2 minutes and check Supabase Auth logs/SMTP configuration.";
  }

  if (normalized.includes("rate limit")) {
    return "Password reset is temporarily limited. Please wait a minute and try again.";
  }

  if (
    normalized.includes("smtp") ||
    normalized.includes("email provider") ||
    normalized.includes("mailer") ||
    normalized.includes("error sending")
  ) {
    return "Password reset email delivery is not configured in Supabase Auth yet (SMTP/provider issue).";
  }

  if (normalized.includes("redirect") || normalized.includes("redirect url")) {
    return "Password reset redirect URL is not allowed in Supabase Auth settings.";
  }

  if (detail === "empty error object") {
    return "Password reset is unavailable. Supabase returned an empty error object, usually caused by email-provider restrictions or temporary limits.";
  }

  return `Password reset is unavailable. Supabase response: ${detail}`;
}

function isRetryableAuthError(error: unknown) {
  const { normalized } = formatSupabaseErrorDetails(error);

  return (
    normalized.includes("authretryablefetcherror") ||
    normalized.includes("status=500") ||
    normalized.includes("status=502") ||
    normalized.includes("status=503") ||
    normalized.includes("status=504")
  );
}

async function resetPasswordWithRetry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
  redirectTo: string,
) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (!error) {
      return { error: null };
    }

    lastError = error;

    if (!isRetryableAuthError(error)) {
      break;
    }
  }

  return { error: lastError };
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const nextPath = safeNextPath(formData.get("next")) || "/account";

  if (!email) {
    redirect(
      loginUrl({
        error: "Enter your email address.",
        next: nextPath,
      }),
    );
  }

  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3001";
  const redirectTo = new URL("/auth/reset-password/callback", origin);

  const supabase = await createClient();

  const { error } = await resetPasswordWithRetry(
    supabase,
    email,
    redirectTo.toString(),
  );

  if (error) {
    console.error("Password reset request error:", error);
    const fallbackMessage = passwordResetErrorMessage(error);

    redirect(
      loginUrl({
        error: fallbackMessage,
        next: nextPath,
        email,
      }),
    );
  }

  redirect(
    loginUrl({
      resetSent: "1",
      email,
      next: nextPath,
    }),
  );
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();

  const password = String(formData.get("password") || "");
  const nextPath = safeNextPath(formData.get("next")) || "/admin";

  if (!email || !password) {
    redirect(
      loginErrorUrl(
        "Enter your email and password.",
        nextPath,
      ),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Login error:", error.message);

    redirect(
      loginErrorUrl(
        "Incorrect email or password.",
        nextPath,
      ),
    );
  }

  const access = await getUnifiedAccess(supabase);

  redirect(resolvePostLoginPath(access, nextPath));
}
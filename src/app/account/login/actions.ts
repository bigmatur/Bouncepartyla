"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function loginUrl(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);

  return `/login?${searchParams.toString()}`;
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

  const detail = [
    message,
    code && `code=${code}`,
    status && `status=${status}`,
    name,
    json,
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    detail:
      detail ||
      "empty error object",
    normalized:
      detail.toLowerCase(),
  };
}

function magicLinkErrorMessage(
  error: unknown,
) {
  const {
    detail,
    normalized,
  } =
    formatSupabaseErrorDetails(
      error,
    );

  if (
    normalized.includes(
      "authretryablefetcherror",
    ) ||
    normalized.includes(
      "status=500",
    )
  ) {
    return "Login link sending is temporarily unavailable because Supabase Auth returned a server error (500). Please retry in 1-2 minutes and check Supabase Auth logs/SMTP configuration.";
  }

  if (
    normalized.includes(
      "error sending",
    ) ||
    normalized.includes(
      "smtp",
    ) ||
    normalized.includes(
      "email provider",
    ) ||
    normalized.includes(
      "mailer",
    )
  ) {
    return "Email sending is not configured for this environment yet. Use password login or ask admin to configure SMTP in Supabase Auth.";
  }

  if (
    normalized.includes(
      "redirect",
    ) ||
    normalized.includes(
      "redirect url",
    )
  ) {
    return "Login link redirect URL is not allowed in Supabase Auth settings.";
  }

  if (
    normalized.includes(
      "rate limit",
    )
  ) {
    return "Too many requests. Please wait a minute and try again.";
  }

  if (
    normalized.includes(
      "signups not allowed",
    ) ||
    normalized.includes(
      "user not found",
    )
  ) {
    return "We could not find an account for this email. If you are a new customer, choose Create account.";
  }

  if (
    detail ===
    "empty error object"
  ) {
    return "We could not send the login email. Supabase returned an empty error object. Usually this means Auth email delivery is blocked by provider settings or temporary limits.";
  }

  return `We could not send the login email. Supabase response: ${detail}`;
}

function isRetryableAuthError(
  error: unknown,
) {
  const { normalized } =
    formatSupabaseErrorDetails(
      error,
    );

  return (
    normalized.includes(
      "authretryablefetcherror",
    ) ||
    normalized.includes(
      "status=500",
    ) ||
    normalized.includes(
      "status=502",
    ) ||
    normalized.includes(
      "status=503",
    ) ||
    normalized.includes(
      "status=504",
    )
  );
}

async function signInWithOtpRetry(
  supabase: Awaited<
    ReturnType<
      typeof createClient
    >
  >,
  email: string,
  emailRedirectTo: string,
) {
  let lastError: unknown =
    null;

  for (
    let attempt = 0;
    attempt < 2;
    attempt += 1
  ) {
    const { error } =
      await supabase.auth.signInWithOtp(
        {
          email,
          options: {
            emailRedirectTo,

            /*
             * IMPORTANT:
             * Sign-in must NOT create new auth users.
             * New customer accounts are created only through /signup.
             */
            shouldCreateUser:
              false,
          },
        },
      );

    if (!error) {
      return {
        error: null,
      };
    }

    lastError = error;

    if (
      !isRetryableAuthError(
        error,
      )
    ) {
      break;
    }
  }

  return {
    error: lastError,
  };
}

export async function requestCustomerLoginCode(
  formData: FormData,
) {
  const email = String(
    formData.get("email") ||
      "",
  )
    .trim()
    .toLowerCase();

  const nextPath =
    safeNextPath(
      formData.get("next"),
    ) || "/account";

  if (!email) {
    redirect(
      loginUrl({
        error:
          "Enter your email address.",
        next:
          nextPath,
      }),
    );
  }

  const requestHeaders =
    await headers();

  const origin =
    requestHeaders.get(
      "origin",
    ) ||
    process.env
      .NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3001";

  const callbackUrl =
    new URL(
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
    await signInWithOtpRetry(
      supabase,
      email,
      callbackUrl.toString(),
    );

  if (error) {
    console.error(
      "Customer login code error:",
      error,
    );

    redirect(
      loginUrl({
        error:
          magicLinkErrorMessage(
            error,
          ),
        next:
          nextPath,
      }),
    );
  }

  redirect(
    loginUrl({
      sent:
        "1",
      email,
      next:
        nextPath,
    }),
  );
}

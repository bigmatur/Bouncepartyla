import {
  NextResponse,
  type NextRequest,
} from "next/server";

import { safeNextPath } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function normalizeOtpType(
  type: string | null,
) {
  const value = String(
    type || "",
  )
    .trim()
    .toLowerCase();

  if (value === "email") {
    return "magiclink";
  }

  if (
    value === "magiclink" ||
    value === "signup" ||
    value === "recovery" ||
    value === "invite" ||
    value === "email_change"
  ) {
    return value;
  }

  return null;
}

function redirectToLogin(
  request: NextRequest,
  error: string,
) {
  const url = new URL(
    "/login",
    request.url,
  );

  url.searchParams.set(
    "error",
    error,
  );

  return NextResponse.redirect(
    url,
  );
}

function redirectToSignup(
  request: NextRequest,
  error: string,
  nextPath: string,
) {
  const url = new URL(
    "/signup",
    request.url,
  );

  url.searchParams.set(
    "error",
    error,
  );

  url.searchParams.set(
    "next",
    nextPath,
  );

  return NextResponse.redirect(
    url,
  );
}

export async function GET(
  request: NextRequest,
) {
  const requestUrl =
    new URL(request.url);

  const code =
    requestUrl.searchParams.get(
      "code",
    );

  const tokenHash =
    requestUrl.searchParams.get(
      "token_hash",
    );

  const otpType =
    normalizeOtpType(
      requestUrl.searchParams.get(
        "type",
      ),
    );

  const nextPath =
    safeNextPath(
      requestUrl.searchParams.get(
        "next",
      ),
    ) || "/account";

  if (
    !code &&
    !tokenHash
  ) {
    return redirectToLogin(
      request,
      "The login link is invalid or has expired.",
    );
  }

  const supabase =
    await createClient();

  let sessionError: {
    message: string;
  } | null = null;

  if (code) {
    const result =
      await supabase.auth.exchangeCodeForSession(
        code,
      );

    sessionError =
      result.error;
  } else if (
    tokenHash &&
    otpType
  ) {
    const result =
      await supabase.auth.verifyOtp(
        {
          token_hash:
            tokenHash,
          type:
            otpType as any,
        },
      );

    sessionError =
      result.error;
  } else {
    sessionError = {
      message:
        "Missing login token type.",
    };
  }

  if (sessionError) {
    console.error(
      "Customer callback session error:",
      sessionError.message,
    );

    return redirectToLogin(
      request,
      "The login link is invalid or has expired.",
    );
  }

  const {
    data,
    error: activationError,
  } =
    await supabase.rpc(
      "activate_customer_account",
    );

  if (activationError) {
    console.error(
      "Customer activation error:",
      activationError.message,
    );

    await supabase.auth.signOut();

    return redirectToLogin(
      request,
      "We could not activate your account. Please contact Bounce Party LA.",
    );
  }

  const result =
    data &&
    typeof data === "object"
      ? (data as {
          success?: boolean;
          status?: string;
        })
      : null;

  if (
    result?.success === true
  ) {
    return NextResponse.redirect(
      new URL(
        nextPath,
        request.url,
      ),
    );
  }

  await supabase.auth.signOut();

  switch (result?.status) {
    case "customer_not_found":
      return redirectToLogin(
        request,
        "We could not find a customer account connected to this email. If you are new, choose Create account.",
      );

    case "multiple_customers":
      return redirectToLogin(
        request,
        "This email is connected to more than one customer record. Please contact Bounce Party LA to activate your account.",
      );

    case "account_inactive":
      return redirectToLogin(
        request,
        "This customer account is currently inactive.",
      );

    case "signup_name_missing":
      return redirectToSignup(
        request,
        "Your first name is missing. Please create the account again.",
        nextPath,
      );

    case "signup_phone_missing":
      return redirectToSignup(
        request,
        "Your phone number is missing. Please create the account again.",
        nextPath,
      );

    case "staff_account":
      return NextResponse.redirect(
        new URL(
          "/admin",
          request.url,
        ),
      );

    default:
      return redirectToLogin(
        request,
        "We could not activate your account. Please contact Bounce Party LA.",
      );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

function normalizeOtpType(type: string | null) {
  const value = String(type || "").trim().toLowerCase();

  if (value === "email") {
    return "recovery";
  }

  if (
    value === "recovery" ||
    value === "magiclink" ||
    value === "signup" ||
    value === "invite" ||
    value === "email_change"
  ) {
    return value;
  }

  return "recovery";
}

function redirectToLogin(request: NextRequest, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpType = normalizeOtpType(requestUrl.searchParams.get("type"));

  if (!code && !tokenHash) {
    return redirectToLogin(request, "Reset link is invalid or expired.");
  }

  const supabase = await createClient();
  let authError: { message: string } | null = null;

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    authError = result.error;
  } else if (tokenHash) {
    const result = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as any,
    });
    authError = result.error;
  }

  if (authError) {
    console.error("Reset callback auth error:", authError.message);
    return redirectToLogin(request, "Reset link is invalid or expired.");
  }

  return NextResponse.redirect(new URL("/reset-password", request.url));
}

import {
  NextResponse,
  type NextRequest,
} from "next/server";

import { safeNextPath } from "@/lib/auth/access";
import {
  PRIVACY_POLICY_VERSION,
  TERMS_OF_SERVICE_VERSION,
} from "@/lib/legal/documents";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

function isMissingTableErrorCode(error: unknown) {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = String(value?.code || "").toLowerCase();

  return code === "42p01";
}

type LegalEvidenceWriteResult =
  | { status: "recorded" }
  | { status: "skipped" }
  | { status: "missing_migration"; reason: string }
  | { status: "failed"; reason: string };

function hasSignupLegalIntent(user: {
  user_metadata?: unknown;
} | null) {
  const userMeta =
    user?.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : {};

  const intent = String(userMeta.account_intent || "").trim().toLowerCase();
  const legalAccepted = userMeta.legal_terms_accepted === true;

  return intent === "customer_signup" && legalAccepted;
}

async function recordSignupLegalAcceptance(params: {
  authUserId: string;
  request: NextRequest;
  customerIdHint: string | null;
}): Promise<LegalEvidenceWriteResult> {
  const service = createServiceClient();

  const profileResult = await service
    .from("profiles")
    .select("id, customer_id")
    .eq("auth_user_id", params.authUserId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (profileResult.error) {
    return {
      status: "failed",
      reason: `profile_lookup_failed:${profileResult.error.code || "unknown"}`,
    };
  }

  const profileId = String(profileResult.data?.id || "").trim() || null;
  const profileCustomerId = String(profileResult.data?.customer_id || "").trim() || null;
  const hintedCustomerId = String(params.customerIdHint || "").trim() || null;

  if (profileCustomerId && hintedCustomerId && profileCustomerId !== hintedCustomerId) {
    return {
      status: "failed",
      reason: "identity_mismatch:profile_customer_vs_activation_customer",
    };
  }

  const customerId = profileCustomerId || hintedCustomerId;
  const userAgent = String(params.request.headers.get("user-agent") || "").trim() || null;

  const { error } = await service
    .from("legal_document_acceptances")
    .upsert(
      [
        {
          auth_user_id: params.authUserId,
          profile_id: profileId,
          customer_id: customerId,
          document_type: "terms_of_service",
          action_type: "accepted",
          document_version: TERMS_OF_SERVICE_VERSION,
          acceptance_context: "signup",
          user_agent: userAgent,
        },
        {
          auth_user_id: params.authUserId,
          profile_id: profileId,
          customer_id: customerId,
          document_type: "privacy_policy",
          action_type: "acknowledged",
          document_version: PRIVACY_POLICY_VERSION,
          acceptance_context: "signup",
          user_agent: userAgent,
        },
      ],
      {
        onConflict: "auth_user_id,document_type,action_type,document_version,acceptance_context",
        ignoreDuplicates: true,
      },
    );

  if (error) {
    if (isMissingTableErrorCode(error)) {
      return {
        status: "missing_migration",
        reason: "migration_115_not_applied:legal_document_acceptances_missing",
      };
    }

    return {
      status: "failed",
      reason: `evidence_write_failed:${error.code || "unknown"}`,
    };
  }

  return { status: "recorded" };
}

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
          customer_id?: string | null;
        })
      : null;

  if (
    result?.success === true
  ) {
    const userResult = await supabase.auth.getUser();
    const authUser = userResult.data.user;

    if (authUser?.id && hasSignupLegalIntent(authUser)) {
      const evidenceResult = await recordSignupLegalAcceptance({
        authUserId: authUser.id,
        request,
        customerIdHint: String(result.customer_id || "").trim() || null,
      });

      if (evidenceResult.status === "missing_migration") {
        console.warn("[legal-evidence] migration 115 missing; temporary fail-open for signup", {
          event: "legal_evidence_missing_migration_115",
          authUserId: authUser.id,
          reason: evidenceResult.reason,
        });
      } else if (evidenceResult.status === "failed") {
        console.error("[legal-evidence] write failed; blocking signup completion", {
          event: "legal_evidence_write_failed",
          authUserId: authUser.id,
          reason: evidenceResult.reason,
        });

        await supabase.auth.signOut();

        return redirectToSignup(
          request,
          "We could not complete legal confirmation records. Please try again.",
          nextPath,
        );
      }
    }

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

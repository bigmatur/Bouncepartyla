import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type CancelResult = {
  success?: boolean;
  status?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bookingId = String(
    url.searchParams.get("booking_id") || "",
  ).trim();
  const origin = url.origin;

  if (!bookingId) {
    return NextResponse.redirect(
      `${origin}/account/book-now?stripe=cancelled&cleanup=missing_booking`,
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error(
      "[stripe-cancel] Could not resolve authenticated user:",
      userError.message,
    );

    return NextResponse.redirect(
      `${origin}/account/book-now?stripe=cancelled&cleanup=auth_error`,
    );
  }

  if (!user) {
    console.warn(
      "[stripe-cancel] No authenticated user for booking cleanup:",
      bookingId,
    );

    return NextResponse.redirect(
      `${origin}/account/book-now?stripe=cancelled&cleanup=not_authenticated`,
    );
  }

  const cleanup = await supabase.rpc(
    "cancel_my_unpaid_customer_stripe_booking",
    {
      p_booking_id: bookingId,
    },
  );

  if (cleanup.error) {
    console.error(
      "[stripe-cancel] Cleanup RPC failed:",
      {
        bookingId,
        userId: user.id,
        message: cleanup.error.message,
      },
    );

    return NextResponse.redirect(
      `${origin}/account/book-now?stripe=cancelled&cleanup=error`,
    );
  }

  const result =
    cleanup.data &&
    typeof cleanup.data === "object"
      ? (cleanup.data as CancelResult)
      : null;

  if (!result?.success) {
    console.warn(
      "[stripe-cancel] Booking was not removed:",
      {
        bookingId,
        userId: user.id,
        result,
      },
    );

    const status = encodeURIComponent(
      String(result?.status || "not_removed"),
    );

    return NextResponse.redirect(
      `${origin}/account/book-now?stripe=cancelled&cleanup=${status}`,
    );
  }

  console.info(
    "[stripe-cancel] Provisional booking removed:",
    {
      bookingId,
      userId: user.id,
      status: result.status,
    },
  );

  return NextResponse.redirect(
    `${origin}/account/book-now?stripe=cancelled&cleanup=removed`,
  );
}
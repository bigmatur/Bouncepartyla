import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";
import { addBookingPaymentCore } from "@/lib/booking/admin-booking-payment";

export const dynamic = "force-dynamic";

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function forbidden(message = "Access denied") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

async function authenticate(request: Request) {
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) return { response: unauthorized() } as const;

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!url || !anonKey) {
    return {
      response: NextResponse.json(
        { success: false, error: "Server Supabase configuration is missing." },
        { status: 500 },
      ),
    } as const;
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    return { response: unauthorized("Invalid or expired session.") } as const;
  }

  const access = await getUnifiedAccess(supabase);
  if (
    !access.user ||
    !access.isActive ||
    !isStaffRole(access.role) ||
    !access.can("payments.create")
  ) {
    return {
      response: forbidden("Access denied. Missing permission: payments.create"),
    } as const;
  }

  return { supabase } as const;
}

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;

  const [methodsResult, tipResult] = await Promise.all([
    auth.supabase
      .from("payment_method_settings")
      .select("method, display_name, is_enabled, sort_order")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
    auth.supabase
      .from("payment_pos_settings")
      .select("tips_enabled, allow_custom_tip, tip_mode, default_tip_percent, default_tip_amount, tip_percent_options, tip_amount_options")
      .limit(1)
      .maybeSingle(),
  ]);

  if (methodsResult.error) {
    return NextResponse.json(
      { success: false, error: methodsResult.error.message },
      { status: 400 },
    );
  }

  if (tipResult.error) {
    return NextResponse.json(
      { success: false, error: tipResult.error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      paymentMethods: (methodsResult.data || []).map((row: any) => ({
        method: String(row.method || ""),
        displayName: String(row.display_name || row.method || ""),
      })),
      tipSettings: {
        tipsEnabled: tipResult.data?.tips_enabled === true,
        allowCustomTip: tipResult.data?.allow_custom_tip === true,
        tipMode:
          String(tipResult.data?.tip_mode || "percent") === "amount"
            ? "amount"
            : "percent",
        defaultTipPercent: Number(tipResult.data?.default_tip_percent || 0),
        defaultTipAmount: Number(tipResult.data?.default_tip_amount || 0),
        tipPercentOptions: Array.isArray(tipResult.data?.tip_percent_options)
          ? tipResult.data.tip_percent_options.map(Number)
          : [],
        tipAmountOptions: Array.isArray(tipResult.data?.tip_amount_options)
          ? tipResult.data.tip_amount_options.map(Number)
          : [],
      },
    },
  });
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if ("response" in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  try {
    const bookingId = String(body.bookingId || "").trim();
    const result = await addBookingPaymentCore({
      supabase: auth.supabase,
      bookingId,
      amount: Number(body.amount || 0),
      method: String(body.method || ""),
      baseAmount: Number(body.baseAmount || 0),
      tipAmount: Number(body.tipAmount || 0),
      note: String(body.note || ""),
      discountAmount:
        body.discountAmount === undefined
          ? undefined
          : Number(body.discountAmount),
      discountPassword: String(body.discountPassword || ""),
      stripeSuccessPath: `/admin/bookings/${bookingId}`,
      stripeCancelPath: `/admin/bookings/${bookingId}`,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Could not add payment.",
      },
      { status: 400 },
    );
  }
}

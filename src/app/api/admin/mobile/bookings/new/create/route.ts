import { NextResponse } from "next/server";

import { createMobileBookingAction } from "@/app/admin/bookings/new/actions";

export const dynamic = "force-dynamic";

function responseStatus(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid or expired session") ||
    normalized === "unauthorized"
  ) {
    return 401;
  }

  if (
    normalized.includes("permission") ||
    normalized.includes("access denied")
  ) {
    return 403;
  }

  return 400;
}

export async function POST(request: Request) {
  const authHeader = String(
    request.headers.get("authorization") || "",
  ).trim();

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

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
    const result =
      await createMobileBookingAction(
        token,
        body,
        new URL(request.url).origin,
      );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not create booking.";

    return NextResponse.json(
      { success: false, error: message },
      { status: responseStatus(message) },
    );
  }
}

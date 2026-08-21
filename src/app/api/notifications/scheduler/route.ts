import { NextResponse } from "next/server";
import { runNotificationScheduler } from "@/lib/notifications/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = String(
    process.env.NOTIFICATION_SCHEDULER_SECRET || "",
  ).trim();

  if (!secret) {
    return false;
  }

  const auth =
    request.headers.get("authorization") || "";

  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await runNotificationScheduler({
      processQueue: true,
      limit: 50,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Notification scheduler failed.",
      },
      { status: 500 },
    );
  }
}
import { NextResponse } from "next/server";
import { processNotificationQueue } from "@/lib/notifications/engine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = String(process.env.NOTIFICATION_PROCESSOR_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json({ error: "NOTIFICATION_PROCESSOR_SECRET is not configured." }, { status: 503 });
  }

  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await processNotificationQueue({
    bookingId: body?.bookingId ? String(body.bookingId) : null,
    limit: Number(body?.limit || 25),
  });

  return NextResponse.json(result);
}

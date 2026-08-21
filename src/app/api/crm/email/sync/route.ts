import { NextResponse } from "next/server";
import { syncCrmGmailInbox } from "@/lib/crm/gmail";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = String(process.env.CRM_EMAIL_SYNC_SECRET || "").trim();
  const auth = String(request.headers.get("authorization") || "");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncCrmGmailInbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

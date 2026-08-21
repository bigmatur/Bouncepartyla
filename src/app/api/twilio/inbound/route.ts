import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ingestCrmInboundSms } from "@/lib/crm/sms";

export const runtime = "nodejs";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_WORDS = new Set(["START", "YES", "UNSTOP"]);

function twiml(message?: string) {
  const safe = String(message || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${safe ? `<Message>${safe}</Message>` : ""}</Response>`;
}

function secureEqual(a: string, b: string) {
  try {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function verifyTwilioSignature(params: {
  url: string;
  form: URLSearchParams;
  signature: string;
  authToken: string;
}) {
  let data = params.url;
  const entries = Array.from(params.form.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) data += `${key}${value}`;
  const expected = createHmac("sha1", params.authToken).update(data, "utf8").digest("base64");
  return secureEqual(expected, params.signature);
}

export async function POST(request: Request) {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!authToken) {
    return new NextResponse(twiml(), { status: 503, headers: { "Content-Type": "text/xml" } });
  }

  const raw = await request.text();
  const form = new URLSearchParams(raw);
  const signature = request.headers.get("x-twilio-signature") || "";
  const verificationUrl = String(process.env.TWILIO_INBOUND_WEBHOOK_URL || request.url).trim();

  if (!signature || !verifyTwilioSignature({ url: verificationUrl, form, signature, authToken })) {
    return new NextResponse(twiml(), { status: 403, headers: { "Content-Type": "text/xml" } });
  }

  const from = String(form.get("From") || "").trim();
  const to = String(form.get("To") || "").trim();
  const body = String(form.get("Body") || "").trim();
  const messageSid = String(form.get("MessageSid") || form.get("SmsMessageSid") || "").trim();
  const optOutType = String(form.get("OptOutType") || "").trim().toUpperCase();
  const keyword = body.split(/\s+/)[0]?.toUpperCase() || "";

  let action: "stop" | "start" | null = null;
  if (optOutType === "STOP" || STOP_WORDS.has(keyword)) action = "stop";
  if (optOutType === "START" || START_WORDS.has(keyword)) action = "start";

  if (from && action) {
    const supabase = createServiceClient();
    const result = await supabase.rpc("apply_notification_sms_optout", {
      p_phone: from,
      p_keyword: keyword || optOutType || action.toUpperCase(),
      p_action: action,
    });

    if (result.error) {
      console.error("Twilio opt-out sync failed", result.error);
      return new NextResponse(twiml(), { status: 500, headers: { "Content-Type": "text/xml" } });
    }

    const responseMessage = action === "stop"
      ? "You are unsubscribed from Bounce Party LA SMS. Reply START to resume."
      : "Bounce Party LA SMS notifications are enabled again. Your notification preferences still apply.";

    return new NextResponse(twiml(responseMessage), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  if (from && messageSid) {
    try {
      await ingestCrmInboundSms({
        messageSid,
        from,
        to,
        body,
        numMedia: Number(form.get("NumMedia") || 0),
        raw: Object.fromEntries(form.entries()),
      });
    } catch (error) {
      console.error("CRM inbound SMS import failed", error);
      return new NextResponse(twiml(), { status: 500, headers: { "Content-Type": "text/xml" } });
    }
  }

  return new NextResponse(twiml(), { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

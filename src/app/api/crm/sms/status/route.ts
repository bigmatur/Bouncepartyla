import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { updateCrmSmsDeliveryStatus } from "@/lib/crm/sms";

export const runtime = "nodejs";

function secureEqual(a: string, b: string) {
  try {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function verifyTwilioSignature(params: { url: string; form: URLSearchParams; signature: string; authToken: string }) {
  let data = params.url;
  const entries = Array.from(params.form.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) data += `${key}${value}`;
  const expected = createHmac("sha1", params.authToken).update(data, "utf8").digest("base64");
  return secureEqual(expected, params.signature);
}

export async function POST(request: Request) {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!authToken) return NextResponse.json({ error: "Twilio is not configured." }, { status: 503 });

  const raw = await request.text();
  const form = new URLSearchParams(raw);
  const signature = request.headers.get("x-twilio-signature") || "";
  const verificationUrl = String(process.env.TWILIO_STATUS_CALLBACK_URL || request.url).trim();

  if (!signature || !verifyTwilioSignature({ url: verificationUrl, form, signature, authToken })) {
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 403 });
  }

  try {
    const result = await updateCrmSmsDeliveryStatus({
      messageSid: String(form.get("MessageSid") || ""),
      messageStatus: String(form.get("MessageStatus") || ""),
      errorCode: form.get("ErrorCode"),
      errorMessage: form.get("ErrorMessage"),
    });
    return NextResponse.json({ received: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

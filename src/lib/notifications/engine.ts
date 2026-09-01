import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { sendSmtpEmail } from "@/lib/email/smtp";
import { buildPaymentReceiptPdfBuffer } from "@/lib/email/receipt-pdf";
import { buildSignedContractPdfAttachment } from "@/lib/email/signed-contract-pdf";

function appOrigin() {
  return String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001")
    .trim()
    .replace(/\/$/, "");
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}


function notificationPhoneKey(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render(template: string, vars: Record<string, string>) {
  return String(template || "")
    .replaceAll("\\n", "\n")
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}

async function createUnsubscribeToken(params: {
  customerId: string;
  categoryCode: string;
  channel: "email" | "sms";
}) {
  const supabase = createServiceClient();

  /*
   * Unsubscribe links are bearer tokens.
   *
   * Keep them usable long enough for normal email/SMS workflows,
   * but do not create permanent credentials.
   */
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const result = await supabase
    .from("notification_unsubscribe_tokens")
    .insert({
      customer_id: params.customerId,
      category_code: params.categoryCode,
      channel: params.channel,
      expires_at: expiresAt,
    })
    .select("token")
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return String(result.data.token);
}

export async function enqueueBookingNotification(params: {
  eventCode: string;
  bookingId: string;
  dedupeSuffix?: string | null;
  payload?: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  const result = await supabase.rpc("enqueue_customer_booking_notification", {
    p_event_code: params.eventCode,
    p_booking_id: params.bookingId,
    p_dedupe_suffix: params.dedupeSuffix || null,
    p_payload: params.payload || {},
  });
  if (result.error) throw new Error(result.error.message);
  return Number(result.data || 0);
}


async function sendTwilioSms(params: { to: string; body: string }) {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || "").trim();
  if (!sid || !token || !from) throw new Error("twilio_not_configured");

  const body = new URLSearchParams({ To: params.to, From: from, Body: params.body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((payload as any)?.message || "twilio_send_failed"));
  return { sid: String((payload as any)?.sid || "") };
}

async function processOneDelivery(delivery: any) {
  const supabase = createServiceClient();

  const [templateResult, bookingResult, customerResult] = await Promise.all([
    delivery.template_id
      ? supabase
          .from("notification_templates")
          .select("id,event_code,channel,subject,body_html,body_text,active")
          .eq("id", delivery.template_id)
          .maybeSingle()
      : supabase
          .from("notification_templates")
          .select("id,event_code,channel,subject,body_html,body_text,active")
          .eq("event_code", delivery.event_code)
          .eq("channel", delivery.channel)
          .eq("active", true)
          .maybeSingle(),
    delivery.booking_id
      ? supabase
          .from("bookings")
          .select(
            "id,booking_number,event_date,subtotal,modifiers_total,delivery_fee,discount_amount,tax_amount,total_amount,deposit_amount,amount_paid,balance_due,payment_status,contract_status,customer_id",
          )
          .eq("id", delivery.booking_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    delivery.customer_id
      ? supabase
          .from("customers")
          .select("id,full_name,email,phone")
          .eq("id", delivery.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
  ]);

  if (templateResult.error) throw new Error(templateResult.error.message);
  if (bookingResult.error) throw new Error(bookingResult.error.message);
  if (customerResult.error) throw new Error(customerResult.error.message);

  const template: any = templateResult.data;
  const booking: any = bookingResult.data;
  const customer: any = customerResult.data;
  const payload = (delivery.payload || {}) as Record<string, any>;

  if (!template || template.active === false) {
    await supabase
      .from("notification_deliveries")
      .update({ status: "suppressed", error_message: "template_not_available" })
      .eq("id", delivery.id);
    return { status: "suppressed" as const };
  }

  const origin = appOrigin();
  const bookingId = String(booking?.id || delivery.booking_id || "");
  const bookingNumber = String(booking?.booking_number || bookingId.slice(0, 8));
  const fullName = String(customer?.full_name || "Customer").trim();
  const firstName = fullName.split(/\s+/)[0] || "Customer";
  const preferencesUrl = `${origin}/account/notifications`;

  let unsubscribeCategoryUrl = preferencesUrl;
  let unsubscribeAllUrl = preferencesUrl;
  if (delivery.customer_id && (delivery.channel === "email" || delivery.channel === "sms")) {
    const token = await createUnsubscribeToken({
      customerId: String(delivery.customer_id),
      categoryCode: String(delivery.category_code),
      channel: delivery.channel,
    });
    unsubscribeCategoryUrl = `${origin}/notifications/unsubscribe?token=${encodeURIComponent(token)}&scope=category`;
    unsubscribeAllUrl = `${origin}/notifications/unsubscribe?token=${encodeURIComponent(token)}&scope=all`;
  }

  const vars: Record<string, string> = {
    customer_name: fullName,
    customer_first_name: firstName,
    booking_number: bookingNumber,
    event_date: String(booking?.event_date || ""),
    total: money(booking?.total_amount),
    deposit_amount: money(booking?.deposit_amount),
    amount_paid: money(booking?.amount_paid),
    balance_due: money(booking?.balance_due),
    payment_amount: money(payload.payment_amount),
    tip_amount: money(payload.tip_amount),
    booking_url: bookingId ? `${origin}/account/bookings/${bookingId}` : `${origin}/account`,
    action_url: String(payload.action_url || (bookingId ? `${origin}/account/bookings/${bookingId}` : `${origin}/account`)),
    expires_at: String(payload.expires_at || ""),
    preferences_url: preferencesUrl,
    unsubscribe_category_url: unsubscribeCategoryUrl,
    unsubscribe_all_url: unsubscribeAllUrl,
  };

  const subject = render(String(template.subject || "Bounce Party LA"), vars);
  const bodyText = render(String(template.body_text || ""), vars);
  const bodyHtmlTemplate = render(String(template.body_html || ""), vars);
  const bodyHtml = bodyHtmlTemplate || `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1d1d1b;">${escapeHtml(bodyText).replaceAll("\n", "<br />")}</div>`;

  const footer = delivery.channel === "email"
    ? `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #ece7df;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#777;">Bounce Party LA · <a href="${escapeHtml(preferencesUrl)}">Manage notification preferences</a> · <a href="${escapeHtml(unsubscribeCategoryUrl)}">Unsubscribe from this type</a> · <a href="${escapeHtml(unsubscribeAllUrl)}">Unsubscribe from optional emails</a></div>`
    : "";

  await supabase
    .from("notification_deliveries")
    .update({
      status: "processing",
      attempt_count: Number(delivery.attempt_count || 0) + 1,
      subject,
      rendered_body: bodyText,
      error_message: null,
    })
    .eq("id", delivery.id);

  if (delivery.channel === "in_app") {
    await supabase
      .from("notification_deliveries")
      .update({ status: "delivered", sent_at: new Date().toISOString(), delivered_at: new Date().toISOString() })
      .eq("id", delivery.id);
    return { status: "delivered" as const };
  }

  if (delivery.channel === "email") {
    const to = String(delivery.recipient_email || customer?.email || "").trim();
    if (!to) throw new Error("recipient_email_missing");

    let attachments: Array<{ filename: string; content: Buffer; contentType?: string }> | undefined;

    if (delivery.event_code === "contract_signed") {
      try {
        let contractId = String(payload.contract_id || "").trim();

        if (!contractId && bookingId) {
          const contractResult = await supabase
            .from("contracts")
            .select("id")
            .eq("booking_id", bookingId)
            .eq("status", "signed")
            .order("signed_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!contractResult.error) {
            contractId = String(contractResult.data?.id || "").trim();
          }
        }

        if (contractId) {
          attachments = [
            await buildSignedContractPdfAttachment({
              supabase,
              contractId,
              bookingNumber,
            }),
          ];
        }
      } catch (error) {
        console.error("Signed contract PDF generation failed", error);
      }
    }

    if (delivery.event_code === "payment_received" || delivery.event_code === "deposit_paid") {
      try {
        const designResult = await supabase
          .from("booking_receipt_design_settings")
          .select(
            "logo_url, brand_name, accent_color, receipt_title, footer_text, business_address, business_phone, business_email, business_website",
          )
          .limit(1)
          .maybeSingle();
        const design = designResult.error ? null : (designResult.data as any);

        const lineItems: Array<{ label: string; amount: number; emphasized?: boolean; negative?: boolean }> = [];
        if (Number(booking?.subtotal || 0) !== 0) {
          lineItems.push({ label: "Equipment", amount: Number(booking.subtotal) });
        }
        if (Number(booking?.modifiers_total || 0) !== 0) {
          lineItems.push({ label: "Options", amount: Number(booking.modifiers_total) });
        }
        if (Number(booking?.delivery_fee || 0) !== 0) {
          lineItems.push({ label: "Delivery", amount: Number(booking.delivery_fee) });
        }
        if (Number(booking?.discount_amount || 0) !== 0) {
          lineItems.push({ label: "Discount", amount: Number(booking.discount_amount), negative: true });
        }
        if (Number(booking?.tax_amount || 0) !== 0) {
          lineItems.push({ label: "Sales tax", amount: Number(booking.tax_amount) });
        }
        lineItems.push({ label: "Total", amount: Number(booking?.total_amount || 0) });
        lineItems.push({ label: "Payment amount", amount: Number(payload.payment_amount || 0), emphasized: true });
        lineItems.push({ label: "Total paid", amount: Number(booking?.amount_paid || 0) });
        lineItems.push({ label: "Balance due", amount: Number(booking?.balance_due || 0) });

        const receiptPdf = await buildPaymentReceiptPdfBuffer({
          brandName: design?.brand_name,
          accentColorHex: design?.accent_color,
          receiptTitle: design?.receipt_title,
          footerText: design?.footer_text,
          logoUrl: design?.logo_url,
          businessAddress: design?.business_address,
          businessPhone: design?.business_phone,
          businessEmail: design?.business_email,
          businessWebsite: design?.business_website,
          bookingNumber,
          customerName: fullName,
          eventDate: String(booking?.event_date || ""),
          lineItems,
        });
        attachments = [
          { filename: `receipt-${bookingNumber}.pdf`, content: receiptPdf, contentType: "application/pdf" },
        ];
      } catch (error) {
        console.error("Receipt PDF generation failed", error);
      }
    }

    const sent = await sendSmtpEmail({
      to,
      subject,
      html: `${bodyHtml}${footer}`,
      text: `${bodyText}\n\nManage preferences: ${preferencesUrl}\nUnsubscribe from this type: ${unsubscribeCategoryUrl}\nUnsubscribe from optional emails: ${unsubscribeAllUrl}`,
      attachments,
    });

    if (!sent.sent) throw new Error(sent.reason);

    await supabase
      .from("notification_deliveries")
      .update({
        status: "sent",
        provider_message_id: sent.messageId || null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    return { status: "sent" as const };
  }

  if (delivery.channel === "sms") {
    const to = String(delivery.recipient_phone || customer?.phone || "").trim();
    if (!to) throw new Error("recipient_phone_missing");

    const phoneKey = notificationPhoneKey(to);
    if (phoneKey) {
      const suppression = await supabase
        .from("notification_sms_suppressions")
        .select("phone_key")
        .eq("phone_key", phoneKey)
        .maybeSingle();
      if (suppression.error) throw new Error(suppression.error.message);
      if (suppression.data) {
        await supabase
          .from("notification_deliveries")
          .update({ status: "suppressed", error_message: "sms_opted_out" })
          .eq("id", delivery.id);
        return { status: "suppressed" as const };
      }
    }

    const smsBody = `${bodyText}\n\nManage preferences: ${preferencesUrl}\nReply STOP to opt out.`.trim();
    const sent = await sendTwilioSms({ to, body: smsBody });
    await supabase
      .from("notification_deliveries")
      .update({
        status: "sent",
        provider_message_id: sent.sid || null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    return { status: "sent" as const };
  }

  throw new Error("unsupported_notification_channel");
}

export async function processNotificationQueue(params?: {
  bookingId?: string | null;
  limit?: number;
}) {
  const supabase = createServiceClient();
  const limit = Math.min(50, Math.max(1, Number(params?.limit || 20)));

  let query = supabase
    .from("notification_deliveries")
    .select("*")
    .in("status", ["queued", "failed"])
    .lte("scheduled_for", new Date().toISOString())
    .lt("attempt_count", 3)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (params?.bookingId) query = query.eq("booking_id", params.bookingId);

  const result = await query;
  if (result.error) throw new Error(result.error.message);

  let sent = 0;
  let delivered = 0;
  let failed = 0;

  for (const delivery of result.data || []) {
    try {
      const processed = await processOneDelivery(delivery);
      if (processed.status === "sent") sent += 1;
      if (processed.status === "delivered") delivered += 1;
    } catch (error) {
      failed += 1;
      await supabase
        .from("notification_deliveries")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        })
        .eq("id", delivery.id);
    }
  }

  return { processed: (result.data || []).length, sent, delivered, failed };
}

export async function processNotificationQueueBestEffort(params?: {
  bookingId?: string | null;
  limit?: number;
}) {
  try {
    return await processNotificationQueue(params);
  } catch (error) {
    console.error("Notification queue processing failed", error);
    return { processed: 0, sent: 0, delivered: 0, failed: 1 };
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function buildPdfBufferFromHtml(html: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });

    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "10mm",
        bottom: "12mm",
        left: "10mm",
      },
    });
  } finally {
    await browser.close();
  }
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const contractId = String(params.id || "").trim();

  if (!contractId) {
    return NextResponse.json({ error: "Missing contract id." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const downloadFormat = (searchParams.get("format") || "pdf").toLowerCase();
  const wantsHtml = downloadFormat === "html";

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contracts")
    .select(
      "id, booking_id, status, signer_name, signer_email, signed_at, rendered_html, signature_metadata"
    )
    .eq("id", contractId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  }

  const rendered = String((data as any).rendered_html || "").trim();

  if (!rendered) {
    return NextResponse.json(
      { error: "Contract has no rendered HTML to download." },
      { status: 422 }
    );
  }

  const signedAt = (data as any).signed_at
    ? new Date(String((data as any).signed_at)).toLocaleString("en-US")
    : "-";

  const signerName = escapeHtml(String((data as any).signer_name || ""));
  const signerEmail = escapeHtml(String((data as any).signer_email || ""));
  const status = escapeHtml(String((data as any).status || "unknown"));

  const signatureMeta = (data as any).signature_metadata || {};
  const signatureImage = String(signatureMeta.signatureImageDataUrl || "").trim();
  const signatureText = escapeHtml(String(signatureMeta.manualSignature || "").trim());

  let orderSummaryBlock = "";

  if ((data as any).booking_id) {
    const bookingId = String((data as any).booking_id);

    const [bookingResult, bookingItemsResult] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, booking_number, event_date, event_start_time, event_end_time, setup_address, setup_city, setup_state, setup_zip, subtotal, discount_amount, delivery_fee, tax_amount, total_amount, deposit_amount, balance_due, customers(full_name, email)"
        )
        .eq("id", bookingId)
        .maybeSingle(),

      supabase
        .from("booking_items")
        .select("id, quantity, unit_price, subtotal, products(name)")
        .eq("booking_id", bookingId),
    ]);

    if (!bookingResult.error && bookingResult.data) {
      const booking = bookingResult.data as any;
      const customer = Array.isArray(booking.customers)
        ? booking.customers[0] || null
        : booking.customers;

      const itemRows = (bookingItemsResult.data || [])
        .map((item: any) => {
          const product = Array.isArray(item.products)
            ? item.products[0] || null
            : item.products;
          const qty = Number(item.quantity || 1);
          const unit = Number(item.unit_price || 0);
          const line = Number(item.subtotal || qty * unit);
          return `<tr><td style="padding:6px 0;">${escapeHtml(
            product?.name || "Item"
          )} x ${qty}</td><td style="padding:6px 0;text-align:right;">$${line.toFixed(
            2
          )}</td></tr>`;
        })
        .join("");

      orderSummaryBlock = `
      <section style="border:1px solid #e7ddd0;border-radius:14px;padding:16px;margin-bottom:16px;background:#fcfaf7;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9a7a49;font-weight:700;">Order Summary</div>
        <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;color:#4b4339;">
          <div><strong>Booking:</strong> ${escapeHtml(
            booking.booking_number || String(booking.id || "").slice(0, 8)
          )}</div>
          <div><strong>Customer:</strong> ${escapeHtml(customer?.full_name || "-")}</div>
          <div><strong>Email:</strong> ${escapeHtml(customer?.email || "-")}</div>
          <div><strong>Date:</strong> ${escapeHtml(booking.event_date || "-")}</div>
          <div><strong>Time:</strong> ${escapeHtml(
            `${booking.event_start_time || ""} - ${booking.event_end_time || ""}`
          )}</div>
          <div style="grid-column:1 / -1;"><strong>Address:</strong> ${escapeHtml(
            `${booking.setup_address || ""}, ${booking.setup_city || ""}, ${
              booking.setup_state || ""
            } ${booking.setup_zip || ""}`
          )}</div>
        </div>
        <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:13px;color:#3f382f;">
          <tbody>${itemRows}</tbody>
        </table>
        <div style="margin-top:10px;border-top:1px solid #e7ddd0;padding-top:10px;display:grid;gap:4px;font-size:13px;color:#3f382f;">
          <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><strong>$${Number(
            booking.subtotal || 0
          ).toFixed(2)}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Discount</span><strong>$${Number(
            booking.discount_amount || 0
          ).toFixed(2)}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Delivery</span><strong>$${Number(
            booking.delivery_fee || 0
          ).toFixed(2)}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Tax</span><strong>$${Number(
            booking.tax_amount || 0
          ).toFixed(2)}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:15px;"><span>Total</span><strong>$${Number(
            booking.total_amount || 0
          ).toFixed(2)}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Deposit</span><strong>$${Number(
            booking.deposit_amount || 0
          ).toFixed(2)}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Balance due</span><strong>$${Number(
            booking.balance_due || 0
          ).toFixed(2)}</strong></div>
        </div>
      </section>`;
    }
  }

  const hasOrderSummaryInRendered = rendered.toLowerCase().includes("order summary");
  const hasSignatureInRendered =
    rendered.toLowerCase().includes("manual signature") ||
    rendered.toLowerCase().includes("signature") ||
    rendered.toLowerCase().includes("<img src=\"data:image");

  const signatureBlock =
    !hasSignatureInRendered && (signatureImage || signatureText)
      ? `<section style="margin-top:16px;border-top:1px solid #e7ddd0;padding-top:12px;"><div style="font-size:12px;color:#9a7a49;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Manual signature</div><div style="margin-top:8px;">${
          signatureImage
            ? `<img src="${signatureImage}" alt="Manual signature" style="display:block;max-width:280px;height:auto;border-bottom:1px solid #d8cec0;padding-bottom:2px;" />`
            : signatureText
        }</div></section>`
      : "";

  const fullRendered = `${hasOrderSummaryInRendered ? "" : orderSummaryBlock}${rendered}${signatureBlock}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signed contract ${escapeHtml(contractId.slice(0, 8))}</title>
    <style>
      body { margin: 0; background: #f6f3ef; font-family: Arial, sans-serif; color: #201d1a; }
      .wrap { max-width: 900px; margin: 24px auto; background: #fff; border: 1px solid #e7ddd0; border-radius: 14px; overflow: hidden; }
      .head { padding: 16px 20px; background: #23313f; color: #fff; }
      .meta { padding: 12px 20px; border-bottom: 1px solid #eee5d9; font-size: 13px; color: #5f5448; display: grid; gap: 6px; }
      .content { padding: 20px; }
      .label { color: #9a7a49; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; }
      @media print {
        body { background: #fff; }
        .wrap { margin: 0; border: 0; border-radius: 0; max-width: 100%; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="head">
        <div class="label">Bounce Party LA</div>
        <h2 style="margin:6px 0 0 0; font-size:24px;">Signed contract</h2>
      </div>
      <div class="meta">
        <div><strong>Status:</strong> ${status}</div>
        <div><strong>Signer:</strong> ${signerName || "-"}</div>
        <div><strong>Email:</strong> ${signerEmail || "-"}</div>
        <div><strong>Signed at:</strong> ${escapeHtml(signedAt)}</div>
      </div>
      <div class="content">${fullRendered}</div>
    </div>
  </body>
</html>`;

  if (wantsHtml) {
    const filename = `signed-contract-${contractId.slice(0, 8)}.html`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const pdfBuffer = await buildPdfBufferFromHtml(html);
    const filename = `signed-contract-${contractId.slice(0, 8)}.pdf`;

    return new NextResponse(pdfBuffer as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const fallbackName = `signed-contract-${contractId.slice(0, 8)}.html`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${fallbackName}\"`,
        "Cache-Control": "no-store",
        "X-Contract-Download-Warning": `pdf_generation_failed:${encodeURIComponent(String((error as Error | null)?.message || "unknown").slice(0, 120))}`,
      },
    });
  }
}

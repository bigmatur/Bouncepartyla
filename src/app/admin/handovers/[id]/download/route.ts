import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function itemRows(items: any[], fallback: string) {
  if (!items.length) {
    return `<tr><td colspan="2" class="empty">No ${escapeHtml(fallback)} recorded.</td></tr>`;
  }

  return items.map((item) => `
    <tr>
      <td>${escapeHtml(item.name || fallback)}${item.variant_name ? ` <span class="muted">${escapeHtml(item.variant_name)}</span>` : ""}</td>
      <td class="quantity">${escapeHtml(item.quantity || 0)}</td>
    </tr>
  `).join("");
}

function formatDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? raw
    : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const handoverId = String(id || "").trim();

  if (!handoverId) {
    return NextResponse.json({ error: "Missing handover id." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handover_documents")
    .select("id, status, template_snapshot, items_snapshot, booking_snapshot, signer_name, signer_email, signed_at, signature_metadata, rendered_html")
    .eq("id", handoverId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || String(data.status || "").toLowerCase() !== "signed") {
    return NextResponse.json(
      { error: "Signed handover document is not available." },
      { status: 404 },
    );
  }

  const booking = (data as any).booking_snapshot || {};
  const items = (data as any).items_snapshot || {};
  const products = Array.isArray(items.products) ? items.products : [];
  const components = Array.isArray(items.components) ? items.components : [];
  const options = Array.isArray(items.options) ? items.options : [];
  const signature = String((data as any).signature_metadata?.signatureImageDataUrl || "").trim();
  const address = [booking.setup_address, booking.setup_city, booking.setup_state, booking.setup_zip]
    .filter(Boolean)
    .map(escapeHtml)
    .join(", ") || "-";
  const documentHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Equipment Handover ${escapeHtml(booking.booking_number || handoverId.slice(0, 8))}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f5f1eb; color: #25211e; font-family: Arial, sans-serif; }
      .document { max-width: 820px; margin: 28px auto; background: #fff; border: 1px solid #dcd1c4; }
      header { padding: 28px 32px; background: #243342; color: #fff; }
      .eyebrow { color: #e5b56f; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
      h1 { margin: 7px 0 0; font-size: 28px; }
      .content { padding: 28px 32px 36px; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
      .meta div, .address { border: 1px solid #e5dbd0; padding: 12px; background: #fcfaf7; }
      .label { display: block; margin-bottom: 5px; color: #8a6d48; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
      h2 { margin: 28px 0 10px; font-size: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th { padding: 9px 10px; background: #f2ece4; color: #6d5b49; font-size: 10px; letter-spacing: .08em; text-align: left; text-transform: uppercase; }
      td { padding: 10px; border-bottom: 1px solid #ece4da; vertical-align: top; }
      .quantity { width: 80px; text-align: right; font-weight: 700; }
      .muted { color: #75695d; font-size: 12px; }
      .empty { color: #75695d; font-style: italic; }
      .terms { margin-top: 26px; line-height: 1.55; }
      .signature { margin-top: 30px; border-top: 1px solid #dcd1c4; padding-top: 18px; }
      .signature img { display: block; max-width: 260px; max-height: 120px; margin: 12px 0; border-bottom: 1px solid #bdb2a6; }
      @media print { body { background: #fff; } .document { margin: 0; border: 0; max-width: none; } }
    </style>
  </head>
  <body>
    <article class="document">
      <header><div class="eyebrow">Bounce Party LA</div><h1>Equipment Delivery &amp; Acceptance</h1></header>
      <main class="content">
        <div class="meta">
          <div><span class="label">Booking</span><strong>${escapeHtml(booking.booking_number || handoverId.slice(0, 8))}</strong></div>
          <div><span class="label">Event date</span><strong>${escapeHtml(formatDate(booking.event_date))}</strong></div>
          <div><span class="label">Customer</span><strong>${escapeHtml(booking.customer_name || (data as any).signer_name || "-")}</strong></div>
          <div><span class="label">Signed at</span><strong>${escapeHtml(formatDate((data as any).signed_at))}</strong></div>
        </div>
        <div class="address"><span class="label">Delivery address</span>${address}</div>
        <section class="terms">${String((data as any).template_snapshot || "")}</section>
        <h2>Delivered products</h2><table><thead><tr><th>Item</th><th class="quantity">Qty</th></tr></thead><tbody>${itemRows(products, "products")}</tbody></table>
        <h2>Delivered components</h2><table><thead><tr><th>Item</th><th class="quantity">Qty</th></tr></thead><tbody>${itemRows(components, "components")}</tbody></table>
        <h2>Selected options</h2><table><thead><tr><th>Item</th><th class="quantity">Qty</th></tr></thead><tbody>${itemRows(options, "options")}</tbody></table>
        <section class="signature"><span class="label">Customer / authorized person signature</span>${signature ? `<img src="${signature}" alt="Customer signature" />` : ""}<strong>${escapeHtml((data as any).signer_name || "-")}</strong><div class="muted">Signed ${escapeHtml(formatDate((data as any).signed_at))}</div></section>
      </main>
    </article>
  </body>
</html>`;

  const isDownload = new URL(request.url).searchParams.get("download") === "1";
  const filename = `equipment-handover-${handoverId.slice(0, 8)}.html`;

  return new NextResponse(documentHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
    },
  });
}
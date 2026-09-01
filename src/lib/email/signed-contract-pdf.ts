import "server-only";

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function signatureFallback(params: {
  signatureImageDataUrl: string;
  manualSignature: string;
}) {
  if (!params.signatureImageDataUrl && !params.manualSignature) return "";

  const signature = params.signatureImageDataUrl
    ? `<img src="${params.signatureImageDataUrl}" alt="Manual signature" style="display:block;max-width:280px;height:auto;border-bottom:1px solid #d8cec0;padding-bottom:2px;" />`
    : escapeHtml(params.manualSignature);

  return `<section style="margin-top:16px;border-top:1px solid #e7ddd0;padding-top:12px;"><div style="font-size:12px;color:#9a7a49;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Manual signature</div><div style="margin-top:8px;">${signature}</div></section>`;
}

function signedContractHtml(params: {
  contractId: string;
  status: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  renderedHtml: string;
}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><style>
  body{margin:0;background:#f6f3ef;font-family:Arial,sans-serif;color:#201d1a}.wrap{max-width:900px;margin:24px auto;background:#fff;border:1px solid #e7ddd0;border-radius:14px;overflow:hidden}.head{padding:16px 20px;background:#23313f;color:#fff}.meta{padding:12px 20px;border-bottom:1px solid #eee5d9;font-size:13px;color:#5f5448;display:grid;gap:6px}.content{padding:20px}.label{color:#f0c987;text-transform:uppercase;font-size:11px;letter-spacing:.08em}@media print{body{background:#fff}.wrap{margin:0;border:0;border-radius:0;max-width:100%}}
  </style></head><body><div class="wrap"><div class="head"><div class="label">Bounce Party LA</div><h2 style="margin:6px 0 0;font-size:24px">Signed contract</h2></div><div class="meta"><div><strong>Status:</strong> ${escapeHtml(params.status || "signed")}</div><div><strong>Signer:</strong> ${escapeHtml(params.signerName || "-")}</div><div><strong>Email:</strong> ${escapeHtml(params.signerEmail || "-")}</div><div><strong>Signed at:</strong> ${escapeHtml(params.signedAt || "-")}</div></div><div class="content">${params.renderedHtml}</div></div></body></html>`;
}

async function htmlPdf(html: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    return Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
      }),
    );
  } finally {
    await browser.close();
  }
}

function htmlToText(html: string) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|section|h[1-6])>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fallbackPdf(params: {
  contractId: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  renderedHtml: string;
  signatureImageDataUrl: string;
  manualSignature: string;
}) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595;
  const height = 842;
  const margin = 42;
  const maxWidth = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const newPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
  };

  const drawWrapped = (text: string, size = 10, isBold = false) => {
    const selectedFont = isBold ? bold : font;
    const paragraphs = String(text || "").split(/\n+/);
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = "";
      const flush = () => {
        if (!line) return;
        if (y < margin + 18) newPage();
        page.drawText(line, { x: margin, y, size, font: selectedFont, color: rgb(0.12, 0.11, 0.1) });
        y -= size + 5;
        line = "";
      };
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (selectedFont.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
        else {
          flush();
          line = word;
        }
      }
      flush();
      y -= 4;
    }
  };

  drawWrapped("Bounce Party LA — Signed contract", 16, true);
  drawWrapped(`Contract: ${params.contractId.slice(0, 8)}`, 9);
  drawWrapped(`Signer: ${params.signerName || "-"}`, 9);
  drawWrapped(`Email: ${params.signerEmail || "-"}`, 9);
  drawWrapped(`Signed at: ${params.signedAt || "-"}`, 9);
  y -= 8;
  drawWrapped(htmlToText(params.renderedHtml), 9);

  if (params.signatureImageDataUrl || params.manualSignature) {
    if (y < margin + 120) newPage();
    y -= 10;
    drawWrapped("Manual signature", 10, true);

    const match = params.signatureImageDataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
    if (match) {
      try {
        const bytes = Buffer.from(match[2], "base64");
        const image = match[1].toLowerCase() === "png"
          ? await pdf.embedPng(bytes)
          : await pdf.embedJpg(bytes);
        const scale = Math.min(240 / image.width, 80 / image.height, 1);
        const imageWidth = image.width * scale;
        const imageHeight = image.height * scale;
        if (y < margin + imageHeight) newPage();
        page.drawImage(image, { x: margin, y: y - imageHeight, width: imageWidth, height: imageHeight });
        y -= imageHeight + 8;
      } catch {
        if (params.manualSignature) drawWrapped(params.manualSignature, 12);
      }
    } else if (params.manualSignature) {
      drawWrapped(params.manualSignature, 12);
    }
  }

  return Buffer.from(await pdf.save());
}

export async function buildSignedContractPdfAttachment(params: {
  supabase: any;
  contractId: string;
  bookingNumber?: string | null;
}) {
  const contractId = String(params.contractId || "").trim();
  if (!contractId) throw new Error("Missing contract id.");

  const result = await params.supabase
    .from("contracts")
    .select("id,status,signer_name,signer_email,signed_at,rendered_html,signature_metadata")
    .eq("id", contractId)
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Signed contract was not found.");

  const contract = result.data as any;
  const meta = (contract.signature_metadata || {}) as Record<string, unknown>;
  const signatureImageDataUrl = String(meta.signatureImageDataUrl || "").trim();
  const manualSignature = String(meta.manualSignature || contract.signer_name || "").trim();
  const safeRenderedHtml = String(contract.rendered_html || "").trim();
  if (!safeRenderedHtml) throw new Error("Signed contract content is missing.");

  const renderedHasSignature =
    safeRenderedHtml.toLowerCase().includes("manual signature") ||
    safeRenderedHtml.toLowerCase().includes('<img src="data:image') ||
    safeRenderedHtml.toLowerCase().includes("<img src='data:image");

  const mergedRenderedHtml = renderedHasSignature
    ? safeRenderedHtml
    : `${safeRenderedHtml}${signatureFallback({ signatureImageDataUrl, manualSignature })}`;

  const html = signedContractHtml({
    contractId,
    status: String(contract.status || "signed"),
    signerName: String(contract.signer_name || ""),
    signerEmail: String(contract.signer_email || ""),
    signedAt: String(contract.signed_at || ""),
    renderedHtml: mergedRenderedHtml,
  });

  let content: Buffer;
  try {
    content = await htmlPdf(html);
  } catch (error) {
    console.error("Signed contract HTML PDF generation failed; using fallback PDF", error);
    content = await fallbackPdf({
      contractId,
      signerName: String(contract.signer_name || ""),
      signerEmail: String(contract.signer_email || ""),
      signedAt: String(contract.signed_at || ""),
      renderedHtml: mergedRenderedHtml,
      signatureImageDataUrl,
      manualSignature,
    });
  }

  const bookingLabel = String(params.bookingNumber || "").trim() || contractId.slice(0, 8);
  return {
    filename: `signed-contract-${bookingLabel}.pdf`,
    content,
    contentType: "application/pdf",
  };
}

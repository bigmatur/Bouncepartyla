import "server-only";

function money(value: unknown) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

function hexToRgbTuple(hex: string | null | undefined) {
  const match = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ] as const;
}

export type ReceiptLineItem = {
  label: string;
  amount: number;
  emphasized?: boolean;
  negative?: boolean;
};

export async function buildPaymentReceiptPdfBuffer(params: {
  brandName?: string | null;
  accentColorHex?: string | null;
  receiptTitle?: string | null;
  footerText?: string | null;
  logoUrl?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  businessWebsite?: string | null;
  bookingNumber: string;
  customerName: string;
  eventDate: string;
  paidAt?: string;
  lineItems: ReceiptLineItem[];
}) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const accentTuple = hexToRgbTuple(params.accentColorHex) || ([0.14, 0.19, 0.25] as const);
  const accentColor = rgb(accentTuple[0], accentTuple[1], accentTuple[2]);
  const muted = rgb(0.45, 0.42, 0.38);
  const dark = rgb(0.12, 0.11, 0.1);
  const lightRule = rgb(0.9, 0.87, 0.82);

  const pageWidth = 595;
  const marginX = 48;

  const estimatedHeight =
    260 +
    params.lineItems.length * 22 +
    (params.businessAddress ? 14 : 0) +
    (params.businessPhone || params.businessEmail || params.businessWebsite ? 14 : 0);
  const pageHeight = Math.max(420, estimatedHeight);

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 48;

  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  if (params.logoUrl) {
    try {
      const response = await fetch(params.logoUrl, { cache: "no-store" });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "";
      logoImage = contentType.includes("png")
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);
    } catch {
      logoImage = null;
    }
  }

  const headerTextX = marginX + (logoImage ? 52 : 0);

  if (logoImage) {
    const logoSize = 40;
    const scale = logoSize / Math.max(logoImage.width, logoImage.height);
    page.drawImage(logoImage, {
      x: marginX,
      y: y - logoSize + 8,
      width: logoImage.width * scale,
      height: logoImage.height * scale,
    });
  }

  page.drawText(params.brandName || "Bounce Party LA", {
    x: headerTextX,
    y,
    size: 19,
    font: boldFont,
    color: accentColor,
  });

  y -= 20;
  page.drawText(params.receiptTitle || "Payment Receipt", {
    x: headerTextX,
    y,
    size: 11,
    font,
    color: muted,
  });

  // Business contact block, right-aligned in the header.
  const contactLines = [
    params.businessAddress,
    [params.businessPhone, params.businessEmail].filter(Boolean).join("  ·  "),
    params.businessWebsite,
  ].filter((line): line is string => Boolean(line && line.trim()));

  let contactY = pageHeight - 48;
  for (const line of contactLines) {
    const size = 9;
    const width = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: pageWidth - marginX - width,
      y: contactY,
      size,
      font,
      color: muted,
    });
    contactY -= 12;
  }

  y -= 28;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: pageWidth - marginX, y },
    thickness: 1,
    color: lightRule,
  });

  y -= 26;
  const infoRow = (label: string, value: string) => {
    page.drawText(label, { x: marginX, y, size: 10, font, color: muted });
    const width = font.widthOfTextAtSize(value, 10);
    page.drawText(value, {
      x: pageWidth - marginX - width,
      y,
      size: 10,
      font: boldFont,
      color: dark,
    });
    y -= 18;
  };

  infoRow("Booking", params.bookingNumber || "-");
  infoRow("Customer", params.customerName || "-");
  infoRow("Event date", params.eventDate || "-");
  infoRow("Paid at", params.paidAt || new Date().toISOString().slice(0, 10));

  y -= 10;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: pageWidth - marginX, y },
    thickness: 1,
    color: lightRule,
  });
  y -= 22;

  for (const item of params.lineItems) {
    const size = item.emphasized ? 13 : 11;
    const label = item.emphasized ? item.label.toUpperCase() : item.label;
    const displayAmount = `${item.negative ? "-" : ""}${money(Math.abs(item.amount))}`;

    page.drawText(label, {
      x: marginX,
      y,
      size,
      font: item.emphasized ? boldFont : font,
      color: item.emphasized ? accentColor : dark,
    });

    const amountWidth = (item.emphasized ? boldFont : font).widthOfTextAtSize(displayAmount, size);
    page.drawText(displayAmount, {
      x: pageWidth - marginX - amountWidth,
      y,
      size,
      font: item.emphasized ? boldFont : font,
      color: item.emphasized ? accentColor : dark,
    });

    y -= item.emphasized ? 24 : 20;
  }

  y -= 12;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: pageWidth - marginX, y },
    thickness: 1,
    color: lightRule,
  });

  y -= 24;
  page.drawText(params.footerText || "Thank you for booking with us!", {
    x: marginX,
    y,
    size: 10,
    font,
    color: muted,
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

import "server-only";

import type { BookingInvoiceData } from "./booking-invoice";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function pdfText(value: unknown) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, "?");
}

function hexToRgb(hex: string) {
  const match = String(hex || "").match(/^#?([0-9a-f]{6})$/i);
  if (!match) return [0.137, 0.192, 0.247] as const;
  return [
    parseInt(match[1].slice(0, 2), 16) / 255,
    parseInt(match[1].slice(2, 4), 16) / 255,
    parseInt(match[1].slice(4, 6), 16) / 255,
  ] as const;
}

export async function buildBookingInvoicePdf(data: BookingInvoiceData) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accentTuple = hexToRgb(data.business.accentColor);
  const accent = rgb(...accentTuple);
  const dark = rgb(0.12, 0.11, 0.1);
  const muted = rgb(0.43, 0.4, 0.36);
  const rule = rgb(0.89, 0.86, 0.81);
  const paper = rgb(0.99, 0.98, 0.96);
  const width = 595;
  const height = 842;
  const margin = 44;
  let page = pdf.addPage([width, height]);
  let y = height - 48;

  const drawHeader = () => {
    page.drawText(pdfText(data.business.name), { x: margin, y, size: 20, font: bold, color: accent });
    page.drawText("INVOICE", { x: width - margin - 88, y, size: 20, font: bold, color: dark });
    y -= 20;
    page.drawText(pdfText(data.invoiceNumber), { x: width - margin - 88, y, size: 9, font: regular, color: muted });
    y -= 26;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rule });
    y -= 24;
  };

  const newPage = () => {
    page = pdf.addPage([width, height]);
    y = height - 48;
    drawHeader();
  };

  drawHeader();

  page.drawText("BILL TO", { x: margin, y, size: 9, font: bold, color: accent });
  page.drawText("INVOICE DETAILS", { x: 350, y, size: 9, font: bold, color: accent });
  y -= 17;
  if (data.customer.company) {
    page.drawText(pdfText(data.customer.company), { x: margin, y, size: 12, font: bold, color: dark });
    y -= 16;
  }
  page.drawText(pdfText(data.customer.name), { x: margin, y, size: 12, font: bold, color: dark });
  page.drawText(`Issued: ${pdfText(data.issueDate)}`, { x: 350, y, size: 10, font: regular, color: dark });
  y -= 16;
  if (data.customer.email) page.drawText(pdfText(data.customer.email), { x: margin, y, size: 9, font: regular, color: muted });
  page.drawText(`Due: ${pdfText(data.dueLabel)}`, { x: 350, y, size: 10, font: regular, color: dark });
  y -= 16;
  if (data.customer.phone) page.drawText(pdfText(data.customer.phone), { x: margin, y, size: 9, font: regular, color: muted });
  page.drawText(`Status: ${pdfText(data.status)}`, { x: 350, y, size: 10, font: bold, color: accent });
  if (data.customer.address) {
    y -= 16;
    page.drawText(pdfText(data.customer.address).slice(0, 88), { x: margin, y, size: 9, font: regular, color: muted });
  }
  if (data.customer.taxId) {
    y -= 16;
    page.drawText(`Tax ID: ${pdfText(data.customer.taxId)}`, { x: margin, y, size: 9, font: regular, color: muted });
  }
  y -= 30;

  page.drawRectangle({ x: margin, y: y - 48, width: width - margin * 2, height: 58, color: paper, borderColor: rule, borderWidth: 1 });
  page.drawText("EVENT", { x: margin + 12, y: y - 7, size: 8, font: bold, color: accent });
  page.drawText(pdfText(data.event.date || "Date not set"), { x: margin + 12, y: y - 24, size: 10, font: bold, color: dark });
  if (data.event.address) page.drawText(pdfText(data.event.address).slice(0, 88), { x: margin + 12, y: y - 40, size: 9, font: regular, color: muted });
  y -= 72;

  page.drawRectangle({ x: margin, y: y - 22, width: width - margin * 2, height: 24, color: accent });
  page.drawText("DESCRIPTION", { x: margin + 10, y: y - 14, size: 8, font: bold, color: rgb(1, 1, 1) });
  page.drawText("QTY", { x: 374, y: y - 14, size: 8, font: bold, color: rgb(1, 1, 1) });
  page.drawText("RATE", { x: 422, y: y - 14, size: 8, font: bold, color: rgb(1, 1, 1) });
  page.drawText("AMOUNT", { x: 492, y: y - 14, size: 8, font: bold, color: rgb(1, 1, 1) });
  y -= 34;

  for (const line of data.lines) {
    if (y < 190) newPage();
    page.drawText(pdfText(line.description).slice(0, 52), { x: margin + 10, y, size: 9, font: regular, color: dark });
    page.drawText(String(line.quantity), { x: 378, y, size: 9, font: regular, color: dark });
    page.drawText(money(line.unitPrice), { x: 410, y, size: 9, font: regular, color: dark });
    const amount = money(line.total);
    page.drawText(amount, { x: width - margin - regular.widthOfTextAtSize(amount, 9), y, size: 9, font: regular, color: dark });
    y -= 22;
    page.drawLine({ start: { x: margin, y: y + 8 }, end: { x: width - margin, y: y + 8 }, thickness: 0.5, color: rule });
  }

  if (y < 240) newPage();
  y -= 12;
  const summaryX = 345;
  const summaryRow = (label: string, amount: number, strong = false) => {
    page.drawText(label, { x: summaryX, y, size: strong ? 11 : 9, font: strong ? bold : regular, color: strong ? dark : muted });
    const text = money(amount);
    page.drawText(text, { x: width - margin - (strong ? bold : regular).widthOfTextAtSize(text, strong ? 11 : 9), y, size: strong ? 11 : 9, font: strong ? bold : regular, color: strong ? accent : dark });
    y -= strong ? 22 : 17;
  };
  summaryRow("Subtotal", data.summary.subtotal);
  if (data.summary.discount > 0) summaryRow("Discount", -data.summary.discount);
  summaryRow("Delivery", data.summary.delivery);
  summaryRow("Tax", data.summary.tax);
  summaryRow("Total", data.summary.total, true);
  if (data.summary.paid > 0) summaryRow("Paid", -data.summary.paid);
  summaryRow("Balance due", data.summary.balance, true);

  y -= 16;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rule });
  y -= 18;
  page.drawText(pdfText(data.business.footer).slice(0, 95), { x: margin, y, size: 9, font: regular, color: muted });

  return Buffer.from(await pdf.save());
}

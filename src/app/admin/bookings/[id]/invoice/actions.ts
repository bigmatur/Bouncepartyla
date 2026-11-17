"use server";

import { redirect } from "next/navigation";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { sendSmtpEmail } from "@/lib/email/smtp";
import {
  applyBookingInvoiceRecipientOverrides,
  loadBookingInvoiceData,
} from "@/lib/invoices/booking-invoice";
import { buildBookingInvoicePdf } from "@/lib/invoices/booking-invoice-pdf";

function value(formData: FormData, key: string, maxLength = 300) {
  return String(formData.get(key) || "").trim().slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function invoiceUrl(bookingId: string, fields: Record<string, string>, result: string) {
  const query = new URLSearchParams();
  for (const [key, fieldValue] of Object.entries(fields)) {
    if (fieldValue) query.set(key, fieldValue);
  }
  query.set(result, "1");
  return `/admin/bookings/${encodeURIComponent(bookingId)}/invoice?${query.toString()}`;
}

export async function sendBookingInvoiceEmailAction(formData: FormData) {
  const bookingId = value(formData, "bookingId", 100);
  const fields = {
    name: value(formData, "name", 160),
    company: value(formData, "company", 200),
    email: value(formData, "email", 254),
    phone: value(formData, "phone", 80),
    address: value(formData, "address", 300),
    taxId: value(formData, "taxId", 100),
  };

  if (!bookingId) throw new Error("Missing booking id.");
  const { supabase } = await requireAdminPermission("payments.view");
  const loadedInvoice = await loadBookingInvoiceData(supabase, bookingId);
  if (!loadedInvoice) throw new Error("Booking not found.");

  const invoice = applyBookingInvoiceRecipientOverrides(loadedInvoice, fields);
  if (!/^\S+@\S+\.\S+$/.test(invoice.customer.email)) {
    redirect(invoiceUrl(bookingId, fields, "invalidEmail"));
  }

  try {
    const pdf = await buildBookingInvoicePdf(invoice);
    const safeInvoiceNumber = invoice.invoiceNumber.replace(/[^a-z0-9_-]+/gi, "-");
    const recipientName = invoice.customer.company || invoice.customer.name;
    const result = await sendSmtpEmail({
      to: invoice.customer.email,
      subject: `${invoice.invoiceNumber} from ${invoice.business.name}`,
      text: `Hello ${recipientName},\n\nPlease find your invoice ${invoice.invoiceNumber} attached. Balance due: $${invoice.summary.balance.toFixed(2)}.\n\n${invoice.business.name}`,
      html: `<p>Hello ${escapeHtml(recipientName)},</p><p>Please find invoice <strong>${escapeHtml(invoice.invoiceNumber)}</strong> attached.</p><p>Balance due: <strong>$${invoice.summary.balance.toFixed(2)}</strong></p><p>${escapeHtml(invoice.business.name)}</p>`,
      attachments: [{
        filename: `${safeInvoiceNumber}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      }],
    });

    if (!result.sent) {
      redirect(invoiceUrl(bookingId, fields, "smtpMissing"));
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(invoiceUrl(bookingId, fields, "sendFailed"));
  }

  redirect(invoiceUrl(bookingId, fields, "sent"));
}

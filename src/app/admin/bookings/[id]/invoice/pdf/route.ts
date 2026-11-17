import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  applyBookingInvoiceRecipientOverrides,
  loadBookingInvoiceData,
} from "@/lib/invoices/booking-invoice";
import { buildBookingInvoicePdf } from "@/lib/invoices/booking-invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const { supabase } = await requireAdminPermission("payments.view");
  const loadedInvoice = await loadBookingInvoiceData(supabase, id);

  if (!loadedInvoice) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const query = new URL(request.url).searchParams;
  const invoice = applyBookingInvoiceRecipientOverrides(loadedInvoice, {
    name: query.get("name") || undefined,
    company: query.get("company") || undefined,
    email: query.get("email") || undefined,
    phone: query.get("phone") || undefined,
    address: query.get("address") || undefined,
    taxId: query.get("taxId") || undefined,
  });

  const pdf = await buildBookingInvoicePdf(invoice);
  const filename = `${invoice.invoiceNumber.replace(/[^a-z0-9_-]+/gi, "-")}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

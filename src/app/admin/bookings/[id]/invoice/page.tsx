import { notFound } from "next/navigation";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  applyBookingInvoiceRecipientOverrides,
  loadBookingInvoiceData,
} from "@/lib/invoices/booking-invoice";
import InvoiceActions from "./InvoiceActions";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function date(value: string) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

export default async function BookingInvoicePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const { supabase } = await requireAdminPermission("payments.view");
  const loadedInvoice = await loadBookingInvoiceData(supabase, id);
  if (!loadedInvoice) notFound();

  const queryValue = (key: string) => {
    const raw = searchParams[key];
    return Array.isArray(raw) ? String(raw[0] || "") : String(raw || "");
  };
  const recipient = {
    name: queryValue("name") || loadedInvoice.customer.name,
    company: queryValue("company"),
    email: queryValue("email") || loadedInvoice.customer.email,
    phone: queryValue("phone") || loadedInvoice.customer.phone,
    address: queryValue("address"),
    taxId: queryValue("taxId"),
  };
  const invoice = applyBookingInvoiceRecipientOverrides(loadedInvoice, recipient);
  const pdfQuery = new URLSearchParams(
    Object.entries(recipient).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  const pdfHref = `/admin/bookings/${invoice.bookingId}/invoice/pdf${pdfQuery ? `?${pdfQuery}` : ""}`;

  const contact = [invoice.business.address, invoice.business.phone, invoice.business.email, invoice.business.website]
    .filter(Boolean);

  return (
    <main className="min-h-screen bg-[#f5efe6] px-3 py-5 text-[#1f1e1b] sm:px-6 sm:py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-[980px]">
        <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#9a723e]">Booking invoice</div>
            <div className="mt-1 text-sm text-[#756b62]">Preview before sending it to the customer.</div>
          </div>
          <InvoiceActions
            bookingId={invoice.bookingId}
            pdfHref={pdfHref}
            recipient={recipient}
          />
        </div>

        <form method="get" className="mb-4 rounded-[24px] border border-black/5 bg-white p-4 shadow-[0_8px_28px_rgba(35,49,63,0.05)] print:hidden sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#9a723e]">Invoice recipient</div>
              <p className="mt-1 text-sm text-[#756b62]">For an organization, add its name, billing address and Tax ID. This does not change the booking.</p>
            </div>
            <button type="submit" className="rounded-full bg-[#d39a45] px-5 py-2.5 text-sm font-bold text-white">Update invoice</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["company", "Organization name", recipient.company],
              ["name", "Contact / customer name", recipient.name],
              ["email", "Invoice email", recipient.email],
              ["phone", "Phone", recipient.phone],
              ["address", "Billing address", recipient.address],
              ["taxId", "Tax ID / PO number", recipient.taxId],
            ].map(([name, label, defaultValue]) => (
              <label key={name} className="text-xs font-semibold text-[#625a53]">
                {label}
                <input
                  name={name}
                  defaultValue={defaultValue}
                  className="mt-1.5 w-full rounded-xl border border-[#ddd2c6] bg-[#fbf8f3] px-3 py-2.5 text-sm font-normal text-[#23313f] outline-none focus:border-[#d39a45]"
                />
              </label>
            ))}
          </div>
        </form>

        {queryValue("sent") ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 print:hidden">Invoice PDF was sent to {invoice.customer.email}.</div> : null}
        {queryValue("invalidEmail") ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 print:hidden">Enter a valid invoice email address.</div> : null}
        {queryValue("smtpMissing") ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 print:hidden">Email is not configured for this environment.</div> : null}
        {queryValue("sendFailed") ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 print:hidden">The invoice could not be sent. Please try again.</div> : null}

        <article className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_18px_60px_rgba(35,49,63,0.08)] print:rounded-none print:border-0 print:shadow-none">
          <header className="flex flex-col gap-5 bg-[#23313f] px-5 py-7 text-white sm:flex-row sm:items-start sm:justify-between sm:px-9 sm:py-9">
            <div>
              <div className="text-2xl font-bold tracking-tight sm:text-3xl">{invoice.business.name}</div>
              <div className="mt-2 max-w-md space-y-0.5 text-xs leading-5 text-white/65 sm:text-sm">
                {contact.map((line) => <div key={line}>{line}</div>)}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-3xl font-bold tracking-tight sm:text-4xl">INVOICE</div>
              <div className="mt-2 text-sm font-semibold text-[#efc681]">{invoice.invoiceNumber}</div>
              <div className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-[0.08em]">{invoice.status}</div>
            </div>
          </header>

          <div className="p-5 sm:p-9">
            <section className="grid gap-5 border-b border-[#e8dfd4] pb-7 sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a723e]">Bill to</div>
                {invoice.customer.company ? <div className="mt-2 text-lg font-bold">{invoice.customer.company}</div> : null}
                <div className={invoice.customer.company ? "mt-1 font-semibold" : "mt-2 text-lg font-bold"}>{invoice.customer.name}</div>
                {invoice.customer.email ? <div className="mt-1 text-sm text-[#6f665e]">{invoice.customer.email}</div> : null}
                {invoice.customer.phone ? <div className="text-sm text-[#6f665e]">{invoice.customer.phone}</div> : null}
                {invoice.customer.address ? <div className="mt-1 text-sm text-[#6f665e]">{invoice.customer.address}</div> : null}
                {invoice.customer.taxId ? <div className="text-sm text-[#6f665e]">Tax ID / PO: {invoice.customer.taxId}</div> : null}
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-2 text-sm sm:justify-self-end sm:min-w-[300px]">
                <dt className="text-[#7b7168]">Issue date</dt><dd className="font-semibold">{date(invoice.issueDate)}</dd>
                <dt className="text-[#7b7168]">Payment due</dt><dd className="font-semibold">{invoice.dueLabel}</dd>
                <dt className="text-[#7b7168]">Booking</dt><dd className="font-semibold">{invoice.bookingNumber}</dd>
              </dl>
            </section>

            <section className="mt-6 rounded-2xl border border-[#e7ddd1] bg-[#fbf8f3] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a723e]">Event details</div>
              <div className="mt-2 font-bold">{date(invoice.event.date)}</div>
              {invoice.event.startTime || invoice.event.endTime ? <div className="mt-1 text-sm text-[#6f665e]">{invoice.event.startTime || "—"} – {invoice.event.endTime || "—"}</div> : null}
              {invoice.event.address ? <div className="mt-1 text-sm text-[#6f665e]">{invoice.event.address}</div> : null}
            </section>

            <section className="mt-7 overflow-hidden rounded-2xl border border-[#e7ddd1]">
              <div className="hidden grid-cols-[minmax(0,1fr)_70px_120px_120px] bg-[#23313f] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white sm:grid">
                <div>Description</div><div className="text-right">Qty</div><div className="text-right">Rate</div><div className="text-right">Amount</div>
              </div>
              <div className="divide-y divide-[#eee5da]">
                {invoice.lines.map((line) => (
                  <div key={line.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_70px_120px_120px] sm:items-center sm:px-5">
                    <div className="font-semibold">{line.description}</div>
                    <div className="flex justify-between text-sm sm:block sm:text-right"><span className="text-[#8b8178] sm:hidden">Qty</span>{line.quantity}</div>
                    <div className="flex justify-between text-sm sm:block sm:text-right"><span className="text-[#8b8178] sm:hidden">Rate</span>{money(line.unitPrice)}</div>
                    <div className="flex justify-between text-sm font-bold sm:block sm:text-right"><span className="font-normal text-[#8b8178] sm:hidden">Amount</span>{money(line.total)}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-7 ml-auto max-w-[390px] space-y-2 text-sm">
              <div className="flex justify-between gap-6"><span className="text-[#756b62]">Subtotal</span><strong>{money(invoice.summary.subtotal)}</strong></div>
              {invoice.summary.discount > 0 ? <div className="flex justify-between gap-6"><span className="text-[#756b62]">Discount</span><strong>−{money(invoice.summary.discount)}</strong></div> : null}
              <div className="flex justify-between gap-6"><span className="text-[#756b62]">Delivery</span><strong>{money(invoice.summary.delivery)}</strong></div>
              <div className="flex justify-between gap-6"><span className="text-[#756b62]">Tax</span><strong>{money(invoice.summary.tax)}</strong></div>
              <div className="mt-3 flex justify-between gap-6 border-t border-[#ddd2c6] pt-3 text-base"><span className="font-bold">Total</span><strong>{money(invoice.summary.total)}</strong></div>
              {invoice.summary.paid > 0 ? <div className="flex justify-between gap-6 text-emerald-700"><span>Paid</span><strong>−{money(invoice.summary.paid)}</strong></div> : null}
              <div className="mt-3 flex justify-between gap-6 rounded-2xl bg-[#23313f] px-4 py-4 text-lg text-white"><span className="font-bold">Balance due</span><strong>{money(invoice.summary.balance)}</strong></div>
            </section>

            <footer className="mt-9 border-t border-[#e8dfd4] pt-5 text-center text-xs leading-5 text-[#7a7067]">{invoice.business.footer}</footer>
          </div>
        </article>
      </div>
    </main>
  );
}

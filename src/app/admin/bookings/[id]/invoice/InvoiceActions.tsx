"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";

import { sendBookingInvoiceEmailAction } from "./actions";

function EmailInvoiceButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="rounded-full bg-[#d39a45] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled || pending}
    >
      {pending ? "Sending…" : "Email PDF"}
    </button>
  );
}

export default function InvoiceActions(props: {
  bookingId: string;
  pdfHref: string;
  recipient: {
    name: string;
    company: string;
    email: string;
    phone: string;
    address: string;
    taxId: string;
  };
}) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Link
        href={`/admin/bookings/${props.bookingId}`}
        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2.5 text-sm font-semibold text-[#23313f]"
      >
        Back to booking
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2.5 text-sm font-semibold text-[#23313f]"
      >
        Print
      </button>
      <a
        href={props.pdfHref}
        className="rounded-full bg-[#23313f] px-4 py-2.5 text-sm font-semibold text-white"
      >
        Download PDF
      </a>
      <form action={sendBookingInvoiceEmailAction}>
        <input type="hidden" name="bookingId" value={props.bookingId} />
        {Object.entries(props.recipient).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <EmailInvoiceButton disabled={!props.recipient.email} />
      </form>
    </div>
  );
}

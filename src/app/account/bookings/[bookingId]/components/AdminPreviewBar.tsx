import Link from "next/link";

export default function AdminPreviewBar({ bookingId }: { bookingId: string }) {
  return (
    <div className="print:hidden border-b border-amber-300 bg-amber-50 px-5 py-3 text-amber-950">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em]">Admin preview</div>
          <div className="mt-0.5 text-sm">You are viewing the customer-facing version of this booking.</div>
        </div>
        <Link href={`/admin/bookings/${bookingId}`} className="rounded-full bg-amber-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black">
          Back to admin booking
        </Link>
      </div>
    </div>
  );
}

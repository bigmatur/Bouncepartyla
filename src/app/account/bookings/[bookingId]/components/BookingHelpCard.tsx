import Link from "next/link";

type BookingHelpCardProps = {
  bookingNumber: string | null;
};

export default function BookingHelpCard({
  bookingNumber,
}: BookingHelpCardProps) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-black/10 bg-[#111111] p-6 text-white">
      <div className="flex items-start gap-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg"
          aria-hidden="true"
        >
          ?
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
            We are here to help
          </p>

          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
            Questions about your booking?
          </h2>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-white/65">
        Contact Bounce Party LA and include your booking number so our team can find your reservation quickly.
      </p>

      {bookingNumber ? (
        <div className="mt-4 rounded-[16px] border border-white/10 bg-white/[0.06] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Booking number
          </p>

          <p className="mt-1 break-all text-sm font-semibold text-white/90">
            {bookingNumber}
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        <a
          href="https://www.instagram.com/bouncepartyla/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          Message us on Instagram
        </a>

        <Link
          href="/account"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white transition hover:bg-white/[0.06]"
        >
          View all bookings
        </Link>
      </div>
    </section>
  );
}

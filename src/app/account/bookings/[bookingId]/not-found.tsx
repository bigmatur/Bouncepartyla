import Link from "next/link";

export default function BookingNotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-5 py-12">
      <section className="w-full rounded-[30px] border border-black/10 bg-white p-7 text-center shadow-sm sm:p-10">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/[0.05] text-xl"
          aria-hidden="true"
        >
          ?
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Booking not found
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          This booking is unavailable
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-black/55">
          The booking may belong to another account, may have been removed, or the link may be incorrect.
        </p>

        <Link
          href="/account"
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-black px-6 text-sm font-semibold text-white transition hover:bg-black/85"
        >
          View my bookings
        </Link>
      </section>
    </main>
  );
}

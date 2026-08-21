"use client";

import Link from "next/link";
import { useEffect } from "react";

type BookingDetailsErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function BookingDetailsError({
  error,
  reset,
}: BookingDetailsErrorProps) {
  useEffect(() => {
    console.error(
      "Customer booking page error:",
      error,
    );
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-5 py-12">
      <section className="w-full rounded-[30px] border border-black/10 bg-white p-7 text-center shadow-sm sm:p-10">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-xl text-red-700"
          aria-hidden="true"
        >
          !
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Something went wrong
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          We couldn’t load this booking
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-black/55">
          Please try loading the page again. If the problem continues, contact Bounce Party LA and include your booking number.
        </p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-black px-6 text-sm font-semibold text-white transition hover:bg-black/85"
          >
            Try again
          </button>

          <Link
            href="/account"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-black/10 px-6 text-sm font-semibold text-black transition hover:bg-black/[0.04]"
          >
            Back to my bookings
          </Link>
        </div>
      </section>
    </main>
  );
}

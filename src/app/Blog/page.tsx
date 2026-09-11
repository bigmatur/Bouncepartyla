import type { Metadata } from "next";
import Link from "next/link";

import PublicBookingShell from "@/components/public/PublicBookingShell";

export const metadata: Metadata = {
  title: "Bounce House Rental in Los Angeles",
  description:
    "Bounce house rentals in Los Angeles for birthdays, parties and special events. Explore modern bounce houses, slide combos, soft play and Bubble House rentals from Bounce Party LA.",
  alternates: {
    canonical: "/Blog",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const rentalLinks = [
  {
    title: "Bounce Houses",
    description:
      "Modern bounce houses for birthdays, celebrations and special events.",
    href: "/catalog/bounce-house",
  },
  {
    title: "Bounce & Slide Combos",
    description:
      "Bounce, climb and slide with larger combo rentals for an action-packed party.",
    href: "/catalog/bounce-slide-combo",
  },
  {
    title: "Bubble House",
    description:
      "A modern transparent party experience that creates a memorable centerpiece.",
    href: "/catalog/bubble-house",
  },
  {
    title: "Soft Play",
    description:
      "Clean, modern play spaces designed for toddlers and younger guests.",
    href: "/catalog/soft-play",
  },
];

export default function BlogPage() {
  return (
    <PublicBookingShell marketingMode>
      <main>
        <section className="border-b border-black/[0.06]">
          <div className="mx-auto max-w-[1380px] px-5 py-16 sm:px-7 sm:py-24 lg:py-32">
            <div className="max-w-4xl">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">
                Los Angeles Party Rentals
              </div>

              <h1 className="mt-5 text-[46px] font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-[82px]">
                Bounce house rentals in Los Angeles.
              </h1>

              <p className="mt-7 max-w-2xl text-base leading-7 text-black/58 sm:text-lg sm:leading-8">
                Make your next celebration unforgettable with modern bounce
                houses, slide combos, soft play and Bubble House rentals
                delivered across Los Angeles and surrounding areas.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/catalog"
                  className="inline-flex min-h-14 items-center justify-center rounded-full bg-[#1c1b18] px-7 text-sm font-bold text-white transition hover:bg-black"
                >
                  Browse rentals
                </Link>

                <Link
                  href="/book"
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-black/15 bg-white/60 px-7 text-sm font-bold transition hover:bg-white"
                >
                  Check availability
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1380px] px-5 py-14 sm:px-7 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">
              Find your rental
            </div>

            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              Something for every celebration.
            </h2>

            <p className="mt-5 text-base leading-7 text-black/55">
              From classic birthday parties to larger celebrations, our rental
              collection includes options for different ages, spaces and event
              styles.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {rentalLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-[26px] border border-black/[0.07] bg-white/55 p-6 transition hover:bg-white sm:p-8"
              >
                <h3 className="text-2xl font-semibold tracking-[-0.035em]">
                  {item.title}
                </h3>
                <p className="mt-3 max-w-lg text-sm leading-6 text-black/50">
                  {item.description}
                </p>
                <div className="mt-7 text-sm font-bold">
                  Explore collection →
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="border-t border-black/[0.06] bg-[#eee7dc]">
          <div className="mx-auto grid max-w-[1380px] gap-10 px-5 py-14 sm:px-7 sm:py-20 lg:grid-cols-2 lg:items-center lg:py-24">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">
                Bounce Party LA
              </div>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Party rentals made simple.
              </h2>
            </div>

            <div>
              <p className="text-base leading-7 text-black/55">
                Choose your date, explore available rentals and book online.
                Our team delivers and sets everything up so your rental is
                ready for the celebration.
              </p>

              <Link
                href="/book"
                className="mt-7 inline-flex min-h-14 items-center justify-center rounded-full bg-[#1c1b18] px-7 text-sm font-bold text-white transition hover:bg-black"
              >
                Start your booking
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicBookingShell>
  );
}
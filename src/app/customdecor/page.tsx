import type { Metadata } from "next";
import Link from "next/link";

import PublicBookingShell from "@/components/public/PublicBookingShell";

export const metadata: Metadata = {
  title: "Custom Party Decor Los Angeles | Bounce Party LA",
  description:
    "Custom party decor, photo zone elements and event styling from Bounce Party LA in Los Angeles.",
  alternates: {
    canonical: "/customdecor",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function CustomDecorPage() {
  return (
    <PublicBookingShell marketingMode>
      <main>
        <section className="border-b border-black/[0.06]">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:px-7 sm:py-24">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">
              Bounce Party LA
            </div>

            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
              Custom party decor in Los Angeles.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-black/60 sm:text-lg">
              Complete your event with modern decorative elements, photo-zone
              accents and custom styling that can be coordinated with your
              Bounce Party LA rental setup.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/catalog"
                className="rounded-full bg-[#1c1b18] px-6 py-3 text-sm font-semibold text-white transition hover:bg-black"
              >
                Browse rentals
              </Link>

              <Link
                href="/book"
                className="rounded-full border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-[#1c1b18] transition hover:bg-black/[0.03]"
              >
                Start a booking
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-12 sm:px-7 sm:py-16">
          <div className="grid gap-8 md:grid-cols-3">
            <DecorCard
              title="Photo-zone elements"
              text="Decorative pieces can help create a polished focal point for birthdays, showers and special events."
            />

            <DecorCard
              title="Modern event styling"
              text="Choose decor that complements your bounce house, soft play, Bubble House or other rental setup."
            />

            <DecorCard
              title="Custom availability"
              text="Decor options vary by event date and inventory. Contact us to discuss what is currently available."
            />
          </div>

          <div className="mt-14 rounded-[28px] bg-[#eee9e1] p-7 sm:p-10">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              Planning a complete party setup?
            </h2>

            <p className="mt-4 max-w-2xl leading-7 text-black/60">
              Browse our current rental collection and send us your event date,
              location and design ideas. We can help you coordinate available
              rentals and decor for your celebration.
            </p>

            <Link
              href="/catalog"
              className="mt-7 inline-flex rounded-full bg-[#1c1b18] px-6 py-3 text-sm font-semibold text-white transition hover:bg-black"
            >
              Explore the catalog
            </Link>
          </div>
        </section>
      </main>
    </PublicBookingShell>
  );
}

function DecorCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-[24px] border border-black/[0.06] bg-white p-6">
      <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#1c1b18]">
        {title}
      </h2>
      <p className="mt-3 leading-7 text-black/55">{text}</p>
    </article>
  );
}
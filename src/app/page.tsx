import type { Metadata } from "next";
import Link from "next/link";

import PublicBookingShell from "@/components/public/PublicBookingShell";
import PublicProductCard from "@/components/public/PublicProductCard";
import {
  getPublicCatalogCategories,
  getPublicCatalogProducts,
} from "@/lib/customer/public-catalog";

export const metadata: Metadata = {
  title: "Modern Bounce House Rentals in Los Angeles | Bounce Party LA",
  description:
    "Modern bounce houses, soft play, bubble houses and party rentals delivered across Los Angeles. Browse rentals and book your event online.",
};

const HERO_IMAGE =
  "https://m-files.cdn1.cc/lpfile/9/5/0/95010f36fa2634266299c92c903d659b/-/crop/101x0x970x659/-/resize/1920/f.jpg?55842803=";

const trustItems = [
  ["Fully insured", "Coverage available for parks and venues"],
  ["Clean every time", "Deep cleaned and sanitized for every event"],
  ["Delivery + setup", "Our team handles the heavy lifting"],
  ["Modern inventory", "Fresh designs made for beautiful parties"],
];

const steps = [
  ["01", "Pick your date", "Start with your event date so you can shop with confidence."],
  ["02", "Choose your rentals", "Browse bounce houses, soft play, bubble houses and packages."],
  ["03", "We deliver the fun", "We arrive, set everything up safely and return for pickup."],
];

export default async function HomePage() {
  const [categories, products] = await Promise.all([
    getPublicCatalogCategories(),
    getPublicCatalogProducts(),
  ]);

  const featured = products.slice(0, 6);
  const categoryPreview = categories.slice(0, 6);

  return (
    <PublicBookingShell marketingMode>
      <main className="overflow-hidden">
        <section className="px-3 pt-3 sm:px-5 sm:pt-5 lg:px-7">
          <div className="relative mx-auto min-h-[660px] max-w-[1500px] overflow-hidden rounded-[28px] bg-[#151513] sm:min-h-[720px] sm:rounded-[38px] lg:min-h-[760px]">
            <img
              src={HERO_IMAGE}
              alt="Bounce Party LA modern white party rentals"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,17,14,0.80)_0%,rgba(18,17,14,0.48)_46%,rgba(18,17,14,0.08)_78%),linear-gradient(0deg,rgba(18,17,14,0.32),transparent_55%)]" />

            <div className="relative z-10 flex min-h-[660px] items-end px-6 pb-9 pt-28 sm:min-h-[720px] sm:px-10 sm:pb-12 lg:min-h-[760px] lg:px-16 lg:pb-16">
              <div className="max-w-3xl text-white">
                <div className="mb-5 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] backdrop-blur-md">
                  Los Angeles party rentals
                </div>
                <h1 className="max-w-[920px] text-[46px] font-semibold leading-[0.96] tracking-[-0.055em] sm:text-[68px] lg:text-[84px]">
                  Beautiful parties start here.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-white/82 sm:text-lg sm:leading-8">
                  Modern bounce houses, soft play and bubble houses designed to look as good as the memories feel.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/catalog"
                    className="inline-flex min-h-14 items-center justify-center rounded-full bg-white px-7 text-sm font-bold text-[#191816] transition hover:bg-[#f3eee6]"
                  >
                    Browse rentals
                  </Link>
                  <Link
                    href="/book"
                    className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/30 bg-black/20 px-7 text-sm font-bold text-white backdrop-blur-md transition hover:bg-black/30"
                  >
                    Check availability <span className="ml-2">↗</span>
                  </Link>
                </div>

                <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/76">
                  <span>Full-day rentals</span>
                  <span>•</span>
                  <span>Professional setup</span>
                  <span>•</span>
                  <span>LA + surrounding areas</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="rentals" className="mx-auto max-w-7xl px-5 py-20 sm:px-7 sm:py-28">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">Find your favorite</div>
              <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.045em] text-[#1c1b18] sm:text-6xl">
                Rentals for every kind of celebration.
              </h2>
            </div>
            <Link href="/catalog" className="text-sm font-bold text-[#1c1b18] underline decoration-black/20 underline-offset-8">
              View full catalog
            </Link>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categoryPreview.map((category, index) => (
              <Link
                key={category.id}
                href={`/catalog/${encodeURIComponent(category.slug)}`}
                className="group flex min-h-[220px] flex-col justify-between rounded-[28px] border border-black/[0.07] bg-white p-6 shadow-[0_12px_40px_rgba(30,24,17,0.035)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_50px_rgba(30,24,17,0.08)] sm:min-h-[250px] sm:p-7"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold tracking-[0.16em] text-black/35">0{index + 1}</span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 transition group-hover:bg-[#1c1b18] group-hover:text-white">↗</span>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{category.name}</h3>
                  <p className="mt-3 line-clamp-2 max-w-sm text-sm leading-6 text-black/50">
                    {category.description || "Modern party rentals ready for delivery and professional setup."}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="bg-[#eee7dc] py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-7">
            <div className="max-w-3xl">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#8f6947]">Most loved</div>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Party favorites, ready to book.</h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-black/55">Start with the rentals our customers love, then choose your date to continue into booking.</p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {featured.map((product) => (
                <PublicProductCard key={product.id} product={product} />
              ))}
            </div>

            <div className="mt-9 text-center">
              <Link href="/catalog" className="inline-flex min-h-13 items-center justify-center rounded-full bg-[#1c1b18] px-7 text-sm font-bold text-white">
                See all rentals <span className="ml-2">→</span>
              </Link>
            </div>
          </div>
        </section>

        <section id="why-us" className="mx-auto max-w-7xl px-5 py-20 sm:px-7 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">Why Bounce Party LA</div>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Beautiful. Clean. Easy.</h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-black/55">
                We are a family-run Los Angeles company focused on modern inventory, dependable service and a stress-free event day.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-[30px] bg-black/10 sm:grid-cols-2">
              {trustItems.map(([title, copy]) => (
                <div key={title} className="bg-[#faf7f1] p-7 sm:p-8">
                  <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-full bg-[#ded0bd] text-lg">✓</div>
                  <h3 className="text-xl font-semibold tracking-[-0.025em]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-black/50">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-3 pb-3 sm:px-5 sm:pb-5 lg:px-7 lg:pb-7">
          <div className="mx-auto max-w-[1500px] rounded-[34px] bg-[#1b1a17] px-6 py-16 text-white sm:px-10 sm:py-20 lg:px-16 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#c9ad8d]">How it works</div>
                <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">Three steps to party day.</h2>
              </div>
              <div className="divide-y divide-white/12 border-y border-white/12">
                {steps.map(([number, title, copy]) => (
                  <div key={number} className="grid gap-4 py-7 sm:grid-cols-[70px_1fr] sm:py-8">
                    <div className="text-sm font-semibold text-white/35">{number}</div>
                    <div>
                      <h3 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h3>
                      <p className="mt-2 max-w-lg text-sm leading-6 text-white/55">{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 text-center sm:px-7 sm:py-28">
          <div className="mx-auto max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">Your date is the first step</div>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">Ready to make it unforgettable?</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-black/55">Tell us your date, explore what is available and reserve your favorites online.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/book" className="inline-flex min-h-14 items-center justify-center rounded-full bg-[#1c1b18] px-8 text-sm font-bold text-white">Check availability</Link>
              <Link href="/catalog" className="inline-flex min-h-14 items-center justify-center rounded-full border border-black/12 bg-white px-8 text-sm font-bold text-[#1c1b18]">Browse rentals</Link>
            </div>
          </div>
        </section>
      </main>
    </PublicBookingShell>
  );
}

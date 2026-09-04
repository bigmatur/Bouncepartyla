import type { Metadata } from "next";
import Link from "next/link";

import PublicBookingShell from "@/components/public/PublicBookingShell";
import PublicProductCard from "@/components/public/PublicProductCard";
import {
  getPublicCatalogCategories,
  getPublicCatalogProducts,
} from "@/lib/customer/public-catalog";

export const metadata: Metadata = {
  title: "Party Rentals | Bounce Party LA",
  description:
    "Browse modern bounce houses, soft play, bubble houses and party rentals from Bounce Party LA.",
};

type SearchParams = Promise<{ date?: string }>;

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function PublicCatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const selectedDate = validDate(String(params.date || ""))
    ? String(params.date)
    : "";

  const [categories, products] = await Promise.all([
    getPublicCatalogCategories(),
    getPublicCatalogProducts(),
  ]);

  return (
    <PublicBookingShell marketingMode>
      <main>
        <section className="border-b border-black/[0.06] bg-[#eee7dc]">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-7 sm:py-20">
            <div className="grid gap-8 lg:grid-cols-[1fr_390px] lg:items-end">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9a7654]">
                  Bounce Party LA rentals
                </div>
                <h1 className="mt-3 max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-7xl">
                  Find the one that fits your party.
                </h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-black/55">
                  Choose your event date, browse what you love and continue directly into booking.
                </p>
              </div>

              <form method="GET" action="/catalog" className="rounded-[26px] border border-black/[0.07] bg-white p-4 shadow-[0_12px_38px_rgba(30,24,17,0.04)] sm:p-5">
                <label>
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-black/40">
                    Party date
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      name="date"
                      defaultValue={selectedDate}
                      className="h-12 min-w-0 flex-1 rounded-2xl border border-black/10 bg-[#faf7f1] px-4 text-sm outline-none transition focus:border-black/30"
                    />
                    <button
                      type="submit"
                      className="h-12 rounded-2xl bg-[#1c1b18] px-5 text-sm font-bold text-white"
                    >
                      Apply
                    </button>
                  </div>
                </label>
              </form>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-7 sm:py-10">
          {categories.length > 0 && (
            <section className="-mx-5 overflow-x-auto px-5 pb-2 sm:-mx-7 sm:px-7">
              <div className="flex min-w-max gap-2">
                <Link
                  href={selectedDate ? `/catalog?date=${selectedDate}` : "/catalog"}
                  className="rounded-full bg-[#1c1b18] px-5 py-3 text-sm font-bold text-white"
                >
                  All rentals
                </Link>

                {categories.map((category) => {
                  const query = selectedDate
                    ? `?date=${encodeURIComponent(selectedDate)}`
                    : "";

                  return (
                    <Link
                      key={category.id}
                      href={`/catalog/${encodeURIComponent(category.slug)}${query}`}
                      className="rounded-full border border-black/[0.08] bg-white px-5 py-3 text-sm font-bold transition hover:bg-[#f0e9df]"
                    >
                      {category.name}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mt-7 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.035em]">All rentals</h2>
              <p className="mt-1 text-sm text-black/45">{products.length} options to explore</p>
            </div>
            {selectedDate && (
              <div className="hidden rounded-full bg-[#e7ddcf] px-4 py-2 text-xs font-bold text-[#6d5139] sm:block">
                Date: {selectedDate}
              </div>
            )}
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <PublicProductCard
                key={product.id}
                product={product}
                date={selectedDate || undefined}
              />
            ))}

            {products.length === 0 && (
              <div className="rounded-[28px] border border-dashed border-black/15 bg-white/60 px-6 py-20 text-center text-sm text-black/50 sm:col-span-2 xl:col-span-3">
                No published rentals found.
              </div>
            )}
          </section>
        </div>
      </main>
    </PublicBookingShell>
  );
}

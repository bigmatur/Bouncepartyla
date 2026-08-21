import type { Metadata } from "next";
import Link from "next/link";

import PublicBookingShell from "@/components/public/PublicBookingShell";
import PublicProductCard from "@/components/public/PublicProductCard";
import {
  getPublicCatalogCategories,
  getPublicCatalogProducts,
} from "@/lib/customer/public-catalog";

export const metadata: Metadata = {
  title: "Browse Rentals | Bounce Party LA",
  description: "Browse Bounce Party LA rentals and continue into the booking system.",
  robots: {
    index: false,
    follow: true,
  },
};

type SearchParams = Promise<{
  date?: string;
}>;

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
    <PublicBookingShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_18px_55px_rgba(0,0,0,0.045)] sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
            Bounce Party LA
          </div>

          <div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Browse rentals
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
                Choose a category or open a product to continue into booking.
              </p>
            </div>

            <form method="GET" action="/catalog" className="flex w-full max-w-sm items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="mb-1.5 block text-xs font-semibold text-black/55">
                  Party date
                </span>

                <input
                  type="date"
                  name="date"
                  defaultValue={selectedDate}
                  className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-black/30"
                />
              </label>

              <button
                type="submit"
                className="h-11 rounded-xl border border-black/10 bg-[#faf8f4] px-4 text-sm font-semibold"
              >
                Apply
              </button>
            </form>
          </div>
        </section>

        {categories.length > 0 && (
          <section className="mt-5 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2">
              <Link
                href={selectedDate ? `/catalog?date=${selectedDate}` : "/catalog"}
                className="rounded-full bg-[#1d1d1b] px-4 py-2.5 text-sm font-semibold text-white"
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
                    className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-[#3f3933] transition hover:bg-black/[0.03]"
                  >
                    {category.name}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <PublicProductCard
              key={product.id}
              product={product}
              date={selectedDate || undefined}
            />
          ))}

          {products.length === 0 && (
            <div className="rounded-[26px] border border-dashed border-black/15 bg-white/60 px-6 py-16 text-center text-sm text-black/50 sm:col-span-2 xl:col-span-3">
              No published rentals found.
            </div>
          )}
        </section>
      </main>
    </PublicBookingShell>
  );
}

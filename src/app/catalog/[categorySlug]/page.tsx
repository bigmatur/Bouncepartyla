import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PublicBookingShell from "@/components/public/PublicBookingShell";
import PublicProductCard from "@/components/public/PublicProductCard";
import {
  getPublicCatalogCategories,
  getPublicCatalogProducts,
  getPublicCategoryBySlug,
} from "@/lib/customer/public-catalog";
import { buildPublicMetadata } from "@/lib/public/seo";

type PageParams = Promise<{
  categorySlug: string;
}>;

type SearchParams = Promise<{
  date?: string;
}>;

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  const { categorySlug } = await params;
  const category = await getPublicCategoryBySlug(categorySlug);
  const canIndex = Boolean(category);

  return buildPublicMetadata({
    title: category
      ? `${category.name} | Bounce Party LA Booking`
      : "Rentals | Bounce Party LA",
    description:
      category?.description ||
      "Browse Bounce Party LA rentals and continue into booking.",
    path: category
      ? `/catalog/${encodeURIComponent(category.slug)}`
      : "/catalog",
    index: canIndex,
  });
}

export default async function PublicCategoryPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { categorySlug } = await params;
  const query = await searchParams;

  const selectedDate = validDate(String(query.date || ""))
    ? String(query.date)
    : "";

  const category = await getPublicCategoryBySlug(categorySlug);
  if (!category) notFound();

  const [categories, products] = await Promise.all([
    getPublicCatalogCategories(),
    getPublicCatalogProducts({
      categoryId: category.id,
    }),
  ]);

  return (
    <PublicBookingShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex items-center gap-2 text-sm text-black/50">
          <Link href="/catalog" className="font-semibold text-[#6f5936]">
            Rentals
          </Link>
          <span>/</span>
          <span>{category.name}</span>
        </div>

        <section className="mt-4 rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_18px_55px_rgba(0,0,0,0.045)] sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
            Category
          </div>

          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            {category.name}
          </h1>

          {category.description && (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-black/60">
              {category.description}
            </p>
          )}
        </section>

        <section className="mt-5 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            <Link
              href={selectedDate ? `/catalog?date=${selectedDate}` : "/catalog"}
              className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold"
            >
              All rentals
            </Link>

            {categories.map((item) => {
              const active = item.id === category.id;
              const dateQuery = selectedDate
                ? `?date=${encodeURIComponent(selectedDate)}`
                : "";

              return (
                <Link
                  key={item.id}
                  href={`/catalog/${encodeURIComponent(item.slug)}${dateQuery}`}
                  className={[
                    "rounded-full border px-4 py-2.5 text-sm font-semibold",
                    active
                      ? "border-[#1d1d1b] bg-[#1d1d1b] text-white"
                      : "border-black/10 bg-white text-[#3f3933]",
                  ].join(" ")}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>
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
            <div className="rounded-[26px] border border-dashed border-black/15 bg-white/60 px-6 py-16 text-center text-sm text-black/50 sm:col-span-2 xl:col-span-3">
              No published rentals found in this category.
            </div>
          )}
        </section>
      </main>
    </PublicBookingShell>
  );
}

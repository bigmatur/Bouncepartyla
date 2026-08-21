import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PublicBookingShell from "@/components/public/PublicBookingShell";
import PublicAvailabilityCard from "@/components/public/PublicAvailabilityCard";
import {
  getPublicCatalogCategories,
  getPublicProductBySlug,
} from "@/lib/customer/public-catalog";

type PageParams = Promise<{
  slug: string;
}>;

type SearchParams = Promise<{
  date?: string;
}>;

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function dimension(value: number | null | undefined) {
  if (!value || value <= 0) return null;
  return `${value} ft`;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function generateMetadata({
  params,
}: {
  params: PageParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);

  return {
    title: product
      ? `${product.public_title || product.name} | Bounce Party LA Booking`
      : "Rental | Bounce Party LA",
    description:
      product?.short_description ||
      product?.description ||
      "Bounce Party LA rental details.",
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function PublicProductPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const selectedDate = validDate(String(query.date || ""))
    ? String(query.date)
    : "";

  const product = await getPublicProductBySlug(slug);
  if (!product) notFound();

  const categories = await getPublicCatalogCategories();
  const category =
    categories.find((item) => item.id === product.category_id) || null;

  const title = product.public_title || product.name;
  const gallery = Array.isArray(product.gallery_urls)
    ? product.gallery_urls.filter(Boolean)
    : [];

  const details = [
    product.setup_width_ft || product.setup_length_ft
      ? {
          label: "Setup area",
          value: [
            dimension(product.setup_width_ft),
            dimension(product.setup_length_ft),
          ]
            .filter(Boolean)
            .join(" × "),
        }
      : null,
    product.setup_height_ft
      ? { label: "Height", value: dimension(product.setup_height_ft) }
      : null,
    product.max_capacity
      ? { label: "Capacity", value: `Up to ${product.max_capacity}` }
      : null,
    product.min_age || product.max_age
      ? {
          label: "Age",
          value:
            product.min_age && product.max_age
              ? `${product.min_age}–${product.max_age}`
              : product.min_age
                ? `${product.min_age}+`
                : `Up to ${product.max_age}`,
        }
      : null,
    product.power_requirements
      ? { label: "Power", value: product.power_requirements }
      : null,
    product.setup_surface
      ? { label: "Surface", value: product.setup_surface }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    value: string | null;
  }>;

  return (
    <PublicBookingShell>
      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pb-10 sm:pt-10">
        <div className="flex flex-wrap items-center gap-2 text-sm text-black/50">
          <Link href="/catalog" className="font-semibold text-[#6f5936]">
            Rentals
          </Link>

          {category && (
            <>
              <span>/</span>
              <Link
                href={`/catalog/${encodeURIComponent(category.slug)}`}
                className="font-semibold text-[#6f5936]"
              >
                {category.name}
              </Link>
            </>
          )}

          <span>/</span>
          <span className="truncate">{title}</span>
        </div>

        <section className="mt-4 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_18px_55px_rgba(0,0,0,0.045)]">
              <div className="aspect-[16/10] bg-[#f6f1e8]">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-semibold text-black/35">
                    Photo coming soon
                  </div>
                )}
              </div>

              {gallery.length > 0 && (
                <div className="grid grid-cols-3 gap-2 p-3 sm:gap-3 sm:p-4">
                  {gallery.slice(0, 6).map((url) => (
                    <div
                      key={url}
                      className="aspect-[4/3] overflow-hidden rounded-xl bg-[#f6f1e8]"
                    >
                      <img
                        src={url}
                        alt={`${title} gallery`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {product.description && (
              <section className="mt-5 rounded-[28px] border border-black/10 bg-white p-5 sm:p-7">
                <h2 className="text-lg font-semibold">About this rental</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-black/65">
                  {product.description}
                </p>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_18px_55px_rgba(0,0,0,0.045)] sm:p-7">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
                Rental
              </div>

              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                {title}
              </h1>

              <p className="mt-3 text-sm leading-6 text-black/60">
                {product.short_description ||
                  "Choose your date and continue to booking."}
              </p>

              <div className="mt-5 rounded-2xl bg-[#f7f3ed] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">
                  Starting at
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {money(product.base_price)}
                </div>
              </div>

              <PublicAvailabilityCard
                productId={product.id}
                initialDate={selectedDate}
                initialStartTime="10:00"
                initialEndTime="18:00"
              />
            </section>

            {details.length > 0 && (
              <section className="rounded-[28px] border border-black/10 bg-white p-5 sm:p-6">
                <h2 className="text-sm font-semibold">Details</h2>

                <div className="mt-3 divide-y divide-black/5">
                  {details.map((detail) => (
                    <div
                      key={detail.label}
                      className="flex items-center justify-between gap-4 py-3 text-sm"
                    >
                      <span className="text-black/50">{detail.label}</span>
                      <span className="text-right font-semibold">
                        {detail.value}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </section>
      </main>

    </PublicBookingShell>
  );
}

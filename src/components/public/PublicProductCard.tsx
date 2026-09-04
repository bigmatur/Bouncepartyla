import Link from "next/link";

import type { PublicCatalogProduct } from "@/lib/customer/public-catalog";

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export default function PublicProductCard({
  product,
  date,
}: {
  product: PublicCatalogProduct;
  date?: string;
}) {
  const productQuery = new URLSearchParams();
  if (date) productQuery.set("date", date);

  const bookQuery = new URLSearchParams({ productId: product.id });
  if (date) bookQuery.set("date", date);

  const externalSlug = product.public_slug || product.slug;
  const productHref = `/product/${encodeURIComponent(externalSlug)}${
    productQuery.toString() ? `?${productQuery.toString()}` : ""
  }`;

  return (
    <article className="group overflow-hidden rounded-[26px] border border-black/[0.07] bg-white shadow-[0_12px_36px_rgba(30,24,17,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(30,24,17,0.09)] sm:rounded-[30px]">
      <Link href={productHref} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-[#eee8df]">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.public_title || product.name}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-black/30">
              Photo coming soon
            </div>
          )}
          <div className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/92 text-sm shadow-sm backdrop-blur transition group-hover:bg-[#1c1b18] group-hover:text-white">
            ↗
          </div>
        </div>
      </Link>

      <div className="p-5 sm:p-6">
        <Link href={productHref} className="block">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-[-0.035em] sm:text-2xl">
              {product.public_title || product.name}
            </h2>
            <div className="shrink-0 text-right">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/30">From</div>
              <div className="mt-0.5 text-base font-bold">{money(product.base_price)}</div>
            </div>
          </div>

          <p className="mt-3 line-clamp-2 min-h-[48px] text-sm leading-6 text-black/50">
            {product.short_description ||
              product.description ||
              "Modern party rental with delivery and professional setup available."}
          </p>
        </Link>

        <div className="mt-5 flex items-center gap-2">
          <Link
            href={productHref}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-black/10 bg-[#faf7f1] px-4 text-sm font-bold transition hover:bg-[#f4eee5]"
          >
            Details
          </Link>
          <Link
            href={`/book?${bookQuery.toString()}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#1c1b18] px-4 text-sm font-bold text-white transition hover:bg-black"
          >
            Book now
          </Link>
        </div>
      </div>
    </article>
  );
}

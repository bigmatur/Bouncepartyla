import Link from "next/link";

import type {
  PublicCatalogProduct,
} from "@/lib/customer/public-catalog";

function money(
  value:
    | number
    | null
    | undefined,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    },
  ).format(
    Number(value || 0),
  );
}

export default function PublicProductCard({
  product,
  date,
}: {
  product:
    PublicCatalogProduct;
  date?: string;
}) {
  const productQuery =
    new URLSearchParams();

  if (date) {
    productQuery.set(
      "date",
      date,
    );
  }

  const bookQuery =
    new URLSearchParams({
      productId:
        product.id,
    });

  if (date) {
    bookQuery.set(
      "date",
      date,
    );
  }

  const externalSlug =
    product.public_slug ||
    product.slug;

  const productHref =
    `/product/${encodeURIComponent(
      externalSlug,
    )}${
      productQuery.toString()
        ? `?${productQuery.toString()}`
        : ""
    }`;

  return (
    <article className="overflow-hidden rounded-[26px] border border-black/10 bg-white shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
      <Link
        href={productHref}
        className="block"
      >
        <div className="aspect-[4/3] overflow-hidden bg-[#f6f1e8]">
          {product.image_url ? (
            <img
              src={
                product.image_url
              }
              alt={
                product.public_title ||
                product.name
              }
              className="h-full w-full object-cover transition duration-300 hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-black/35">
              Photo coming soon
            </div>
          )}
        </div>
      </Link>

      <div className="p-4 sm:p-5">
        <Link
          href={productHref}
          className="block"
        >
          <h2 className="text-lg font-semibold tracking-[-0.02em]">
            {product.public_title ||
              product.name}
          </h2>

          <p className="mt-2 min-h-[96px] line-clamp-4 text-sm leading-6 text-black/55">
            {product.short_description ||
              product.description ||
              "Party rental details are available on the product page."}
          </p>
        </Link>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
              From
            </div>

            <div className="text-base font-bold">
              {money(
                product.base_price,
              )}
            </div>
          </div>

          <Link
            href={`/book?${bookQuery.toString()}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1d1d1b] px-4 text-sm font-semibold text-white transition hover:bg-black"
          >
            Book
          </Link>
        </div>
      </div>
    </article>
  );
}

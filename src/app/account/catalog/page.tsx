import Link from "next/link";

import CustomerShell from "@/components/account/CustomerShell";
import { requireCustomerAccess } from "@/lib/auth/require-customer";

type SearchParamsValue = string | string[] | undefined;

function firstValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return String(value[0] || "");
  }

  return String(value || "");
}

function categoryLabel(category: any) {
  return category?.name || "Uncategorized";
}

function buildCatalogDetailsHref(params: {
  slugOrId: string;
  searchParams: Record<string, SearchParamsValue>;
}) {
  const query = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params.searchParams || {})) {
    if (key === "bookingError" || key === "bookingErrorCode" || key === "bookingFocus") {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        const normalized = String(value || "");
        if (!normalized) continue;
        query.append(`bn_${key}`, normalized);
      }
      continue;
    }

    const normalized = String(rawValue || "");
    if (!normalized) continue;
    query.set(`bn_${key}`, normalized);
  }

  return `/account/catalog/${encodeURIComponent(params.slugOrId)}${query.toString() ? `?${query.toString()}` : ""}`;
}

function buildBookNowHref(params: {
  productId?: string;
  searchParams: Record<string, SearchParamsValue>;
}) {
  const query = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params.searchParams || {})) {
    if (key === "bookingError" || key === "bookingErrorCode" || key === "bookingFocus") {
      continue;
    }

    if (key.startsWith("bn_")) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        const normalized = String(value || "");
        if (!normalized) continue;
        query.append(key, normalized);
      }
      continue;
    }

    const normalized = String(rawValue || "");
    if (!normalized) continue;
    query.set(key, normalized);
  }

  if (params.productId) {
    query.set("productId", params.productId);
  }

  return `/account/book-now${query.toString() ? `?${query.toString()}` : ""}`;
}

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

export default async function AccountCatalogPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamsValue>>;
}) {
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();
  const resolvedSearchParams = (searchParams ? await searchParams : {}) as Record<
    string,
    SearchParamsValue
  >;
  const selectedDate = firstValue(resolvedSearchParams.date || resolvedSearchParams.bn_date).trim();
  const selectedCategoryId = firstValue(
    resolvedSearchParams.category || resolvedSearchParams.bn_category
  ).trim() || "all";

  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, active, sort_order")
      .neq("active", false)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("products")
      .select("id, name, slug, description, short_description, image_url, base_price, active, category_id")
      .neq("active", false)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(200),
  ]);

  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  const categories = (categoriesResult.data || []).filter((category: any) => category.active !== false);

  let products = productsResult.data || [];

  if (products.length === 0 && canPreviewCustomer) {
    const fallbackProductsResult = await supabase
      .from("products")
      .select("id, name, slug, description, short_description, image_url, base_price, active, category_id")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(200);

    if (fallbackProductsResult.error) {
      throw new Error(fallbackProductsResult.error.message);
    }

    products = fallbackProductsResult.data || [];
  }

  const filteredProducts =
    selectedCategoryId === "all"
      ? products
      : products.filter((product: any) => String(product.category_id || "") === selectedCategoryId);

  const categoryTabs = [
    { id: "all", label: "All products" },
    ...categories.map((category: any) => ({ id: category.id, label: categoryLabel(category) })),
  ];

  return (
    <CustomerShell
      displayName={access.displayName}
      userEmail={access.user?.email || null}
      role={access.role}
      defaultInterface={access.defaultInterface}
      availableInterfaces={access.availableInterfaces}
      grantedPermissions={access.grantedPermissions}
      previewMode={canPreviewCustomer}
    >
      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-5 sm:py-10">
        <section className="rounded-[22px] border border-black/10 bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:rounded-[30px] sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40">Customer catalog</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:mt-3 sm:text-4xl">Choose your equipment</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-black/60">
            Browse rentals, check details and start a booking.
          </p>
        </section>

        <section className="mt-4 rounded-[20px] border border-black/10 bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:mt-6 sm:rounded-[30px] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.02em] sm:text-xl">Categories</h2>
              <p className="mt-1 hidden text-sm text-black/55 sm:block">Pick a category to avoid scrolling through the full catalog.</p>
            </div>
            <div className="text-sm text-black/50">
              {filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:mt-4 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {categoryTabs.map((category) => {
              const active = selectedCategoryId === category.id;
              const count =
                category.id === "all"
                  ? products.length
                  : products.filter((product: any) => String(product.category_id || "") === category.id).length;

              const nextSearchParams = new URLSearchParams();

              for (const [key, rawValue] of Object.entries(resolvedSearchParams || {})) {
                if (key === "bookingError" || key === "bookingErrorCode" || key === "bookingFocus" || key === "bn_category") {
                  continue;
                }

                if (Array.isArray(rawValue)) {
                  for (const value of rawValue) {
                    const normalized = String(value || "");
                    if (!normalized) continue;
                    nextSearchParams.append(key, normalized);
                  }

                  continue;
                }

                const normalized = String(rawValue || "");
                if (!normalized) continue;
                nextSearchParams.set(key, normalized);
              }

              if (category.id !== "all") {
                nextSearchParams.set("category", category.id);
              }

              const href = category.id === "all"
                ? `/account/catalog${nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : ""}`
                : `/account/catalog?${nextSearchParams.toString()}`;

              return (
                <Link
                  key={category.id}
                  href={href}
                  className={[
                    "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "border-[#23313f] bg-[#23313f] text-white"
                      : "border-black/10 bg-[#faf8f4] text-black/65 hover:bg-black/[0.03]",
                  ].join(" ")}
                >
                  <span>{category.label}</span>
                  <span className={active ? "text-white/65" : "text-black/35"}>{count}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product: any) => (
            <article key={product.id} className="rounded-[20px] border border-black/10 bg-white p-3 shadow-[0_12px_35px_rgba(0,0,0,0.04)] sm:rounded-[26px] sm:p-5">
              <div className="aspect-[4/3] overflow-hidden rounded-[16px] bg-[#f6f1e8] sm:rounded-2xl">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name || "Product"} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-semibold text-black/35">No image</div>
                )}
              </div>

              <h2 className="mt-3 text-base font-semibold sm:mt-4 sm:text-lg">{product.name || "Product"}</h2>
              <p className="mt-2 hidden min-h-[96px] line-clamp-4 text-sm text-black/60 sm:block">{product.short_description || product.description || "Description is coming soon."}</p>
              <div className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-black/40">
                {categoryLabel(categories.find((category: any) => category.id === product.category_id))}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 sm:mt-4 sm:gap-3">
                <div className="text-sm font-semibold text-[#1d1d1b]">From {money(product.base_price)}</div>
                <div className="flex items-center gap-2">
                  <Link
                    href={buildCatalogDetailsHref({
                      slugOrId: String(product.slug || product.id),
                      searchParams: selectedDate
                        ? { ...resolvedSearchParams, date: selectedDate }
                        : resolvedSearchParams,
                    })}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-black/10 px-2.5 text-xs font-semibold transition hover:bg-black/[0.03] sm:px-3 sm:text-sm"
                  >
                    Details
                  </Link>
                  <Link
                    href={buildBookNowHref({
                      productId: String(product.id),
                      searchParams: selectedDate
                        ? { ...resolvedSearchParams, date: selectedDate }
                        : resolvedSearchParams,
                    })}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-black/10 px-2.5 text-xs font-semibold transition hover:bg-black/[0.03] sm:px-3 sm:text-sm"
                  >
                    Book now
                  </Link>
                </div>
              </div>
            </article>
          ))}

          {products.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-black/15 bg-white/60 px-6 py-12 text-center text-sm text-black/50 md:col-span-2 xl:col-span-3">
              No published products found.
            </div>
          ) : null}
        </section>
      </main>
    </CustomerShell>
  );
}

import { requireAdminPermission } from "@/lib/auth/require-admin";

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function getCategoryName(categories: any[], categoryId: string | null) {
  if (!categoryId) return "No category";

  const category = categories.find((item) => item.id === categoryId);
  return category?.name || "No category";
}

function statusClass(active: boolean) {
  if (active) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  const { supabase } = await requireAdminPermission("catalog.view");

  const [productsResult, categoriesResult, groupsResult] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("inventory_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("modifier_groups")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }

  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }

  const products = productsResult.data || [];
  const categories = categoriesResult.data || [];
  const modifierGroups = groupsResult.data || [];
  const categoryProductCount = new Map<string, number>();
  for (const product of products) {
    if (!product.category_id) continue;
    categoryProductCount.set(
      product.category_id,
      (categoryProductCount.get(product.category_id) || 0) + 1
    );
  }
  const categoryIds = new Set(categories.map((category: any) => category.id));
  const isUncategorizedProduct = (product: any) => {
    return !product.category_id || !categoryIds.has(product.category_id);
  };
  const selectedCategory =
    typeof searchParams?.category === "string" ? searchParams.category : "all";
  const filteredProducts = products.filter((product: any) => {
    if (selectedCategory === "all") return true;
    if (selectedCategory === "uncategorized") return isUncategorizedProduct(product);
    return product.category_id === selectedCategory;
  });

  const activeProducts = products.filter((product: any) => product.active !== false);
  const visibleProducts = products.filter(
    (product: any) => product.customer_visible !== false
  );

  return (
    <div className="admin-ipad-page admin-ipad-catalog space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="grid gap-0 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_360px]">
          <div className="p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Bounce Party LA
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Catalog
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
              Products, categories, modifier groups and inventory links for the
              booking flow.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href="/admin/catalog/products/new"
                className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                New product
              </a>

              <a
                href="/admin/catalog/modifier-groups"
                className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
              >
                Modifier groups
              </a>

              <a
                href="/admin/catalog/inventory-links"
                className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
              >
                Inventory links
              </a>

              <a
                href="/admin/bookings/new"
                className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
              >
                Test booking
              </a>
            </div>
          </div>

          <div className="bg-[#23313f] p-6 text-white">
            <div className="rounded-[24px] bg-white/10 p-5">
              <div className="text-sm text-white/60">Products</div>
              <div className="mt-2 text-4xl font-semibold">{products.length}</div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-[24px] bg-white/10 p-5">
                <div className="text-sm text-white/60">Active</div>
                <div className="mt-2 text-3xl font-semibold">
                  {activeProducts.length}
                </div>
              </div>

              <div className="rounded-[24px] bg-white/10 p-5">
                <div className="text-sm text-white/60">Visible</div>
                <div className="mt-2 text-3xl font-semibold">
                  {visibleProducts.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <section className="rounded-[22px] border border-black/5 bg-white p-3 shadow-[0_8px_24px_rgba(0,0,0,0.035)] sm:rounded-[26px] sm:p-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 rounded-full bg-[#f5f0e9] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6c6258]">
              Product category
            </span>

            <a
              href="/admin/catalog"
              className={[
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                selectedCategory === "all"
                  ? "bg-[#23313f] text-white ring-[#23313f]"
                  : "bg-white text-[#4c443b] ring-[#e3d8cb] hover:bg-[#faf7f3]",
              ].join(" ")}
            >
              All ({products.length})
            </a>

            {categories.map((category: any) => {
              const count = categoryProductCount.get(category.id) || 0;
              const isActive = selectedCategory === category.id;

              return (
                <a
                  key={category.id}
                  href={`/admin/catalog?category=${category.id}`}
                  className={[
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                    isActive
                      ? "bg-[#23313f] text-white ring-[#23313f]"
                      : "bg-white text-[#4c443b] ring-[#e3d8cb] hover:bg-[#faf7f3]",
                  ].join(" ")}
                >
                  {category.name} ({count})
                </a>
              );
            })}

            {products.some((product: any) => isUncategorizedProduct(product)) && (
              <a
                href="/admin/catalog?category=uncategorized"
                className={[
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                  selectedCategory === "uncategorized"
                    ? "bg-[#23313f] text-white ring-[#23313f]"
                    : "bg-white text-[#4c443b] ring-[#e3d8cb] hover:bg-[#faf7f3]",
                ].join(" ")}
              >
                No category ({products.filter((product: any) => isUncategorizedProduct(product)).length})
              </a>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 rounded-full bg-[#f5f0e9] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#6c6258]">
              Modifier group
            </span>

            {modifierGroups.slice(0, 6).map((group: any) => (
              <a
                key={group.id}
                href={`/admin/catalog/modifier-groups/${group.id}`}
                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#4c443b] ring-1 ring-[#e3d8cb] transition hover:bg-[#faf7f3]"
              >
                {group.name}
              </a>
            ))}

            <a
              href="/admin/catalog/modifier-groups"
              className="shrink-0 rounded-full bg-[#23313f] px-3 py-1.5 text-xs font-semibold text-white"
            >
              All groups
            </a>
          </div>
        </section>

        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">Products</h3>
            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Main rental items shown in the admin and booking wizard.
            </p>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2 2xl:grid-cols-3">
            {filteredProducts.map((product: any) => (
              <a
                key={product.id}
                href={`/admin/catalog/products/${product.id}`}
                className="group overflow-hidden rounded-[26px] border border-[#eee5d9] bg-[#fcfaf7] transition hover:-translate-y-0.5 hover:shadow-[0_16px_35px_rgba(0,0,0,0.08)]"
              >
                <div className="aspect-[4/3] bg-[#efe7dc]">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm font-semibold text-[#9a7a49]">
                      No product photo
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                        product.active !== false
                      )}`}
                    >
                      {product.active !== false ? "Active" : "Inactive"}
                    </span>

                    {product.customer_visible !== false ? (
                      <span className="rounded-full bg-[#eaf2f9] px-3 py-1 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
                        Customer visible
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600 ring-1 ring-neutral-200">
                        Hidden
                      </span>
                    )}
                  </div>

                  <h4 className="mt-3 line-clamp-2 min-h-[44px] text-base font-semibold text-[#1f1e1b]">
                    {product.name}
                  </h4>

                  <p className="mt-2 min-h-[80px] whitespace-pre-line text-sm leading-5 text-[#6c6258] line-clamp-4">
                    {product.short_description || "No short description"}
                  </p>

                  <p className="mt-2 text-xs text-[#6c6258]">
                    {getCategoryName(categories, product.category_id)}
                  </p>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#9a723e]">
                      {money(product.base_price)}
                    </span>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#eee5d9]">
                      Edit
                    </span>
                  </div>
                </div>
              </a>
            ))}

            {filteredProducts.length === 0 && (
              <div className="col-span-full rounded-[26px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-6 py-14 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No products for this filter
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Change category filter or create a new catalog product.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

async function linkProductInventoryAction(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const productId = getString(formData, "productId");
  const inventoryItemId = getNullableString(formData, "inventoryItemId");

  if (!productId) {
    throw new Error("Missing product id.");
  }

  const { error } = await supabase
    .from("products")
    .update({
      inventory_item_id: inventoryItemId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/catalog");
  revalidatePath("/admin/catalog/inventory-links");
  revalidatePath(`/admin/catalog/products/${productId}`);
}

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function productStatusClass(active: boolean) {
  if (active) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function linkStatusClass(isLinked: boolean) {
  if (isLinked) {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
        {label}
      </span>

      {children}

      {hint && <span className="mt-1 block text-xs text-[#8b8177]">{hint}</span>}
    </label>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

export default async function CatalogInventoryLinksPage() {
  const supabase = await createClient();

  const [productsResult, inventoryItemsResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        `
        id,
        name,
        slug,
        description,
        base_price,
        active,
        category_id,
        inventory_item_id,
        sort_order
      `
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("inventory_items")
      .select(
        `
        id,
        name,
        sku,
        tracking_type,
        default_purchase_price,
        active,
        deleted_at
      `
      )
      .is("deleted_at", null)
      .neq("active", false)
      .order("name", { ascending: true }),
  ]);

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  if (inventoryItemsResult.error) {
    throw new Error(inventoryItemsResult.error.message);
  }

  const products = productsResult.data || [];
  const inventoryItems = inventoryItemsResult.data || [];

  const linkedCount = products.filter((product: any) =>
    Boolean(product.inventory_item_id)
  ).length;

  const unlinkedCount = products.length - linkedCount;

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a
              href="/admin/catalog"
              className="text-sm font-semibold text-[#9a723e] hover:text-[#7f633a]"
            >
              ← Catalog
            </a>

            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Catalog inventory
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Inventory Links
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
              Свяжи товары каталога с физическими позициями склада. Тогда при
              бронировании система сможет проверять доступность inventory.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/admin/catalog/products/new"
              className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
            >
              Add product
            </a>

            <a
              href="/admin/inventory/receive"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Receive stock
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Products
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">
            {products.length}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Linked
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#355879]">
            {linkedCount}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Unlinked
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#8a6b20]">
            {unlinkedCount}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Inventory
          </div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">
            {inventoryItems.length}
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-6 py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">
            Product to inventory mapping
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Каждый catalog product можно связать с одной складской позицией.
          </p>
        </div>

        <div className="divide-y divide-[#eee5d9]">
          {products.map((product: any) => {
            const linkedInventory = inventoryItems.find(
              (item: any) => item.id === product.inventory_item_id
            );

            const isLinked = Boolean(product.inventory_item_id);

            return (
              <div key={product.id} className="p-6">
                <div className="grid gap-5 xl:grid-cols-[1fr_440px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-semibold text-[#1f1e1b]">
                        {product.name}
                      </h4>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${productStatusClass(
                          product.active !== false
                        )}`}
                      >
                        {product.active !== false ? "Active" : "Inactive"}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${linkStatusClass(
                          isLinked
                        )}`}
                      >
                        {isLinked ? "Linked" : "Not linked"}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-[#6c6258]">
                      Price: {money(product.base_price)} · Slug:{" "}
                      {product.slug || "—"}
                    </div>

                    {product.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#6c6258]">
                        {product.description}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={`/admin/catalog/products/${product.id}`}
                        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
                      >
                        Edit product
                      </a>

                      {linkedInventory && (
                        <a
                          href={`/admin/inventory/items/${linkedInventory.id}`}
                          className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#18222d]"
                        >
                          Open inventory
                        </a>
                      )}
                    </div>
                  </div>

                  <form
                    action={linkProductInventoryAction}
                    className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-4"
                  >
                    <input type="hidden" name="productId" value={product.id} />

                    <Field
                      label="Linked inventory item"
                      hint="Выбери складскую позицию, которую надо проверять при бронировании этого товара."
                    >
                      <Select
                        name="inventoryItemId"
                        defaultValue={product.inventory_item_id || ""}
                      >
                        <option value="">No inventory link</option>

                        {inventoryItems.map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {item.sku ? ` · ${item.sku}` : ""}
                            {item.tracking_type ? ` · ${item.tracking_type}` : ""}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    {linkedInventory && (
                      <div className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-[#6c6258] ring-1 ring-[#eee5d9]">
                        <div className="font-semibold text-[#1f1e1b]">
                          Current link
                        </div>
                        <div className="mt-1">
                          {linkedInventory.name}
                          {linkedInventory.sku ? ` · ${linkedInventory.sku}` : ""}
                        </div>
                        <div className="mt-1">
                          Tracking: {linkedInventory.tracking_type || "—"}
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="mt-4 w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.22)] transition hover:bg-[#b78744]"
                    >
                      Save link
                    </button>
                  </form>
                </div>
              </div>
            );
          })}

          {products.length === 0 && (
            <div className="px-6 py-16 text-center">
              <div className="text-lg font-semibold text-[#1f1e1b]">
                No products yet
              </div>

              <p className="mt-2 text-sm text-[#6c6258]">
                Create catalog products first.
              </p>

              <a
                href="/admin/catalog/products/new"
                className="mt-5 inline-flex rounded-full bg-[#c9964f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                Add product
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
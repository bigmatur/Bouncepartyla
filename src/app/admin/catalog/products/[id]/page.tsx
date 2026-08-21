import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProductComponentsManager from "./components/ProductComponentsManager";
import SafePhotoUploadForm from "@/components/admin/SafePhotoUploadForm";
import {
  cloneCatalogProductAction,
  removeCatalogProductPhotoAction,
  updateCatalogProductAction,
  uploadCatalogProductPhotoAction,
} from "./actions";

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function numberValue(value: any, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function textValue(value: any) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function galleryText(value: any) {
  if (!Array.isArray(value)) return "";
  return value.filter(Boolean).join("\n");
}

function getRelationOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
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

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
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

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function statusClass(active: boolean) {
  if (active) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

export default async function CatalogProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    productResult,
    categoriesResult,
    inventoryCategoriesResult,
    inventoryItemsResult,
    componentsResult,
    optionGroupsResult,
  ] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),

    supabase
      .from("categories")
      .select("id, name, active, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("inventory_categories")
      .select("id, name, active, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("inventory_items")
      .select(
        `
        id,
        name,
        sku,
        category_id,
        tracking_type,
        default_purchase_price,
        image_url,
        active,
        deleted_at
      `
      )
      .is("deleted_at", null)
      .neq("active", false)
      .order("name", { ascending: true }),

    supabase
      .from("product_inventory_components")
      .select(
        `
        id,
        product_id,
        inventory_item_id,
        quantity,
        required,
        sort_order,
        notes,
        inventory_items (
          id,
          name,
          sku,
          category_id,
          tracking_type,
          default_purchase_price,
          image_url
        )
      `
      )
      .eq("product_id", id)
      .order("sort_order", { ascending: true }),

    supabase
      .from("product_modifier_groups")
      .select(
        `
        id,
        product_id,
        modifier_group_id,
        sort_order,
        required,
        modifier_groups (
          id,
          name
        )
      `
      )
      .eq("product_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  if (productResult.error) {
    throw new Error(productResult.error.message);
  }

  if (!productResult.data) {
    notFound();
  }

  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }

  if (inventoryCategoriesResult.error) {
    throw new Error(inventoryCategoriesResult.error.message);
  }

  if (inventoryItemsResult.error) {
    throw new Error(inventoryItemsResult.error.message);
  }

  if (componentsResult.error) {
    throw new Error(componentsResult.error.message);
  }

  if (optionGroupsResult.error) {
    throw new Error(optionGroupsResult.error.message);
  }

  const product = productResult.data;

  const categories = (categoriesResult.data || []).filter(
    (category: any) => category.active !== false
  );
  const inventoryCategories = inventoryCategoriesResult.data || [];
  const inventoryItems = inventoryItemsResult.data || [];
  const components = componentsResult.data || [];
  const optionGroups = optionGroupsResult.data || [];

  const productCategory = categories.find(
    (category: any) => category.id === product.category_id
  );

  const linkedInventory = inventoryItems.find(
    (item: any) => item.id === product.inventory_item_id
  );

  const active = product.active !== false;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="grid gap-0 xl:grid-cols-[1fr_360px]">
          <div className="p-6">
            <a
              href="/admin/catalog"
              className="text-sm font-semibold text-[#9a723e] hover:text-[#7f633a]"
            >
              ← Catalog
            </a>

            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Catalog product
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              {product.name}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
              {product.short_description ||
                "Product settings, inventory link, timing and required warehouse components."}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href="/admin/catalog/inventory-links"
                className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
              >
                Inventory links
              </a>

              <a
                href="/admin/inventory/supplies/new"
                className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                New supply
              </a>

              <a
                href="/admin/catalog"
                className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
              >
                Catalog list
              </a>

              <form action={cloneCatalogProductAction}>
                <input type="hidden" name="productId" value={product.id} />

                <button
                  type="submit"
                  className="rounded-full border border-[#9ac1df] bg-[#eaf2f9] px-5 py-3 text-sm font-semibold text-[#1f4f73] transition hover:bg-[#dceaf6]"
                >
                  Duplicate product
                </button>
              </form>
            </div>
          </div>

          <div className="bg-[#23313f] p-6 text-white">
            <div className="rounded-[24px] bg-white/10 p-5">
              <div className="text-sm text-white/60">Price</div>
              <div className="mt-2 text-4xl font-semibold">
                {money(product.base_price)}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-[24px] bg-white/10 p-5">
                <div className="text-sm text-white/60">Components</div>
                <div className="mt-2 text-3xl font-semibold">
                  {components.length}
                </div>
              </div>

              <div className="rounded-[24px] bg-white/10 p-5">
                <div className="text-sm text-white/60">Options</div>
                <div className="mt-2 text-3xl font-semibold">
                  {optionGroups.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-6">
          <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="aspect-square bg-[#efe7dc]">
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

            <div className="space-y-4 p-5">
              <div>
                <h3 className="text-lg font-semibold text-[#1f1e1b]">
                  Product photo
                </h3>

                <p className="mt-1 text-sm text-[#6c6258]">
                  Фото загружается через Supabase Storage. Ручные URL-поля
                  убраны.
                </p>
              </div>

              <SafePhotoUploadForm
                action={uploadCatalogProductPhotoAction}
                hiddenFields={[{ name: "productId", value: product.id }]}
                buttonLabel="Upload photo"
              />

              {product.image_url && (
                <form action={removeCatalogProductPhotoAction}>
                  <input type="hidden" name="productId" value={product.id} />

                  <button
                    type="submit"
                    className="w-full rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Remove photo
                  </button>
                </form>
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-black/5 bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-lg font-semibold text-[#1f1e1b]">
              Quick summary
            </h3>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Status</span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                    active
                  )}`}
                >
                  {active ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Category</span>

                <span className="font-semibold text-[#1f1e1b]">
                  {productCategory?.name || "No category"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Main inventory</span>

                <span className="text-right font-semibold text-[#1f1e1b]">
                  {linkedInventory?.name || "Not linked"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Rental min</span>

                <span className="font-semibold text-[#1f1e1b]">
                  {product.rental_duration_min || 1440}
                </span>
              </div>
            </div>
          </section>
        </aside>

        <main className="space-y-6">
          <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Product settings
              </h3>

              <p className="mt-1 text-sm leading-6 text-[#6c6258]">
                Основные настройки товара. Поля Image URL и Gallery URLs
                удалены.
              </p>
            </div>

            <form action={updateCatalogProductAction} className="space-y-6">
              <input type="hidden" name="productId" value={product.id} />

              <div className="grid gap-5 p-6">
                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <Field label="Name">
                    <Input
                      name="name"
                      defaultValue={textValue(product.name)}
                      required
                    />
                  </Field>

                  <Field label="Base price">
                    <Input
                      name="basePrice"
                      type="number"
                      step="0.01"
                      defaultValue={numberValue(product.base_price, "0")}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Category">
                    <Select
                      name="categoryId"
                      defaultValue={product.category_id || ""}
                    >
                      <option value="">No category</option>

                      {categories.map((category: any) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field
                    label="Main inventory item"
                    hint="Основная складская позиция этого товара. Для комплекта используй Inventory components ниже."
                  >
                    <Select
                      name="inventoryItemId"
                      defaultValue={product.inventory_item_id || ""}
                    >
                      <option value="">No inventory item</option>

                      {inventoryItems.map((item: any) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {item.sku ? ` · ${item.sku}` : ""}
                          {item.tracking_type ? ` · ${item.tracking_type}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field label="Short description">
                  <Input
                    name="shortDescription"
                    defaultValue={textValue(product.short_description)}
                    placeholder="Short product description for cards and list..."
                  />
                </Field>

                <Field label="Public title">
                  <Input
                    name="publicTitle"
                    defaultValue={textValue((product as any).public_title)}
                    placeholder="Optional customer-facing title"
                  />
                </Field>

                <Field label="Full description">
                  <Textarea
                    name="fullDescription"
                    rows={5}
                    defaultValue={textValue(product.description)}
                    placeholder="Full product description for detailed customer view..."
                  />
                </Field>

                <Field
                  label="Gallery URLs"
                  hint="One URL per line or comma-separated list."
                >
                  <Textarea
                    name="galleryUrls"
                    rows={3}
                    defaultValue={galleryText((product as any).gallery_urls)}
                    placeholder="https://.../photo-1.jpg"
                  />
                </Field>

                <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
                  <h4 className="text-base font-semibold text-[#1f1e1b]">
                    Customer specs
                  </h4>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Field label="Setup width (ft)">
                      <Input
                        name="setupWidthFt"
                        type="number"
                        step="0.1"
                        defaultValue={numberValue(product.setup_width_ft)}
                      />
                    </Field>

                    <Field label="Setup length (ft)">
                      <Input
                        name="setupLengthFt"
                        type="number"
                        step="0.1"
                        defaultValue={numberValue(product.setup_length_ft)}
                      />
                    </Field>

                    <Field label="Setup height (ft)">
                      <Input
                        name="setupHeightFt"
                        type="number"
                        step="0.1"
                        defaultValue={numberValue(product.setup_height_ft)}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Field label="Min age">
                      <Input
                        name="minAge"
                        type="number"
                        defaultValue={numberValue(product.min_age)}
                      />
                    </Field>

                    <Field label="Max age">
                      <Input
                        name="maxAge"
                        type="number"
                        defaultValue={numberValue(product.max_age)}
                      />
                    </Field>

                    <Field label="Max capacity">
                      <Input
                        name="maxCapacity"
                        type="number"
                        defaultValue={numberValue(product.max_capacity)}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="Deposit amount">
                      <Input
                        name="depositAmount"
                        type="number"
                        step="0.01"
                        defaultValue={numberValue(product.deposit_amount, "50")}
                      />
                    </Field>

                    <Field label="Setup surface">
                      <Input
                        name="setupSurface"
                        defaultValue={textValue((product as any).setup_surface)}
                        placeholder="Grass, concrete, turf"
                      />
                    </Field>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="Power requirements">
                      <Input
                        name="powerRequirements"
                        defaultValue={textValue((product as any).power_requirements)}
                        placeholder="1 standard outlet within 50 ft"
                      />
                    </Field>

                    <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee5d9] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                      <span>Water use</span>
                      <input
                        type="checkbox"
                        name="waterUse"
                        defaultChecked={(product as any).water_use === true}
                        className="h-5 w-5"
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee5d9] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                      <span>Indoor allowed</span>
                      <input
                        type="checkbox"
                        name="indoorAllowed"
                        defaultChecked={(product as any).indoor_allowed === true}
                        className="h-5 w-5"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee5d9] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                      <span>Outdoor allowed</span>
                      <input
                        type="checkbox"
                        name="outdoorAllowed"
                        defaultChecked={(product as any).outdoor_allowed === true}
                        className="h-5 w-5"
                      />
                    </label>
                  </div>
                </div>

                <Field label="What is included">
                  <Textarea
                    name="whatIncluded"
                    rows={3}
                    defaultValue={textValue((product as any).what_included)}
                    placeholder="Blower, extension cord, tarp..."
                  />
                </Field>

                <Field label="What is not included">
                  <Textarea
                    name="whatNotIncluded"
                    rows={3}
                    defaultValue={textValue((product as any).what_not_included)}
                    placeholder="Attendant, generator, park permit..."
                  />
                </Field>

                <Field label="Safety rules">
                  <Textarea
                    name="safetyRules"
                    rows={4}
                    defaultValue={textValue((product as any).safety_rules)}
                    placeholder="No shoes, no sharp objects, adult supervision required..."
                  />
                </Field>

                <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
                  <h4 className="text-base font-semibold text-[#1f1e1b]">SEO</h4>

                  <div className="mt-4 grid gap-4">
                    <Field label="SEO title">
                      <Input
                        name="seoTitle"
                        defaultValue={textValue((product as any).seo_title)}
                        placeholder="SEO page title"
                      />
                    </Field>

                    <Field label="SEO description">
                      <Textarea
                        name="seoDescription"
                        rows={3}
                        defaultValue={textValue((product as any).seo_description)}
                        placeholder="SEO meta description"
                      />
                    </Field>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
                  <h4 className="text-base font-semibold text-[#1f1e1b]">
                    Booking timing
                  </h4>

                  <p className="mt-1 text-sm text-[#6c6258]">
                    Используется для availability window и резервирования склада.
                  </p>

                  <div className="mt-4 grid gap-4 md:grid-cols-5">
                    <Field label="Rental min">
                      <Input
                        name="rentalDurationMin"
                        type="number"
                        defaultValue={numberValue(
                          product.rental_duration_min,
                          "1440"
                        )}
                      />
                    </Field>

                    <Field label="Setup min">
                      <Input
                        name="setupDurationMin"
                        type="number"
                        defaultValue={numberValue(
                          product.setup_duration_min,
                          "60"
                        )}
                      />
                    </Field>

                    <Field label="Teardown min">
                      <Input
                        name="teardownDurationMin"
                        type="number"
                        defaultValue={numberValue(
                          product.teardown_duration_min,
                          "60"
                        )}
                      />
                    </Field>

                    <Field label="Buffer before">
                      <Input
                        name="bufferBeforeMin"
                        type="number"
                        defaultValue={numberValue(
                          product.buffer_before_min,
                          "0"
                        )}
                      />
                    </Field>

                    <Field label="Buffer after">
                      <Input
                        name="bufferAfterMin"
                        type="number"
                        defaultValue={numberValue(product.buffer_after_min, "0")}
                      />
                    </Field>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                  <Field label="Admin notes">
                    <Textarea
                      name="adminNotes"
                      rows={4}
                      defaultValue={textValue(product.admin_notes)}
                      placeholder="Internal notes..."
                    />
                  </Field>

                  <Field label="Sort order">
                    <Input
                      name="sortOrder"
                      type="number"
                      defaultValue={numberValue(product.sort_order, "100")}
                    />
                  </Field>
                </div>

                <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                  <span>Active product</span>

                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={active}
                    className="h-5 w-5"
                  />
                </label>
              </div>

              <div className="flex justify-end border-t border-[#eee5d9] px-6 py-5">
                <button
                  type="submit"
                  className="rounded-full bg-[#c9964f] px-8 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.28)] transition hover:bg-[#b78744]"
                >
                  Save product
                </button>
              </div>
            </form>
          </section>

          <ProductComponentsManager
            productId={product.id}
            components={components}
            inventoryItems={inventoryItems}
            inventoryCategories={inventoryCategories}
          />

          <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eee5d9] px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-[#1f1e1b]">
                  Option groups
                </h3>

                <p className="mt-1 text-sm leading-6 text-[#6c6258]">
                  These groups appear in the booking flow after the product is
                  available.
                </p>
              </div>

              <a
                href="/admin/catalog/modifier-groups"
                className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
              >
                Manage groups
              </a>
            </div>

            <div className="divide-y divide-[#eee5d9]">
              {optionGroups.map((row: any) => {
                const group = getRelationOne(row.modifier_groups);

                return (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-5"
                  >
                    <div>
                      <div className="font-semibold text-[#1f1e1b]">
                        {group?.name || "Option group"}
                      </div>

                      <div className="mt-1 text-sm text-[#6c6258]">
                        Sort: {row.sort_order || 100} ·{" "}
                        {row.required ? "Required" : "Optional"}
                      </div>
                    </div>
                  </div>
                );
              })}

              {optionGroups.length === 0 && (
                <div className="px-6 py-12 text-center text-sm text-[#6c6258]">
                  No option groups attached yet.
                </div>
              )}
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}
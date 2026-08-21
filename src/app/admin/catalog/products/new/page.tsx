import { createClient } from "@/lib/supabase/server";
import { createCatalogProductAction } from "./actions";

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
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

export default async function NewCatalogProductPage() {
  const supabase = await createClient();

  const [categoriesResult, inventoryItemsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, active, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("inventory_items")
      .select("id, name, sku, tracking_type, active, deleted_at, default_purchase_price")
      .is("deleted_at", null)
      .neq("active", false)
      .order("name", { ascending: true }),
  ]);

  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }

  if (inventoryItemsResult.error) {
    throw new Error(inventoryItemsResult.error.message);
  }

  const categories = (categoriesResult.data || []).filter(
    (category: any) => category.active !== false
  );

  const inventoryItems = inventoryItemsResult.data || [];

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
              Catalog product
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Create Product
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
              Создай товар для каталога бронирования. После сохранения откроется
              страница редактирования, где можно добавить фото, опции, связку со
              складом и настройки времени.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/admin/catalog"
              className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              Catalog
            </a>

            <a
              href="/admin/inventory"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Inventory
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Product details
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Основные данные товара, цена и связь со складом.
            </p>
          </div>

          <form action={createCatalogProductAction} className="space-y-6">
            <div className="grid gap-5 p-6">
              <Field label="Product name">
                <Input
                  name="name"
                  placeholder="White Castle with Slide, Soft Play, Bubble House..."
                  required
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Category">
                  <Select name="categoryId" defaultValue="">
                    <option value="">No category</option>

                    {categories.map((category: any) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Base price">
                  <Input
                    name="basePrice"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                  />
                </Field>
              </div>

              <Field
                label="Inventory item"
                hint="Свяжи catalog product со складской позицией. Например product White Castle → inventory item White Castle."
              >
                <Select name="inventoryItemId" defaultValue="">
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

              <Field label="Short description">
                <Input
                  name="shortDescription"
                  placeholder="Short description for product cards..."
                />
              </Field>

              <Field label="Public title" hint="Optional title shown on customer-facing card/page.">
                <Input
                  name="publicTitle"
                  placeholder="Princess Castle Bounce House"
                />
              </Field>

              <Field label="Full description">
                <Textarea
                  name="fullDescription"
                  rows={5}
                  placeholder="Full description for customer product details..."
                />
              </Field>

              <Field
                label="Gallery URLs"
                hint="One URL per line or comma-separated list."
              >
                <Textarea
                  name="galleryUrls"
                  rows={3}
                  placeholder="https://.../photo-1.jpg"
                />
              </Field>

              <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
                <h4 className="text-base font-semibold text-[#1f1e1b]">
                  Customer specs
                </h4>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Setup width (ft)">
                    <Input name="setupWidthFt" type="number" step="0.1" />
                  </Field>

                  <Field label="Setup length (ft)">
                    <Input name="setupLengthFt" type="number" step="0.1" />
                  </Field>

                  <Field label="Setup height (ft)">
                    <Input name="setupHeightFt" type="number" step="0.1" />
                  </Field>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Min age">
                    <Input name="minAge" type="number" />
                  </Field>

                  <Field label="Max age">
                    <Input name="maxAge" type="number" />
                  </Field>

                  <Field label="Max capacity">
                    <Input name="maxCapacity" type="number" />
                  </Field>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Deposit amount">
                    <Input name="depositAmount" type="number" step="0.01" defaultValue="50" />
                  </Field>

                  <Field label="Setup surface">
                    <Input
                      name="setupSurface"
                      placeholder="Grass, concrete, turf"
                    />
                  </Field>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Power requirements">
                    <Input
                      name="powerRequirements"
                      placeholder="1 standard outlet within 50 ft"
                    />
                  </Field>

                  <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee5d9] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                    <span>Water use</span>
                    <input type="checkbox" name="waterUse" className="h-5 w-5" />
                  </label>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee5d9] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                    <span>Indoor allowed</span>
                    <input type="checkbox" name="indoorAllowed" className="h-5 w-5" />
                  </label>

                  <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee5d9] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                    <span>Outdoor allowed</span>
                    <input type="checkbox" name="outdoorAllowed" className="h-5 w-5" />
                  </label>
                </div>
              </div>

              <Field label="What is included">
                <Textarea
                  name="whatIncluded"
                  rows={3}
                  placeholder="Blower, extension cord, tarp..."
                />
              </Field>

              <Field label="What is not included">
                <Textarea
                  name="whatNotIncluded"
                  rows={3}
                  placeholder="Attendant, generator, park permit..."
                />
              </Field>

              <Field label="Safety rules">
                <Textarea
                  name="safetyRules"
                  rows={4}
                  placeholder="No shoes, no sharp objects, adult supervision required..."
                />
              </Field>

              <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
                <h4 className="text-base font-semibold text-[#1f1e1b]">SEO</h4>

                <div className="mt-4 grid gap-4">
                  <Field label="SEO title">
                    <Input
                      name="seoTitle"
                      placeholder="Princess Castle Bounce House Rental in Los Angeles"
                    />
                  </Field>

                  <Field label="SEO description">
                    <Textarea
                      name="seoDescription"
                      rows={3}
                      placeholder="Premium bounce house rental with setup and takedown included..."
                    />
                  </Field>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field
                  label="Rental duration"
                  hint="Сколько минут товар считается занятым. 1440 = весь день."
                >
                  <Input
                    name="rentalDurationMin"
                    type="number"
                    defaultValue="1440"
                  />
                </Field>

                <Field label="Setup minutes">
                  <Input
                    name="setupDurationMin"
                    type="number"
                    defaultValue="60"
                  />
                </Field>

                <Field label="Teardown minutes">
                  <Input
                    name="teardownDurationMin"
                    type="number"
                    defaultValue="60"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Buffer before">
                  <Input
                    name="bufferBeforeMin"
                    type="number"
                    defaultValue="0"
                  />
                </Field>

                <Field label="Buffer after">
                  <Input
                    name="bufferAfterMin"
                    type="number"
                    defaultValue="0"
                  />
                </Field>

                <Field label="Sort order">
                  <Input name="sortOrder" type="number" defaultValue="100" />
                </Field>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                <span>Active product</span>
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked
                  className="h-5 w-5"
                />
              </label>
            </div>

            <div className="flex justify-end border-t border-[#eee5d9] px-6 py-5">
              <button
                type="submit"
                className="rounded-full bg-[#c9964f] px-8 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.28)] transition hover:bg-[#b78744]"
              >
                Create product
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              How it works
            </h3>

            <div className="mt-5 space-y-4 text-sm leading-6 text-[#6c6258]">
              <p>
                <strong className="text-[#1f1e1b]">Product</strong> — это то,
                что клиент или админ выбирает в booking.
              </p>

              <p>
                <strong className="text-[#1f1e1b]">Inventory item</strong> — это
                физический товар на складе, который проверяется на доступность.
              </p>

              <p>
                Например: product “Bounce Cake” можно связать со складом
                “Bounce Cake”. Тогда при бронировании система будет проверять
                свободные units.
              </p>
            </div>
          </section>

          <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Inventory available
            </h3>

            <div className="mt-5 space-y-3">
              {inventoryItems.slice(0, 8).map((item: any) => (
                <div
                  key={item.id}
                  className="rounded-[20px] border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3"
                >
                  <div className="font-semibold text-[#1f1e1b]">
                    {item.name}
                  </div>

                  <div className="mt-1 text-xs text-[#6c6258]">
                    {item.sku || "No SKU"} · {item.tracking_type || "tracking"} ·{" "}
                    {money(item.default_purchase_price)}
                  </div>
                </div>
              ))}

              {inventoryItems.length === 0 && (
                <div className="rounded-[20px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-4 py-8 text-center text-sm text-[#6c6258]">
                  No inventory items yet.
                </div>
              )}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
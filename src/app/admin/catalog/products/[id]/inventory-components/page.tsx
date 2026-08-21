import { createClient } from "@/lib/supabase/server";
import {
  addProductInventoryComponentAction,
  toggleProductInventoryComponentAction,
  updateProductInventoryComponentAction,
} from "./actions";

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function prettyTrackingType(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function componentStatusClass(active: boolean) {
  if (active) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
        {label}
      </span>
      {children}
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

export default async function ProductInventoryComponentsPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const productId = params.id;

  const [productResult, inventoryItemsResult, componentsResult] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, active")
        .eq("id", productId)
        .single(),

      supabase
        .from("inventory_items")
        .select(
          `
          id,
          name,
          sku,
          tracking_type,
          quantity_on_hand,
          quantity_available,
          active
        `
        )
        .eq("active", true)
        .order("name", { ascending: true }),

      supabase
        .from("product_inventory_components")
        .select(
          `
          id,
          component_name,
          component_role,
          quantity_required,
          is_required,
          allow_substitution,
          inventory_behavior,
          sort_order,
          active,
          notes,
          inventory_items (
            id,
            name,
            sku,
            tracking_type,
            quantity_on_hand,
            quantity_available
          )
        `
        )
        .eq("product_id", productId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  if (productResult.error) {
    throw new Error(productResult.error.message);
  }

  if (inventoryItemsResult.error) {
    throw new Error(inventoryItemsResult.error.message);
  }

  if (componentsResult.error) {
    throw new Error(componentsResult.error.message);
  }

  const product = productResult.data;
  const inventoryItems = inventoryItemsResult.data || [];
  const components = componentsResult.data || [];

  const activeComponents = components.filter((component: any) => component.active);
  const requiredComponents = activeComponents.filter(
    (component: any) => component.is_required
  );
  const optionalComponents = activeComponents.filter(
    (component: any) => !component.is_required
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white px-6 py-5 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <a
              href={`/admin/catalog/products/${product.id}`}
              className="text-sm font-semibold text-[#9a723e] hover:text-[#7f633a]"
            >
              ← Back to product
            </a>

            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Product inventory setup
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              {product.name}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
              Здесь указывается, какие складские позиции нужны для этой услуги.
              Потом New Booking будет проверять свободность каждого компонента
              на выбранную дату и время.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/admin/inventory"
              className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              Inventory
            </a>

            <a
              href="/admin/catalog"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Catalog
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Active components
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">
            {activeComponents.length}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Required
          </div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">
            {requiredComponents.length}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Optional
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#9a723e]">
            {optionalComponents.length}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <main className="space-y-6">
          <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Inventory components
              </h3>

              <p className="mt-1 text-sm text-[#6c6258]">
                Основной товар тоже надо добавить сюда как компонент. Например:
                Bounce House Unit x1, Blower x1, Tarp x1.
              </p>
            </div>

            <div className="divide-y divide-[#f0e7dc]">
              {components.map((component: any) => {
                const inventoryItem = getOne(component.inventory_items);

                return (
                  <div key={component.id} className="p-6">
                    <form
                      action={updateProductInventoryComponentAction}
                      className="space-y-4"
                    >
                      <input type="hidden" name="productId" value={product.id} />
                      <input
                        type="hidden"
                        name="componentId"
                        value={component.id}
                      />

                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-lg font-semibold text-[#1f1e1b]">
                              {component.component_name ||
                                inventoryItem?.name ||
                                "Inventory component"}
                            </h4>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${componentStatusClass(
                                component.active
                              )}`}
                            >
                              {component.active ? "Active" : "Inactive"}
                            </span>

                            <span className="rounded-full bg-[#eaf2f9] px-3 py-1 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
                              {component.is_required ? "Required" : "Optional"}
                            </span>

                            {component.allow_substitution && (
                              <span className="rounded-full bg-[#fff4d8] px-3 py-1 text-xs font-semibold text-[#8a6b20] ring-1 ring-[#efd582]">
                                Substitution allowed
                              </span>
                            )}

                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#eee5d9]">
                              {component.inventory_behavior === "consumable" ? "Consumable" : "Reusable"}
                            </span>
                          </div>

                          <div className="mt-2 text-sm leading-6 text-[#6c6258]">
                            {inventoryItem?.name || "Missing inventory item"} ·{" "}
                            {inventoryItem?.sku || "No SKU"} ·{" "}
                            {prettyTrackingType(inventoryItem?.tracking_type)}
                          </div>
                        </div>

                        <form action={toggleProductInventoryComponentAction}>
                          <input
                            type="hidden"
                            name="productId"
                            value={product.id}
                          />
                          <input
                            type="hidden"
                            name="componentId"
                            value={component.id}
                          />
                          <input
                            type="hidden"
                            name="active"
                            value={component.active ? "false" : "true"}
                          />

                          <button
                            type="submit"
                            className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
                          >
                            {component.active ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <Field label="Display name">
                          <Input
                            name="componentName"
                            defaultValue={component.component_name || ""}
                            placeholder={inventoryItem?.name || ""}
                          />
                        </Field>

                        <Field label="Role">
                          <Select
                            name="componentRole"
                            defaultValue={component.component_role || "required"}
                          >
                            <option value="required">Required</option>
                            <option value="main_unit">Main unit</option>
                            <option value="blower">Blower</option>
                            <option value="tarp">Tarp</option>
                            <option value="extension_cord">
                              Extension cord
                            </option>
                            <option value="generator">Generator</option>
                            <option value="balls">Balls</option>
                            <option value="decor">Decor</option>
                            <option value="safety">Safety</option>
                            <option value="other">Other</option>
                          </Select>
                        </Field>

                        <Field label="Qty required">
                          <Input
                            name="quantityRequired"
                            type="number"
                            step="0.01"
                            defaultValue={component.quantity_required || 1}
                          />
                        </Field>

                        <Field label="Sort order">
                          <Input
                            name="sortOrder"
                            type="number"
                            defaultValue={component.sort_order || 100}
                          />
                        </Field>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Inventory behavior">
                          <Select name="inventoryBehavior" defaultValue={component.inventory_behavior || "reusable"}>
                            <option value="reusable">Reusable — reserve and return to stock after use</option>
                            <option value="consumable">Consumable — deduct from stock after use</option>
                          </Select>
                        </Field>

                        <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                          <input
                            type="checkbox"
                            name="isRequired"
                            defaultChecked={component.is_required}
                            className="h-4 w-4"
                          />
                          Required for this service
                        </label>

                        <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                          <input
                            type="checkbox"
                            name="allowSubstitution"
                            defaultChecked={component.allow_substitution}
                            className="h-4 w-4"
                          />
                          Allow substitution
                        </label>
                      </div>

                      <Field label="Notes">
                        <Textarea
                          name="notes"
                          rows={2}
                          defaultValue={component.notes || ""}
                          placeholder="Example: must go with this bounce house"
                        />
                      </Field>

                      <button
                        type="submit"
                        className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                      >
                        Save component
                      </button>
                    </form>
                  </div>
                );
              })}

              {components.length === 0 && (
                <div className="px-6 py-16 text-center">
                  <div className="text-lg font-semibold text-[#1f1e1b]">
                    No inventory components yet
                  </div>
                  <p className="mt-2 text-sm text-[#6c6258]">
                    Add the main unit and all required equipment for this
                    product.
                  </p>
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="space-y-6">
          <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Add component
              </h3>

              <p className="mt-1 text-sm leading-6 text-[#6c6258]">
                Добавь складскую позицию, которая нужна для этого товара.
              </p>
            </div>

            <form action={addProductInventoryComponentAction} className="space-y-4 p-6">
              <input type="hidden" name="productId" value={product.id} />

              <Field label="Inventory item">
                <Select name="inventoryItemId" required>
                  <option value="">Choose inventory item</option>

                  {inventoryItems.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.sku ? ` · ${item.sku}` : ""}
                      {item.tracking_type ? ` · ${item.tracking_type}` : ""}
                      {item.quantity_available !== null &&
                      item.quantity_available !== undefined
                        ? ` · available ${item.quantity_available}`
                        : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Display name">
                <Input
                  name="componentName"
                  placeholder="Example: Main bounce house unit"
                />
              </Field>

              <Field label="Role">
                <Select name="componentRole" defaultValue="required">
                  <option value="required">Required</option>
                  <option value="main_unit">Main unit</option>
                  <option value="blower">Blower</option>
                  <option value="tarp">Tarp</option>
                  <option value="extension_cord">Extension cord</option>
                  <option value="generator">Generator</option>
                  <option value="balls">Balls</option>
                  <option value="decor">Decor</option>
                  <option value="safety">Safety</option>
                  <option value="other">Other</option>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Qty">
                  <Input
                    name="quantityRequired"
                    type="number"
                    step="0.01"
                    defaultValue="1"
                  />
                </Field>

                <Field label="Sort">
                  <Input name="sortOrder" type="number" defaultValue="100" />
                </Field>
              </div>

              <Field label="Inventory behavior">
                <Select name="inventoryBehavior" defaultValue="reusable">
                  <option value="reusable">Reusable — reserve and return to stock after use</option>
                  <option value="consumable">Consumable — deduct from stock after use</option>
                </Select>
              </Field>

              <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                <input
                  type="checkbox"
                  name="isRequired"
                  defaultChecked
                  className="h-4 w-4"
                />
                Required for booking
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                <input
                  type="checkbox"
                  name="allowSubstitution"
                  className="h-4 w-4"
                />
                Allow substitution
              </label>

              <Field label="Notes">
                <Textarea
                  name="notes"
                  rows={3}
                  placeholder="Example: include with every setup"
                />
              </Field>

              <button
                type="submit"
                className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                Add component
              </button>
            </form>
          </section>

          <section className="rounded-[30px] border border-black/5 bg-[#23313f] p-6 text-white shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
            <h3 className="text-lg font-semibold">How this will be used</h3>

            <div className="mt-4 space-y-3 text-sm leading-6 text-white/65">
              <p>
                1. New Booking получит выбранный product.
              </p>
              <p>
                2. Система загрузит все active required components.
              </p>
              <p>
                3. Проверит свободность каждого компонента на дату и время.
              </p>
              <p>
                4. Если чего-то нет — товар нельзя будет забронировать.
              </p>
              <p>
                5. Если всё свободно — создаст booking и reservations.
              </p>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
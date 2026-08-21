import { createClient } from "@/lib/supabase/server";
import { createInventoryItemAction } from "./actions";
import ReceiveExistingItemForm from "./components/ReceiveExistingItemForm";
import ResetCreateItemForm from "./components/ResetCreateItemForm";

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

function trackingLabel(value: string | null | undefined) {
  const type = String(value || "serialized");

  const labels: Record<string, string> = {
    serialized: "Serialized",
    quantity: "Quantity",
    consumable: "Consumable",
    kit: "Kit",
  };

  return labels[type] || type;
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
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
        {label}
      </span>

      {children}

      {hint && (
        <span className="mt-1 block text-[11px] leading-4 text-[#8b8177] sm:text-xs">
          {hint}
        </span>
      )}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
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
        "w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
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
        "w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
        props.className || "",
      ].join(" ")}
    />
  );
}

function ItemPhoto({ item }: { item: any }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#efe7dc] ring-1 ring-[#eee5d9] sm:h-16 sm:w-16 sm:rounded-2xl">
      {item?.image_url ? (
        <img
          src={item.image_url}
          alt={item.name || "Inventory item"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9a7a49]">
          No photo
        </div>
      )}
    </div>
  );
}

function categoryNameById(categories: any[], categoryId: string | null) {
  if (!categoryId) return "Uncategorized";

  const category = categories.find((item) => item.id === categoryId);

  return category?.name || "Uncategorized";
}

export default async function InventoryReceivePage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    category?: string;
    type?: string;
    createdItemId?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const q = String(resolvedSearchParams?.q || "").trim();
  const selectedCategory = String(resolvedSearchParams?.category || "all");
  const selectedType = String(resolvedSearchParams?.type || "all");
  const createdItemId = String(resolvedSearchParams?.createdItemId || "").trim();
  const hasCreateSuccess = createdItemId.length > 0;

  const supabase = await createClient();

  const [itemsResult, inventoryCategoriesResult, locationsResult] =
    await Promise.all([
      supabase
        .from("inventory_items")
        .select(
          `
          id,
          name,
          sku,
          category_id,
          tracking_type,
          unit_label,
          description,
          default_purchase_price,
          quantity_on_hand,
          quantity_available,
          minimum_stock,
          reorder_point,
          image_url,
          active,
          deleted_at
        `
        )
        .is("deleted_at", null)
        .neq("active", false)
        .order("name", { ascending: true }),

      supabase
        .from("inventory_categories")
        .select("id, name, active, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),

      supabase
        .from("warehouse_locations")
        .select("id, name, active, location_type, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message);
  }

  if (inventoryCategoriesResult.error) {
    throw new Error(inventoryCategoriesResult.error.message);
  }

  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }

  const activeItems = itemsResult.data || [];
  const inventoryCategories = inventoryCategoriesResult.data || [];
  const locations = locationsResult.data || [];

  const createdItem = createdItemId
    ? activeItems.find((item: any) => item.id === createdItemId) || null
    : null;

  const categoryButtons = inventoryCategories
    .map((category: any) => {
      const count = activeItems.filter(
        (item: any) => item.category_id === category.id
      ).length;

      return {
        ...category,
        count,
      };
    })
    .filter((category: any) => category.count > 0);

  const uncategorizedCount = activeItems.filter(
    (item: any) => !item.category_id
  ).length;

  const filteredItems = activeItems.filter((item: any) => {
    const cleanQ = q.toLowerCase();

    const matchesSearch = cleanQ
      ? [
          item.name,
          item.sku,
          item.description,
          item.tracking_type,
          trackingLabel(item.tracking_type),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(cleanQ)
      : true;

    const matchesCategory =
      selectedCategory === "all"
        ? true
        : selectedCategory === "uncategorized"
          ? !item.category_id
          : item.category_id === selectedCategory;

    const matchesType =
      selectedType === "all"
        ? true
        : String(item.tracking_type || "serialized") === selectedType;

    return matchesSearch && matchesCategory && matchesType;
  });

  const totalItems = activeItems.length;

  const totalAvailable = activeItems.reduce((sum: number, item: any) => {
    return sum + Number(item.quantity_available || 0);
  }, 0);

  const serializedCount = activeItems.filter(
    (item: any) => String(item.tracking_type || "serialized") === "serialized"
  ).length;

  const quantityCount = activeItems.filter((item: any) =>
    ["quantity", "consumable"].includes(String(item.tracking_type || ""))
  ).length;

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      {createdItem && (
        <section className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 shadow-[0_6px_20px_rgba(16,185,129,0.10)] sm:rounded-[24px] sm:px-5 sm:py-4 sm:shadow-[0_8px_24px_rgba(16,185,129,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              Item created successfully:{" "}
              <span className="font-semibold">{createdItem.name}</span>
            </div>

            <a
              href={`/admin/inventory/items/${createdItem.id}`}
              className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 sm:rounded-full sm:px-4 sm:font-semibold"
            >
              Open item
            </a>
          </div>
        </section>
      )}

      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Receive stock
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Receive / Create Inventory
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Быстрый прием товара на склад. Для полноценной истории поставок
              лучше использовать Supplies.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a
              href="/admin/inventory/supplies"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-center text-xs font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Supplies
            </a>

            <a
              href="/admin/inventory/supplies/new"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c9964f] px-3 text-center text-xs font-bold text-white shadow-[0_8px_22px_rgba(201,150,79,0.18)] transition hover:bg-[#b78744] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              New supply
            </a>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Items
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {totalItems}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Available
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {totalAvailable}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Serialized
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#355879] sm:mt-2 sm:text-3xl sm:font-semibold">
            {serializedCount}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Quantity
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#8a6b20] sm:mt-2 sm:text-3xl sm:font-semibold">
            {quantityCount}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="min-w-0 space-y-4 sm:space-y-6">
          <section
            className={[
              "min-w-0 overflow-hidden rounded-[20px] border bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]",
              createdItem
                ? "border-emerald-300 ring-2 ring-emerald-100"
                : "border-black/5",
            ].join(" ")}
          >
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Create new item
              </h3>

              <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
                Создать новую складскую позицию и добавить фото.
              </p>
            </div>

            <form
              id="create-item-form"
              action={createInventoryItemAction}
              className="space-y-3.5 sm:space-y-6"
              autoComplete="off"
            >
              <ResetCreateItemForm
                formId="create-item-form"
                resetKey={createdItemId}
              />

              <div className="grid gap-3 p-3.5 sm:gap-4 sm:p-6">
                <Field label="Name">
                  <Input
                    name="name"
                    placeholder="Example: Blower 1200"
                    required
                  />
                </Field>

                <Field label="SKU">
                  <Input name="sku" placeholder="INV-BLOWER-1200" />
                </Field>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2">
                  <Field label="Category">
                    <Select name="categoryId" defaultValue="">
                      <option value="">No category</option>

                      {inventoryCategories.map((category: any) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Tracking type">
                    <Select name="trackingType" defaultValue="serialized">
                      <option value="serialized">Serialized</option>
                      <option value="quantity">Quantity</option>
                      <option value="consumable">Consumable</option>
                      <option value="kit">Kit</option>
                    </Select>
                  </Field>
                </div>

                <Field label="Short description">
                  <Input
                    name="description"
                    placeholder="Short description for warehouse..."
                  />
                </Field>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2">
                  <Field label="Unit label">
                    <Input name="unitLabel" defaultValue="unit" />
                  </Field>

                  <Field label="Default purchase price">
                    <Input
                      name="defaultPurchasePrice"
                      type="number"
                      step="0.01"
                      defaultValue="0"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2">
                  <Field label="Minimum stock">
                    <Input
                      name="minimumStock"
                      type="number"
                      defaultValue="0"
                    />
                  </Field>

                  <Field label="Reorder point">
                    <Input
                      name="reorderPoint"
                      type="number"
                      defaultValue="0"
                    />
                  </Field>
                </div>

                <Field label="Photo">
                  <Input type="file" name="photo" accept="image/*" />
                </Field>
              </div>

              <div className="border-t border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#c9964f] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_22px_rgba(201,150,79,0.20)] transition hover:bg-[#b78744] sm:rounded-full sm:px-5 sm:font-semibold"
                >
                  Create item
                </button>
              </div>
            </form>
          </section>
        </section>

        <section className="min-w-0 space-y-4 sm:space-y-6">
          <ReceiveExistingItemForm
            inventoryItems={activeItems}
            inventoryCategories={inventoryCategories}
            locations={locations}
          />

          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
                <div>
                  <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                    Existing stock
                  </h3>

                  <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
                    Активные товары, разбитые по категориям.
                  </p>
                </div>

                <a
                  href="/admin/inventory"
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-xs font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                >
                  Full inventory
                </a>
              </div>

              <form className="mt-3 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3 xl:grid-cols-[1fr_180px_180px_120px]">
                <Input
                  name="q"
                  defaultValue={q}
                  placeholder="Search name, SKU, category..."
                  className="col-span-2 xl:col-span-1"
                />

                <Select
                  name="category"
                  defaultValue={selectedCategory}
                >
                  <option value="all">All categories</option>

                  {categoryButtons.map((category: any) => (
                    <option key={category.id} value={category.id}>
                      {category.name} · {category.count}
                    </option>
                  ))}

                  {uncategorizedCount > 0 && (
                    <option value="uncategorized">
                      Uncategorized · {uncategorizedCount}
                    </option>
                  )}
                </Select>

                <Select name="type" defaultValue={selectedType}>
                  <option value="all">All types</option>
                  <option value="serialized">Serialized</option>
                  <option value="quantity">Quantity</option>
                  <option value="consumable">Consumable</option>
                  <option value="kit">Kit</option>
                </Select>

                <button
                  type="submit"
                  className="col-span-2 rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold xl:col-span-1"
                >
                  Filter
                </button>
              </form>
            </div>

            <div className="divide-y divide-[#eee5d9]">
              {filteredItems.map((item: any) => {
                const categoryName = categoryNameById(
                  inventoryCategories,
                  item.category_id
                );

                return (
                  <div
                    key={item.id}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3.5 py-3 transition hover:bg-[#fcfaf7] sm:gap-4 sm:px-6 sm:py-4 xl:grid-cols-[1fr_120px_120px_110px]"
                  >
                    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                      <ItemPhoto item={item} />

                      <div className="min-w-0">
                        <a
                          href={`/admin/inventory/items/${item.id}`}
                          className="block truncate text-[15px] font-bold leading-5 text-[#1f1e1b] hover:text-[#9a723e] sm:text-base sm:font-semibold"
                        >
                          {item.name}
                        </a>

                        <div className="mt-0.5 truncate text-[11px] text-[#6c6258] sm:mt-1 sm:text-xs">
                          {item.sku || "No SKU"} ·{" "}
                          {trackingLabel(item.tracking_type)}
                        </div>

                        <div className="truncate text-[11px] text-[#8b8177] sm:mt-1 sm:text-xs">
                          {categoryName}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end xl:justify-start">
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.10em] text-[#9a7a49] sm:text-xs sm:font-normal sm:tracking-[0.12em]">
                          Available
                        </div>

                        <div className="mt-0.5 text-base font-bold text-emerald-700 sm:mt-1 sm:text-lg sm:font-semibold">
                          {numberValue(item.quantity_available, "0")}
                        </div>
                      </div>
                    </div>

                    <div className="hidden items-center xl:flex">
                      <div>
                        <div className="text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                          Cost
                        </div>

                        <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                          {money(item.default_purchase_price)}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2 flex items-center justify-end xl:col-span-1">
                      <a
                        href={`/admin/inventory/items/${item.id}`}
                        className="rounded-xl bg-[#23313f] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-4 sm:text-xs sm:font-semibold"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                );
              })}

              {filteredItems.length === 0 && (
                <div className="px-6 py-16 text-center">
                  <div className="text-lg font-semibold text-[#1f1e1b]">
                    No inventory items found
                  </div>

                  <p className="mt-2 text-sm text-[#6c6258]">
                    Try another category or search query.
                  </p>
                </div>
              )}
            </div>
          </section>
        </section>
      </section>
    </div>
  );
}

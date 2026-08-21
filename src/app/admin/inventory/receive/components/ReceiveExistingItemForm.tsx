"use client";

import { useMemo, useState } from "react";
import { receiveInventoryStockAction } from "../actions";

type InventoryItem = {
  id: string;
  name: string;
  sku?: string | null;
  category_id?: string | null;
  tracking_type?: string | null;
  unit_label?: string | null;
  default_purchase_price?: number | string | null;
  quantity_available?: number | string | null;
  image_url?: string | null;
};

type InventoryCategory = {
  id: string;
  name: string;
  sort_order?: number | null;
};

type WarehouseLocation = {
  id: string;
  name: string;
  location_type?: string | null;
};

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
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
        <span className="mt-1 block max-w-full break-words text-[11px] leading-4 text-[#8b8177] sm:text-xs">
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
        "w-full min-w-0 resize-y rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
        props.className || "",
      ].join(" ")}
    />
  );
}

function ItemPhoto({ item }: { item: InventoryItem }) {
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#efe7dc] ring-1 ring-[#eee5d9] sm:h-14 sm:w-14 sm:rounded-2xl">
      {item.image_url ? (
        <img
          src={item.image_url}
          alt={item.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9a7a49] sm:text-[9px]">
          No photo
        </div>
      )}
    </div>
  );
}

function categoryName(
  categories: InventoryCategory[],
  categoryId?: string | null
) {
  if (!categoryId) return "No category";

  const category = categories.find((item) => item.id === categoryId);

  return category?.name || "No category";
}

export default function ReceiveExistingItemForm({
  inventoryItems,
  inventoryCategories,
  locations,
}: {
  inventoryItems: InventoryItem[];
  inventoryCategories: InventoryCategory[];
  locations: WarehouseLocation[];
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [pickerExpanded, setPickerExpanded] = useState(true);

  const selectedItem = useMemo(() => {
    return inventoryItems.find((item) => item.id === selectedItemId) || null;
  }, [inventoryItems, selectedItemId]);

  const categoryButtons = useMemo(() => {
    return inventoryCategories
      .map((category) => {
        const count = inventoryItems.filter(
          (item) => item.category_id === category.id
        ).length;

        return {
          ...category,
          count,
        };
      })
      .filter((category) => category.count > 0);
  }, [inventoryCategories, inventoryItems]);

  const uncategorizedCount = useMemo(() => {
    return inventoryItems.filter((item) => !item.category_id).length;
  }, [inventoryItems]);

  const filteredItems = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    return inventoryItems.filter((item) => {
      const matchesCategory =
        selectedCategory === "all"
          ? true
          : selectedCategory === "uncategorized"
            ? !item.category_id
            : item.category_id === selectedCategory;

      const matchesSearch = cleanSearch
        ? [
            item.name,
            item.sku,
            item.tracking_type,
            trackingLabel(item.tracking_type),
            categoryName(inventoryCategories, item.category_id),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(cleanSearch)
        : true;

      return matchesCategory && matchesSearch;
    });
  }, [inventoryItems, inventoryCategories, search, selectedCategory]);

  function chooseItem(itemId: string) {
    setSelectedItemId(itemId);
    setPickerExpanded(false);
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
      <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
        <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
          Receive existing item
        </h3>

        <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
          Принять уже созданный товар на склад. Фото здесь не загружаем, потому
          что оно уже хранится в карточке товара.
        </p>
      </div>

      <form action={receiveInventoryStockAction} className="space-y-3.5 sm:space-y-6">
        <input type="hidden" name="inventoryItemId" value={selectedItemId} />

        <div className="grid gap-3.5 p-3.5 sm:gap-5 sm:p-6">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
                Inventory item
              </div>

              {selectedItem && (
                <button
                  type="button"
                  onClick={() => setPickerExpanded((value) => !value)}
                  className="rounded-full border border-[#d8cec0] bg-white px-3 py-1.5 text-[10px] font-bold text-[#355879] transition hover:bg-[#faf8f5] sm:text-xs"
                >
                  {pickerExpanded ? "Hide list" : "Change item"}
                </button>
              )}
            </div>

            {selectedItem && !pickerExpanded ? (
              <div className="rounded-[18px] border border-[#cfe0ef] bg-[#f4f9fd] p-3 sm:rounded-[22px] sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ItemPhoto item={selectedItem} />

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#1f1e1b]">
                      {selectedItem.name}
                    </div>

                    <div className="mt-0.5 truncate text-[11px] text-[#6c6258] sm:text-xs">
                      {selectedItem.sku || "No SKU"} ·{" "}
                      {trackingLabel(selectedItem.tracking_type)}
                    </div>

                    <div className="truncate text-[11px] text-[#8b8177] sm:mt-0.5 sm:text-xs">
                      {categoryName(
                        inventoryCategories,
                        selectedItem.category_id
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49] sm:text-xs">
                      Available
                    </div>
                    <div className="mt-0.5 text-base font-bold text-emerald-700">
                      {selectedItem.quantity_available || 0}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-w-0 rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] p-2.5 sm:rounded-[26px] sm:p-4">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search item by name, SKU, category..."
                />

                <div className="mt-2.5 flex max-w-full gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("all")}
                    className={[
                      "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition sm:px-4 sm:py-2 sm:text-xs sm:font-semibold",
                      selectedCategory === "all"
                        ? "bg-[#23313f] text-white"
                        : "bg-white text-[#6c6258] ring-1 ring-[#eee5d9] hover:bg-[#f7f1e8]",
                    ].join(" ")}
                  >
                    All · {inventoryItems.length}
                  </button>

                  {categoryButtons.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategory(category.id)}
                      className={[
                        "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition sm:px-4 sm:py-2 sm:text-xs sm:font-semibold",
                        selectedCategory === category.id
                          ? "bg-[#23313f] text-white"
                          : "bg-white text-[#6c6258] ring-1 ring-[#eee5d9] hover:bg-[#f7f1e8]",
                      ].join(" ")}
                    >
                      {category.name} · {category.count}
                    </button>
                  ))}

                  {uncategorizedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory("uncategorized")}
                      className={[
                        "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition sm:px-4 sm:py-2 sm:text-xs sm:font-semibold",
                        selectedCategory === "uncategorized"
                          ? "bg-[#23313f] text-white"
                          : "bg-white text-[#6c6258] ring-1 ring-[#eee5d9] hover:bg-[#f7f1e8]",
                      ].join(" ")}
                    >
                      No category · {uncategorizedCount}
                    </button>
                  )}
                </div>

                <div className="mt-3 grid max-h-[260px] gap-2 overflow-y-auto pr-1 sm:max-h-[360px] sm:gap-3">
                  {filteredItems.map((item) => {
                    const active = selectedItemId === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => chooseItem(item.id)}
                        className={[
                          "flex min-w-0 items-center gap-3 rounded-[16px] border p-2.5 text-left transition sm:gap-4 sm:rounded-[22px] sm:p-3",
                          active
                            ? "border-[#23313f] bg-[#eaf2f9] ring-2 ring-[#cfe0ef]"
                            : "border-[#eee5d9] bg-white hover:bg-[#faf8f5]",
                        ].join(" ")}
                      >
                        <ItemPhoto item={item} />

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-[#1f1e1b] sm:font-semibold">
                            {item.name}
                          </div>

                          <div className="mt-0.5 truncate text-[11px] text-[#6c6258] sm:mt-1 sm:text-xs">
                            {item.sku || "No SKU"} ·{" "}
                            {trackingLabel(item.tracking_type)}
                          </div>

                          <div className="truncate text-[11px] text-[#8b8177] sm:mt-1 sm:text-xs">
                            {categoryName(
                              inventoryCategories,
                              item.category_id
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="text-[8px] font-bold uppercase tracking-[0.08em] text-[#9a7a49] sm:text-xs sm:font-normal sm:tracking-[0.12em]">
                            Available
                          </div>

                          <div className="mt-0.5 text-sm font-bold text-emerald-700 sm:mt-1 sm:font-semibold">
                            {item.quantity_available || 0}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {filteredItems.length === 0 && (
                    <div className="rounded-[16px] border border-dashed border-[#d8cec0] bg-white p-5 text-center sm:rounded-[22px] sm:p-8">
                      <div className="text-sm font-semibold text-[#1f1e1b]">
                        No items found
                      </div>

                      <p className="mt-1 text-xs text-[#6c6258]">
                        Try another category or search query.
                      </p>
                    </div>
                  )}
                </div>

                {!selectedItemId && (
                  <div className="mt-2.5 rounded-xl border border-[#f0d590] bg-[#fff8e8] px-3 py-2.5 text-[11px] font-bold leading-4 text-[#8a6b20] sm:mt-3 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-xs sm:font-semibold">
                    Choose an inventory item before receiving stock.
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedItem && (
            <div className="rounded-[18px] border border-[#dbe8d9] bg-[#f4fbf3] p-3 sm:rounded-[24px] sm:p-4">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <ItemPhoto item={selectedItem} />

                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-[#1f1e1b] sm:font-semibold">
                    Selected: {selectedItem.name}
                  </div>

                  <div className="mt-0.5 break-words text-[11px] leading-4 text-[#6c6258] sm:mt-1 sm:text-xs">
                    {selectedItem.sku || "No SKU"} ·{" "}
                    {trackingLabel(selectedItem.tracking_type)} · Default cost:{" "}
                    {money(selectedItem.default_purchase_price)}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2">
            <Field label="Quantity">
              <Input
                name="quantity"
                type="number"
                step="0.01"
                defaultValue="1"
              />
            </Field>

            <Field label="Purchase price / unit">
              <Input
                name="purchasePrice"
                type="number"
                step="0.01"
                defaultValue={selectedItem?.default_purchase_price || "0"}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2">
            <Field label="Location">
              <Select name="warehouseLocationId" defaultValue="">
                <option value="">No location</option>

                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                    {location.location_type
                      ? ` · ${location.location_type}`
                      : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Condition">
              <Input name="condition" defaultValue="good" />
            </Field>
          </div>

          <Field
            label="Serial prefix"
            hint="Нужно только для serialized items. Например: BLOWER, CASTLE, BALL-PIT."
          >
            <Input
              name="serialPrefix"
              placeholder="BALL-PIT, WHITE-CASTLE..."
            />
          </Field>

          <Field label="Notes">
            <Textarea
              name="notes"
              rows={3}
              placeholder="Vendor, invoice, shipment notes..."
            />
          </Field>
        </div>

        <div className="border-t border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <button
            type="submit"
            disabled={!selectedItemId}
            className={[
              "w-full rounded-xl px-4 py-3 text-sm font-bold transition sm:rounded-full sm:px-5 sm:font-semibold",
              selectedItemId
                ? "bg-[#23313f] text-white hover:bg-[#18222d]"
                : "cursor-not-allowed bg-[#d8cec0] text-white",
            ].join(" ")}
          >
            Receive stock
          </button>
        </div>
      </form>
    </section>
  );
}

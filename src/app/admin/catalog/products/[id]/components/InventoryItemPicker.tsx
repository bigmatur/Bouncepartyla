"use client";

import { useMemo, useState } from "react";

type InventoryItem = {
  id: string;
  name: string;
  sku?: string | null;
  category_id?: string | null;
  tracking_type?: string | null;
  default_purchase_price?: number | string | null;
};

type InventoryCategory = {
  id: string;
  name: string;
  sort_order?: number | null;
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

export default function InventoryItemPicker({
  name,
  required,
  defaultValue,
  inventoryItems,
  inventoryCategories,
  onSelectionChange,
}: {
  name: string;
  required?: boolean;
  defaultValue?: string;
  inventoryItems: InventoryItem[];
  inventoryCategories: InventoryCategory[];
  onSelectionChange?: (value: string) => void;
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState(defaultValue || "");

  function selectItem(value: string) {
    setSelectedItemId(value);
    onSelectionChange?.(value);
  }

  const selectedItem = useMemo(() => {
    return inventoryItems.find((item) => item.id === selectedItemId) || null;
  }, [inventoryItems, selectedItemId]);

  const categoriesWithItems = useMemo(() => {
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

  const filteredItems = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    return inventoryItems.filter((item) => {
      const matchesCategory =
        selectedCategoryId === "all"
          ? true
          : selectedCategoryId === "uncategorized"
            ? !item.category_id
            : item.category_id === selectedCategoryId;

      if (!matchesCategory) return false;

      if (!cleanSearch) return true;

      const haystack = [
        item.name,
        item.sku,
        item.tracking_type,
        trackingLabel(item.tracking_type),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(cleanSearch);
    });
  }, [inventoryItems, search, selectedCategoryId]);

  const uncategorizedCount = inventoryItems.filter(
    (item) => !item.category_id
  ).length;

  return (
    <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-4">
      <input
        type="hidden"
        name={name}
        value={selectedItemId}
        required={required}
      />

      <div className="space-y-4">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by item name, SKU, tracking type..."
          className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategoryId("all")}
            className={[
              "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition",
              selectedCategoryId === "all"
                ? "bg-[#23313f] text-white"
                : "bg-white text-[#6c6258] ring-1 ring-[#eee5d9] hover:bg-[#f7f1e8]",
            ].join(" ")}
          >
            All · {inventoryItems.length}
          </button>

          {categoriesWithItems.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategoryId(category.id)}
              className={[
                "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition",
                selectedCategoryId === category.id
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
              onClick={() => setSelectedCategoryId("uncategorized")}
              className={[
                "shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition",
                selectedCategoryId === "uncategorized"
                  ? "bg-[#23313f] text-white"
                  : "bg-white text-[#6c6258] ring-1 ring-[#eee5d9] hover:bg-[#f7f1e8]",
              ].join(" ")}
            >
              Other · {uncategorizedCount}
            </button>
          )}
        </div>

        {selectedItem && (
          <div className="rounded-2xl bg-[#eaf2f9] p-4 text-sm ring-1 ring-[#cfe0ef]">
            <div className="font-semibold text-[#1f1e1b]">
              Selected: {selectedItem.name}
            </div>

            <div className="mt-1 text-xs text-[#355879]">
              {selectedItem.sku || "No SKU"} ·{" "}
              {trackingLabel(selectedItem.tracking_type)} ·{" "}
              {money(selectedItem.default_purchase_price)}
            </div>

            <button
              type="button"
              onClick={() => selectItem("")}
              className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef] hover:bg-[#f8fbff]"
            >
              Clear selection
            </button>
          </div>
        )}

        <div className="max-h-[360px] overflow-y-auto rounded-[20px] border border-[#eee5d9] bg-white p-2">
          <div className="grid gap-2">
            {filteredItems.map((item) => {
              const isSelected = item.id === selectedItemId;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectItem(item.id)}
                  className={[
                    "rounded-[18px] border p-4 text-left transition",
                    isSelected
                      ? "border-[#23313f] bg-[#23313f] text-white"
                      : "border-[#eee5d9] bg-white text-[#1f1e1b] hover:bg-[#fcfaf7]",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{item.name}</div>

                      <div
                        className={[
                          "mt-1 text-xs",
                          isSelected ? "text-white/70" : "text-[#6c6258]",
                        ].join(" ")}
                      >
                        {item.sku || "No SKU"} ·{" "}
                        {trackingLabel(item.tracking_type)}
                      </div>
                    </div>

                    <div
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        isSelected
                          ? "bg-white/15 text-white"
                          : "bg-[#f7f1e8] text-[#8a6b20]",
                      ].join(" ")}
                    >
                      {money(item.default_purchase_price)}
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredItems.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-[#6c6258]">
                No inventory items found.
              </div>
            )}
          </div>
        </div>

        {required && !selectedItemId && (
          <div className="rounded-2xl bg-[#fff8eb] p-3 text-xs leading-5 text-[#8a6b20] ring-1 ring-[#efd582]">
            Choose an inventory item before saving.
          </div>
        )}
      </div>
    </div>
  );
}
"use client";

import { useMemo, useState } from "react";
import InventoryItemPicker from "./InventoryItemPicker";
import {
  addProductInventoryComponentAction,
  deleteProductInventoryComponentAction,
  updateProductInventoryComponentAction,
} from "../actions";

type InventoryItem = {
  id: string;
  name: string;
  sku?: string | null;
  category_id?: string | null;
  tracking_type?: string | null;
  default_purchase_price?: number | string | null;
  image_url?: string | null;
};

type InventoryCategory = {
  id: string;
  name: string;
  sort_order?: number | null;
};

type ProductComponent = {
  id: string;
  product_id: string;
  inventory_item_id: string;
  quantity: number | string;
  required: boolean;
  sort_order?: number | null;
  notes?: string | null;
  inventory_items?: InventoryItem | InventoryItem[] | null;
};

function getRelationOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
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

function ComponentPhoto({ item }: { item: InventoryItem | null }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[#efe7dc] ring-1 ring-[#eee5d9]">
      {item?.image_url ? (
        <img
          src={item.image_url}
          alt={item.name}
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

export default function ProductComponentsManager({
  productId,
  components,
  inventoryItems,
  inventoryCategories,
}: {
  productId: string;
  components: ProductComponent[];
  inventoryItems: InventoryItem[];
  inventoryCategories: InventoryCategory[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addSelectedItemId, setAddSelectedItemId] = useState("");
  const [editingComponentId, setEditingComponentId] = useState<string | null>(
    null
  );

  const editingComponent = useMemo(() => {
    return (
      components.find((component) => component.id === editingComponentId) || null
    );
  }, [components, editingComponentId]);

  const editingItem = editingComponent
    ? getRelationOne(editingComponent.inventory_items)
    : null;

  return (
    <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eee5d9] px-6 py-5">
        <div>
          <h3 className="text-xl font-semibold text-[#1f1e1b]">
            Inventory components
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Комплектующие товара, которые берутся со склада и резервируются
            вместе с этим product.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setAddSelectedItemId("");
            setAddOpen(true);
          }}
          className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
        >
          Add component
        </button>
      </div>

      <div className="divide-y divide-[#eee5d9]">
        {components.map((component) => {
          const item = getRelationOne(component.inventory_items);

          return (
            <div
              key={component.id}
              className="grid gap-4 px-6 py-4 transition hover:bg-[#fcfaf7] md:grid-cols-[1fr_90px_110px_130px]"
            >
              <div className="flex min-w-0 items-center gap-4">
                <ComponentPhoto item={item} />

                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-[#1f1e1b]">
                    {item?.name || "Inventory item"}
                  </div>

                  <div className="mt-1 text-xs text-[#6c6258]">
                    {item?.sku || "No SKU"} ·{" "}
                    {trackingLabel(item?.tracking_type)}
                  </div>

                  {component.notes && (
                    <div className="mt-1 truncate text-xs text-[#8b8177]">
                      {component.notes}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center">
                <div>
                  <div className="text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                    Qty
                  </div>

                  <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                    {component.quantity}
                  </div>
                </div>
              </div>

              <div className="flex items-center">
                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    component.required !== false
                      ? "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]"
                      : "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]",
                  ].join(" ")}
                >
                  {component.required !== false ? "Required" : "Optional"}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingComponentId(component.id)}
                  className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
                >
                  Edit
                </button>

                <form action={deleteProductInventoryComponentAction}>
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="componentId" value={component.id} />

                  <button
                    type="submit"
                    className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          );
        })}

        {components.length === 0 && (
          <div className="px-6 py-12 text-center">
            <div className="text-lg font-semibold text-[#1f1e1b]">
              No inventory components yet
            </div>

            <p className="mt-2 text-sm text-[#6c6258]">
              Add blower, tarp, extension cord, sandbags or any warehouse items
              required for this product.
            </p>
          </div>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#eee5d9] px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-[#1f1e1b]">
                  Add component
                </h3>

                <p className="mt-1 text-sm text-[#6c6258]">
                  Выбери складскую позицию, укажи количество и сохрани.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-full bg-[#f4ede2] px-4 py-2 text-sm font-semibold text-[#6c6258] hover:bg-[#eadfce]"
              >
                Close
              </button>
            </div>

            <form action={addProductInventoryComponentAction} className="p-6">
              <input type="hidden" name="productId" value={productId} />

              <Field label="Inventory item">
                <InventoryItemPicker
                  name="inventoryItemId"
                  required
                  inventoryItems={inventoryItems}
                  inventoryCategories={inventoryCategories}
                  onSelectionChange={setAddSelectedItemId}
                />
              </Field>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Qty">
                  <Input
                    name="quantity"
                    type="number"
                    step="0.01"
                    defaultValue="1"
                  />
                </Field>

                <label className="flex items-end">
                  <span className="flex h-[46px] w-full items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 text-sm font-semibold text-[#1f1e1b]">
                    Required
                    <input
                      type="checkbox"
                      name="required"
                      defaultChecked
                      className="h-5 w-5"
                    />
                  </span>
                </label>
              </div>

              <div className="mt-4">
                <Field label="Notes">
                  <Input
                    name="notes"
                    placeholder="Example: included blower, tarp, sandbags..."
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={!addSelectedItemId}
                className="mt-6 w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
              >
                Add component
              </button>
            </form>
          </div>
        </div>
      )}

      {editingComponent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-[30px] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#eee5d9] px-6 py-5">
              <div className="flex items-center gap-4">
                <ComponentPhoto item={editingItem} />

                <div>
                  <h3 className="text-xl font-semibold text-[#1f1e1b]">
                    Edit component
                  </h3>

                  <p className="mt-1 text-sm text-[#6c6258]">
                    {editingItem?.name || "Inventory item"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingComponentId(null)}
                className="rounded-full bg-[#f4ede2] px-4 py-2 text-sm font-semibold text-[#6c6258] hover:bg-[#eadfce]"
              >
                Close
              </button>
            </div>

            <form action={updateProductInventoryComponentAction} className="p-6">
              <input type="hidden" name="productId" value={productId} />

              <input
                type="hidden"
                name="componentId"
                value={editingComponent.id}
              />

              <input
                type="hidden"
                name="inventoryItemId"
                value={editingComponent.inventory_item_id}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Qty">
                  <Input
                    name="quantity"
                    type="number"
                    step="0.01"
                    defaultValue={String(editingComponent.quantity || 1)}
                  />
                </Field>

                <label className="flex items-end">
                  <span className="flex h-[46px] w-full items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 text-sm font-semibold text-[#1f1e1b]">
                    Required
                    <input
                      type="checkbox"
                      name="required"
                      defaultChecked={editingComponent.required !== false}
                      className="h-5 w-5"
                    />
                  </span>
                </label>
              </div>

              <div className="mt-4">
                <Field label="Notes">
                  <Input
                    name="notes"
                    defaultValue={editingComponent.notes || ""}
                    placeholder="Component notes..."
                  />
                </Field>
              </div>

              <button
                type="submit"
                className="mt-6 w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                Save component
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
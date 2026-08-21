import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addInventorySupplyLineAction,
  deleteInventorySupplyLineAction,
  receiveInventorySupplyAction,
  reverseInventorySupplyAction,
  updateInventorySupplyHeaderAction,
  updateInventorySupplyLineAction,
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

function getRelationOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function dateTimeLocal(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function statusClass(status: string | null | undefined) {
  const value = String(status || "draft");

  if (value === "draft") {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (value === "received") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (value === "reversed") {
    return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
  }

  if (value === "cancelled") {
    return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function labelStatus(status: string | null | undefined) {
  const value = String(status || "draft");

  const labels: Record<string, string> = {
    draft: "Draft",
    received: "Received",
    reversed: "Reversed",
    cancelled: "Cancelled",
  };

  return labels[value] || value;
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
        "w-full min-w-0 resize-y rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
        props.className || "",
      ].join(" ")}
    />
  );
}

function ItemPhoto({
  item,
  size = "md",
}: {
  item: any;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "sm"
      ? "h-10 w-10 sm:h-12 sm:w-12"
      : size === "lg"
        ? "h-20 w-20 sm:h-24 sm:w-24"
        : "h-14 w-14 sm:h-20 sm:w-20";

  return (
    <div
      className={`${sizeClass} shrink-0 overflow-hidden rounded-xl bg-[#efe7dc] ring-1 ring-[#eee5d9] sm:rounded-2xl`}
    >
      {item?.image_url ? (
        <img
          src={item.image_url}
          alt={item?.name || "Inventory item"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[8px] font-bold uppercase tracking-[0.08em] text-[#9a7a49] sm:px-2 sm:text-[10px] sm:font-semibold">
          No photo
        </div>
      )}
    </div>
  );
}

export default async function InventorySupplyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [supplyResult, linesResult, inventoryItemsResult, locationsResult] =
    await Promise.all([
      supabase
        .from("inventory_supplies")
        .select(
          `
          *,
          warehouse_locations (
            id,
            name
          )
        `
        )
        .eq("id", id)
        .maybeSingle(),

      supabase
        .from("inventory_supply_lines")
        .select(
          `
          *,
          inventory_items (
            id,
            name,
            sku,
            tracking_type,
            image_url
          )
        `
        )
        .eq("supply_id", id)
        .order("created_at", { ascending: true }),

      supabase
        .from("inventory_items")
        .select("id, name, sku, tracking_type, image_url, active, deleted_at")
        .is("deleted_at", null)
        .neq("active", false)
        .order("name", { ascending: true }),

      supabase
        .from("warehouse_locations")
        .select("id, name, active, location_type, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

  if (supplyResult.error) {
    throw new Error(supplyResult.error.message);
  }

  if (!supplyResult.data) {
    notFound();
  }

  if (linesResult.error) {
    throw new Error(linesResult.error.message);
  }

  if (inventoryItemsResult.error) {
    throw new Error(inventoryItemsResult.error.message);
  }

  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }

  const supply = supplyResult.data;
  const lines = linesResult.data || [];
  const inventoryItems = inventoryItemsResult.data || [];
  const locations = locationsResult.data || [];

  const location = getRelationOne(supply.warehouse_locations);
  const isDraft = supply.status === "draft";
  const isReceived = supply.status === "received";

  const totalQty = lines.reduce(
    (sum: number, line: any) => sum + Number(line.quantity || 0),
    0
  );

  const totalCost = lines.reduce(
    (sum: number, line: any) => sum + Number(line.total_cost || 0),
    0
  );

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <a
              href="/admin/inventory/supplies"
              className="text-xs font-bold text-[#9a723e] hover:text-[#7f633a] sm:text-sm sm:font-semibold"
            >
              ← Supplies
            </a>

            <div className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a723e] sm:mt-4 sm:text-xs sm:font-semibold">
              Supply document
            </div>

            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <h2 className="min-w-0 truncate text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
                {supply.supply_number || "Supply"}
              </h2>

              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                  supply.status
                )}`}
              >
                {labelStatus(supply.status)}
              </span>
            </div>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Поставка: черновик можно редактировать, после приема она влияет на
              склад. Ошибки после приема исправляются через Reverse receipt.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a
              href="/admin/inventory/supplies"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-center text-xs font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              All supplies
            </a>

            {isDraft && (
              <form action={receiveInventorySupplyAction}>
                <input type="hidden" name="supplyId" value={supply.id} />

                <button
                  type="submit"
                  className="min-h-11 w-full rounded-xl bg-[#c9964f] px-3 text-xs font-bold text-white shadow-[0_8px_22px_rgba(201,150,79,0.18)] transition hover:bg-[#b78744] sm:w-auto sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                >
                  Receive stock
                </button>
              </form>
            )}

            {isReceived && (
              <form action={reverseInventorySupplyAction}>
                <input type="hidden" name="supplyId" value={supply.id} />

                <button
                  type="submit"
                  className="min-h-11 w-full rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 transition hover:bg-red-100 sm:w-auto sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                >
                  Reverse receipt
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Lines
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {lines.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Qty
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {totalQty}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Total
          </div>
          <div className="mt-1.5 break-words text-xl font-bold leading-tight text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {money(totalCost)}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Warehouse
          </div>
          <div className="mt-1.5 break-words text-sm font-bold leading-5 text-[#1f1e1b] sm:mt-2 sm:text-lg sm:font-semibold">
            {location?.name || "No location"}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
              Supply header
            </h3>

            <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
              Общие данные поставки.
            </p>
          </div>

          <form
            action={updateInventorySupplyHeaderAction}
            className="space-y-3.5 sm:space-y-6"
          >
            <input type="hidden" name="supplyId" value={supply.id} />

            <div className="grid gap-3.5 p-3.5 sm:gap-5 sm:p-6">
              <Field label="Supply date">
                <Input
                  type="datetime-local"
                  name="supplyDate"
                  defaultValue={dateTimeLocal(supply.supply_date)}
                  disabled={!isDraft}
                />
              </Field>

              <Field label="Warehouse">
                <Select
                  name="warehouseLocationId"
                  defaultValue={supply.warehouse_location_id || ""}
                  disabled={!isDraft}
                >
                  <option value="">No warehouse</option>

                  {locations.map((locationItem: any) => (
                    <option key={locationItem.id} value={locationItem.id}>
                      {locationItem.name}
                      {locationItem.location_type
                        ? ` · ${locationItem.location_type}`
                        : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Supplier">
                <Input
                  name="supplierName"
                  defaultValue={textValue(supply.supplier_name)}
                  placeholder="Vendor / factory / Amazon / Alibaba..."
                  disabled={!isDraft}
                />
              </Field>

              <Field label="Currency">
                <Select
                  name="currency"
                  defaultValue={supply.currency || "USD"}
                  disabled={!isDraft}
                >
                  <option value="USD">USD — $</option>
                  <option value="EUR">EUR — €</option>
                  <option value="CNY">CNY — ¥</option>
                  <option value="RUB">RUB — ₽</option>
                </Select>
              </Field>

              <Field label="Employee">
                <Input
                  name="receivedBy"
                  defaultValue={textValue(supply.received_by)}
                  placeholder="Ilias"
                  disabled={!isDraft}
                />
              </Field>

              <Field label="Notes">
                <Textarea
                  name="notes"
                  rows={3}
                  defaultValue={textValue(supply.notes)}
                  placeholder="Invoice number, shipment notes..."
                  disabled={!isDraft}
                />
              </Field>
            </div>

            {isDraft && (
              <div className="border-t border-[#eee5d9] px-3.5 py-3 sm:flex sm:justify-end sm:px-6 sm:py-5">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#c9964f] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_22px_rgba(201,150,79,0.20)] transition hover:bg-[#b78744] sm:w-auto sm:rounded-full sm:px-8 sm:py-4 sm:font-semibold"
                >
                  Save header
                </button>
              </div>
            )}
          </form>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
              Supply lines
            </h3>

            <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
              Товары, количество, закупочная цена и сумма поставки.
            </p>
          </div>

          {isDraft && (
            <form
              action={addInventorySupplyLineAction}
              className="grid grid-cols-2 gap-2.5 border-b border-[#eee5d9] p-3.5 sm:gap-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_100px_120px_120px]"
            >
              <input type="hidden" name="supplyId" value={supply.id} />

              <div className="col-span-2 xl:col-span-1">
                <Field label="Inventory item">
                  <Select name="inventoryItemId" required defaultValue="">
                    <option value="">Choose item</option>

                    {inventoryItems.map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.sku ? ` · ${item.sku}` : ""}
                        {item.tracking_type
                          ? ` · ${item.tracking_type}`
                          : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Qty">
                <Input
                  name="quantity"
                  type="number"
                  step="0.01"
                  defaultValue="1"
                />
              </Field>

              <Field label="Unit cost">
                <Input
                  name="unitCost"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />
              </Field>

              <div className="col-span-2 xl:col-span-1">
                <Field label="Condition">
                  <Input name="condition" defaultValue="good" />
                </Field>
              </div>

              <div className="col-span-2 xl:col-span-4">
                <Field label="Notes">
                  <Input name="notes" placeholder="Line notes..." />
                </Field>
              </div>

              <div className="col-span-2 xl:col-span-4">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#23313f] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:font-semibold"
                >
                  Add line
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-[#eee5d9]">
            {lines.map((line: any) => {
              const item = getRelationOne(line.inventory_items);

              return (
                <div key={line.id} className="p-3.5 sm:p-6">
                  {isDraft ? (
                    <form
                      action={updateInventorySupplyLineAction}
                      className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_100px_120px_120px_120px]"
                    >
                      <input
                        type="hidden"
                        name="supplyId"
                        value={supply.id}
                      />
                      <input type="hidden" name="lineId" value={line.id} />

                      <div className="col-span-2 xl:col-span-5">
                        <div className="flex min-w-0 items-start gap-3 rounded-[16px] bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9] sm:gap-4 sm:rounded-[24px] sm:p-4">
                          <ItemPhoto item={item} size="md" />

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-[#1f1e1b] sm:text-lg sm:font-semibold">
                              {item?.name || "Inventory item"}
                            </div>

                            <div className="mt-0.5 truncate text-[11px] text-[#6c6258] sm:mt-1 sm:text-sm">
                              {item?.sku || "No SKU"} ·{" "}
                              {item?.tracking_type || "tracking"}
                            </div>
                          </div>

                          <div className="shrink-0 rounded-xl bg-white px-2.5 py-2 text-right ring-1 ring-[#eee5d9] xl:hidden">
                            <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                              Total
                            </div>
                            <div className="mt-0.5 text-xs font-bold text-[#1f1e1b]">
                              {money(line.total_cost)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-2 xl:col-span-1">
                        <Field label="Item">
                          <Select
                            name="inventoryItemId"
                            defaultValue={line.inventory_item_id}
                          >
                            {inventoryItems.map((inventoryItem: any) => (
                              <option
                                key={inventoryItem.id}
                                value={inventoryItem.id}
                              >
                                {inventoryItem.name}
                                {inventoryItem.sku
                                  ? ` · ${inventoryItem.sku}`
                                  : ""}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>

                      <Field label="Qty">
                        <Input
                          name="quantity"
                          type="number"
                          step="0.01"
                          defaultValue={numberValue(line.quantity, "1")}
                        />
                      </Field>

                      <Field label="Unit cost">
                        <Input
                          name="unitCost"
                          type="number"
                          step="0.01"
                          defaultValue={numberValue(line.unit_cost, "0")}
                        />
                      </Field>

                      <div className="col-span-2 xl:col-span-1">
                        <Field label="Condition">
                          <Input
                            name="condition"
                            defaultValue={textValue(line.condition) || "good"}
                          />
                        </Field>
                      </div>

                      <div className="hidden xl:block">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                          Total
                        </div>

                        <div className="mt-2 rounded-2xl bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b] ring-1 ring-[#eee5d9]">
                          {money(line.total_cost)}
                        </div>
                      </div>

                      <div className="col-span-2 xl:col-span-5">
                        <Field label="Notes">
                          <Input
                            name="notes"
                            defaultValue={textValue(line.notes)}
                            placeholder="Line notes..."
                          />
                        </Field>
                      </div>

                      <div className="col-span-2 flex gap-2 xl:col-span-5">
                        <button
                          type="submit"
                          className="flex-1 rounded-xl bg-[#c9964f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold"
                        >
                          Save line
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_120px_120px_120px]">
                      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                        <ItemPhoto item={item} size="md" />

                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-[#1f1e1b] sm:text-lg sm:font-semibold">
                            {item?.name || "Inventory item"}
                          </div>

                          <div className="mt-0.5 truncate text-[11px] text-[#6c6258] sm:mt-1 sm:text-sm">
                            {item?.sku || "No SKU"} ·{" "}
                            {item?.tracking_type || "tracking"}
                          </div>

                          {line.notes && (
                            <div className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-[#6c6258] sm:mt-2 sm:text-sm sm:leading-5">
                              {line.notes}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 xl:contents">
                        <div className="rounded-xl bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] xl:rounded-none xl:bg-transparent xl:p-0 xl:ring-0">
                          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-normal sm:tracking-[0.14em]">
                            Qty
                          </div>
                          <div className="mt-0.5 text-sm font-bold text-[#1f1e1b] sm:mt-1 sm:text-lg sm:font-semibold">
                            {line.quantity}
                          </div>
                        </div>

                        <div className="rounded-xl bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] xl:rounded-none xl:bg-transparent xl:p-0 xl:ring-0">
                          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-normal sm:tracking-[0.14em]">
                            Unit cost
                          </div>
                          <div className="mt-0.5 break-words text-sm font-bold text-[#1f1e1b] sm:mt-1 sm:text-lg sm:font-semibold">
                            {money(line.unit_cost)}
                          </div>
                        </div>

                        <div className="rounded-xl bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] xl:rounded-none xl:bg-transparent xl:p-0 xl:ring-0">
                          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-normal sm:tracking-[0.14em]">
                            Total
                          </div>
                          <div className="mt-0.5 break-words text-sm font-bold text-[#1f1e1b] sm:mt-1 sm:text-lg sm:font-semibold">
                            {money(line.total_cost)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {isDraft && (
                    <form
                      action={deleteInventorySupplyLineAction}
                      className="mt-2.5 sm:mt-3"
                    >
                      <input
                        type="hidden"
                        name="supplyId"
                        value={supply.id}
                      />
                      <input type="hidden" name="lineId" value={line.id} />

                      <button
                        type="submit"
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[11px] font-bold text-red-700 transition hover:bg-red-100 sm:rounded-full sm:px-5 sm:text-xs sm:font-semibold"
                      >
                        Delete line
                      </button>
                    </form>
                  )}
                </div>
              );
            })}

            {lines.length === 0 && (
              <div className="px-6 py-14 text-center sm:py-16">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No supply lines yet
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Add inventory items before receiving this supply.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import {
  archiveInventoryItemAction,
  archiveInventoryUnitAction,
  deleteInventoryItemAction,
  deleteInventoryUnitAction,
  removeInventoryItemPhotoAction,
  restoreInventoryItemAction,
  restoreInventoryUnitAction,
  updateInventoryItemAction,
  updateInventoryUnitAction,
  uploadInventoryItemPhotoAction,
  uploadInventoryUnitPhotoAction,
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

function statusClass(status: string | null | undefined) {
  const value = String(status || "");

  if (["available", "returned"].includes(value)) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (["reserved", "picked", "loaded", "installed"].includes(value)) {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (["cleaning", "maintenance"].includes(value)) {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  if (["lost", "damaged", "retired"].includes(value)) {
    return "bg-red-50 text-red-700 ring-1 ring-red-100";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
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

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs sm:text-sm">
      <div className="text-[#6c6258]">{label}</div>
      <div className="text-right font-bold text-[#1f1e1b] sm:font-semibold">
        {value}
      </div>
    </div>
  );
}

export default async function InventoryItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    itemResult,
    categoriesResult,
    locationsResult,
    unitsResult,
    archivedUnitsResult,
    reservationsCountResult,
    movementsCountResult,
  ] = await Promise.all([
    supabase
      .from("inventory_items")
      .select(
        `
        *,
        inventory_categories (
          id,
          name
        )
      `
      )
      .eq("id", id)
      .single(),

    supabase
      .from("inventory_categories")
      .select("id, name, active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("warehouse_locations")
      .select("id, name, active, location_type")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("inventory_units")
      .select(
        `
        *,
        warehouse_locations (
          id,
          name
        )
      `
      )
      .eq("inventory_item_id", id)
      .is("deleted_at", null)
      .order("serial_number", { ascending: true })
      .order("created_at", { ascending: true }),

    supabase
      .from("inventory_units")
      .select(
        `
        *,
        warehouse_locations (
          id,
          name
        )
      `
      )
      .eq("inventory_item_id", id)
      .not("deleted_at", "is", null)
      .order("updated_at", { ascending: false }),

    supabase
      .from("inventory_reservations")
      .select("id", { count: "exact", head: true })
      .eq("inventory_item_id", id),

    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("inventory_item_id", id),
  ]);

  if (itemResult.error) throw new Error(itemResult.error.message);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);
  if (unitsResult.error) throw new Error(unitsResult.error.message);
  if (archivedUnitsResult.error) throw new Error(archivedUnitsResult.error.message);
  if (reservationsCountResult.error) throw new Error(reservationsCountResult.error.message);
  if (movementsCountResult.error) throw new Error(movementsCountResult.error.message);

  const item = itemResult.data;
  const itemCategory = getRelationOne(item.inventory_categories);
  const categories = (categoriesResult.data || []).filter(
    (category: any) => category.active !== false
  );
  const locations = (locationsResult.data || []).filter(
    (location: any) => location.active !== false
  );
  const units = unitsResult.data || [];
  const archivedUnits = archivedUnitsResult.data || [];

  const availableUnits = units.filter((unit: any) =>
    ["available", "returned"].includes(String(unit.status || ""))
  );

  const outUnits = units.filter((unit: any) =>
    ["reserved", "picked", "loaded", "installed"].includes(
      String(unit.status || "")
    )
  );

  const notReadyUnits = units.filter((unit: any) =>
    ["cleaning", "maintenance", "damaged"].includes(String(unit.status || ""))
  );

  const reservationsCount = reservationsCountResult.count || 0;
  const movementsCount = movementsCountResult.count || 0;
  const canDelete =
    units.length === 0 &&
    archivedUnits.length === 0 &&
    reservationsCount === 0 &&
    movementsCount === 0;

  const isArchived = item.active === false || Boolean(item.deleted_at);
  const isQuantityType = ["quantity", "consumable"].includes(
    String(item.tracking_type || "")
  );

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 p-4 sm:p-6">
            <a
              href="/admin/inventory"
              className="text-xs font-bold text-[#9a723e] hover:text-[#7f633a] sm:text-sm sm:font-semibold"
            >
              ← Inventory
            </a>

            <div className="mt-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a723e] sm:mt-4 sm:text-xs sm:font-semibold">
              Warehouse item
            </div>

            <h2 className="mt-1 truncate text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              {item.name}
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              {item.description ||
                "Inventory item settings, photo, stock and physical units."}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:flex sm:flex-wrap">
              <a
                href="/admin/inventory/receive"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c9964f] px-2 text-center text-[11px] font-bold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
              >
                Receive stock
              </a>

              <a
                href="/admin/inventory/movements"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#23313f] px-2 text-center text-[11px] font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
              >
                Movements
              </a>

              <a
                href="/admin/inventory"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2 text-center text-[11px] font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
              >
                Back to list
              </a>
            </div>
          </div>

          <div className="border-t border-white/10 bg-[#23313f] p-4 text-white sm:p-6 xl:border-l xl:border-t-0">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-1">
              <div className="rounded-[16px] bg-white/10 p-3 sm:rounded-[24px] sm:p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/55 sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal">
                  Status
                </div>
                <div className="mt-1 text-lg font-bold sm:mt-2 sm:text-3xl sm:font-semibold">
                  {isArchived ? "Archived" : "Active"}
                </div>
              </div>

              <div className="rounded-[16px] bg-white/10 p-3 sm:rounded-[24px] sm:p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/55 sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal">
                  Tracking
                </div>
                <div className="mt-1 truncate text-sm font-bold sm:mt-2 sm:text-xl sm:font-semibold">
                  {trackingLabel(item.tracking_type)}
                </div>
              </div>

              <div className="rounded-[16px] bg-white/10 p-3 sm:rounded-[24px] sm:p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/55 sm:text-sm sm:font-normal sm:normal-case sm:tracking-normal">
                  Units
                </div>
                <div className="mt-1 text-lg font-bold sm:mt-2 sm:text-3xl sm:font-semibold">
                  {units.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4 sm:space-y-6">
          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="aspect-[16/10] bg-[#efe7dc] sm:aspect-square">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-semibold text-[#9a7a49]">
                  No item photo
                </div>
              )}
            </div>

            <div className="space-y-3 p-3.5 sm:space-y-4 sm:p-5">
              <div>
                <h3 className="text-base font-bold text-[#1f1e1b] sm:text-lg sm:font-semibold">
                  Item photo
                </h3>

                <p className="mt-1 hidden text-sm text-[#6c6258] sm:block">
                  Main image for warehouse and catalog linking.
                </p>
              </div>

              <form action={uploadInventoryItemPhotoAction} className="space-y-2.5 sm:space-y-3">
                <input type="hidden" name="itemId" value={item.id} />

                <Input type="file" name="photo" accept="image/*" required />

                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold"
                >
                  Upload photo
                </button>
              </form>

              {item.image_url && (
                <form action={removeInventoryItemPhotoAction}>
                  <input type="hidden" name="itemId" value={item.id} />

                  <button
                    type="submit"
                    className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100 sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold"
                  >
                    Remove photo
                  </button>
                </form>
              )}
            </div>
          </section>

          <section className="min-w-0 rounded-[20px] border border-black/5 bg-white p-3.5 shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-5 sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-base font-bold text-[#1f1e1b] sm:text-lg sm:font-semibold">
              Quick summary
            </h3>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:mt-5 sm:block sm:space-y-3">
              <SummaryRow label="Category" value={itemCategory?.name || "Other"} />
              <SummaryRow label="SKU" value={item.sku || "—"} />
              <SummaryRow label="Active units" value={units.length} />
              <SummaryRow label="Archived units" value={archivedUnits.length} />
              <SummaryRow label="Available" value={availableUnits.length} />
              <SummaryRow label="Out" value={outUnits.length} />
              <SummaryRow label="Not ready" value={notReadyUnits.length} />
              <SummaryRow
                label="Default cost"
                value={money(item.default_purchase_price)}
              />
            </div>
          </section>

          <section className="min-w-0 rounded-[20px] border border-red-100 bg-red-50 p-3.5 shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-5 sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-base font-bold text-red-800 sm:text-lg sm:font-semibold">
              Danger zone
            </h3>

            <p className="mt-2 hidden text-sm leading-6 text-red-700 sm:block">
              Delete is available only for empty items without units,
              reservations or movements. Otherwise use archive.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:block sm:space-y-3">
              {isArchived ? (
                <form action={restoreInventoryItemAction}>
                  <input type="hidden" name="itemId" value={item.id} />

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                  >
                    Restore item
                  </button>
                </form>
              ) : (
                <form action={archiveInventoryItemAction}>
                  <input type="hidden" name="itemId" value={item.id} />

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-[#23313f] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                  >
                    Archive item
                  </button>
                </form>
              )}

              <form action={deleteInventoryItemAction}>
                <input type="hidden" name="itemId" value={item.id} />

                <button
                  type="submit"
                  disabled={!canDelete}
                  className={[
                    "w-full rounded-xl px-3 py-2.5 text-xs font-bold transition sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold",
                    canDelete
                      ? "bg-red-700 text-white hover:bg-red-800"
                      : "cursor-not-allowed bg-white text-red-300 ring-1 ring-red-100",
                  ].join(" ")}
                >
                  Delete item
                </button>
              </form>

              {!canDelete && (
                <div className="col-span-2 rounded-xl bg-white p-3 text-[11px] leading-4 text-red-700 ring-1 ring-red-100 sm:rounded-2xl sm:p-4 sm:text-xs sm:leading-5">
                  Cannot delete: {units.length} active unit(s),{" "}
                  {archivedUnits.length} archived unit(s), {reservationsCount}{" "}
                  reservation(s), {movementsCount} movement(s). Archive instead.
                </div>
              )}
            </div>
          </section>
        </aside>

        <main className="min-w-0 space-y-4 sm:space-y-6">
          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Item settings
              </h3>

              <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
                Main warehouse position settings.
              </p>
            </div>

            <form action={updateInventoryItemAction} className="space-y-3.5 sm:space-y-6">
              <input type="hidden" name="itemId" value={item.id} />

              <div className="grid gap-3.5 p-3.5 sm:gap-5 sm:p-6">
                <div className="grid gap-3 sm:gap-4 md:grid-cols-[1fr_220px]">
                  <Field label="Name">
                    <Input
                      name="name"
                      defaultValue={textValue(item.name)}
                      required
                    />
                  </Field>

                  <Field label="SKU">
                    <Input name="sku" defaultValue={textValue(item.sku)} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-[1fr_220px_180px]">
                  <div className="col-span-2 md:col-span-1">
                    <Field label="Category">
                      <Select
                        name="categoryId"
                        defaultValue={item.category_id || ""}
                      >
                        <option value="">No category</option>
                        {categories.map((category: any) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field label="Tracking type">
                    <Select
                      name="trackingType"
                      defaultValue={item.tracking_type || "serialized"}
                    >
                      <option value="serialized">Serialized</option>
                      <option value="quantity">Quantity</option>
                      <option value="consumable">Consumable</option>
                      <option value="kit">Kit</option>
                    </Select>
                  </Field>

                  <Field label="Sort order">
                    <Input
                      name="sortOrder"
                      type="number"
                      defaultValue={numberValue(item.sort_order, "100")}
                    />
                  </Field>
                </div>

                <Field label="Short description">
                  <Input
                    name="description"
                    defaultValue={textValue(item.description)}
                    placeholder="Short description for this warehouse item..."
                  />
                </Field>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
                  <Field label="Unit label">
                    <Input
                      name="unitLabel"
                      defaultValue={textValue(item.unit_label || "unit")}
                    />
                  </Field>

                  <Field label="Default purchase price">
                    <Input
                      name="defaultPurchasePrice"
                      type="number"
                      step="0.01"
                      defaultValue={numberValue(
                        item.default_purchase_price,
                        "0"
                      )}
                    />
                  </Field>

                  <Field label="Minimum stock">
                    <Input
                      name="minimumStock"
                      type="number"
                      step="0.01"
                      defaultValue={numberValue(item.minimum_stock, "0")}
                    />
                  </Field>

                  <Field label="Reorder point">
                    <Input
                      name="reorderPoint"
                      type="number"
                      step="0.01"
                      defaultValue={numberValue(item.reorder_point, "0")}
                    />
                  </Field>
                </div>

                {isQuantityType && (
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                    <Field label="Qty on hand">
                      <Input
                        name="quantityOnHand"
                        type="number"
                        step="0.01"
                        defaultValue={numberValue(item.quantity_on_hand, "0")}
                      />
                    </Field>

                    <Field label="Qty available">
                      <Input
                        name="quantityAvailable"
                        type="number"
                        step="0.01"
                        defaultValue={numberValue(
                          item.quantity_available,
                          "0"
                        )}
                      />
                    </Field>
                  </div>
                )}

                {!isQuantityType && (
                  <>
                    <input
                      type="hidden"
                      name="quantityOnHand"
                      value={numberValue(item.quantity_on_hand, "0")}
                    />

                    <input
                      type="hidden"
                      name="quantityAvailable"
                      value={numberValue(item.quantity_available, "0")}
                    />
                  </>
                )}

                <Field label="Notes">
                  <Textarea
                    name="notes"
                    rows={3}
                    defaultValue={textValue(item.notes)}
                    placeholder="Internal warehouse notes..."
                  />
                </Field>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-[#eee5d9] bg-[#fcfaf7] px-3 py-2.5 text-xs font-bold text-[#1f1e1b] sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm sm:font-semibold">
                  <span className="min-w-0">
                    <span className="block">Needs cleaning after rental</span>
                    <span className="mt-1 hidden text-xs font-normal text-[#6c6258] sm:block">
                      Automatically creates a Cleaning Queue task after pickup.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    name="needsCleaning"
                    defaultChecked={item.needs_cleaning === true}
                    className="h-5 w-5 shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-xl border border-[#eee5d9] bg-[#fcfaf7] px-3 py-2.5 text-xs font-bold text-[#1f1e1b] sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm sm:font-semibold">
                  <span>Active in warehouse</span>
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={item.active !== false && !item.deleted_at}
                    className="h-5 w-5 shrink-0"
                  />
                </label>
              </div>

              <div className="border-t border-[#eee5d9] px-3.5 py-3 sm:flex sm:justify-end sm:px-6 sm:py-5">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#c9964f] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_22px_rgba(201,150,79,0.20)] transition hover:bg-[#b78744] sm:w-auto sm:rounded-full sm:px-8 sm:py-4 sm:font-semibold"
                >
                  Save item
                </button>
              </div>
            </form>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Active units
              </h3>

              <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
                Physical serialized units and their current warehouse status.
              </p>
            </div>

            <div className="divide-y divide-[#eee5d9]">
              {units.map((unit: any) => {
                const location = getRelationOne(unit.warehouse_locations);

                return (
                  <div key={unit.id} className="p-3.5 sm:p-6">
                    <div className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[180px_minmax(0,1fr)_320px]">
                      <div className="overflow-hidden rounded-[18px] border border-[#eee5d9] bg-[#efe7dc] sm:rounded-[24px]">
                        {unit.image_url || item.image_url ? (
                          <img
                            src={unit.image_url || item.image_url}
                            alt={unit.serial_number || "Unit"}
                            className="aspect-[16/10] h-full w-full object-cover sm:aspect-square"
                          />
                        ) : (
                          <div className="flex aspect-[16/10] items-center justify-center text-sm font-semibold text-[#9a7a49] sm:aspect-square">
                            No unit photo
                          </div>
                        )}

                        <form
                          action={uploadInventoryUnitPhotoAction}
                          className="grid grid-cols-[1fr_auto] gap-2 bg-white p-3 sm:block sm:space-y-3 sm:p-4"
                        >
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="unitId" value={unit.id} />

                          <Input
                            type="file"
                            name="photo"
                            accept="image/*"
                            required
                          />

                          <button
                            type="submit"
                            className="rounded-xl bg-[#23313f] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#18222d] sm:w-full sm:rounded-full sm:px-4 sm:text-xs sm:font-semibold"
                          >
                            Upload
                          </button>
                        </form>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <h4 className="min-w-0 truncate text-base font-bold text-[#1f1e1b] sm:text-xl sm:font-semibold">
                            {unit.serial_number || "Unit"}
                          </h4>

                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                              unit.status
                            )}`}
                          >
                            {unit.status || "unknown"}
                          </span>

                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold text-neutral-600 ring-1 ring-neutral-200 sm:px-3 sm:text-xs sm:font-semibold">
                            {unit.condition || "good"}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] leading-4 text-[#6c6258] sm:text-sm sm:leading-5">
                          <div className="truncate">Location: {location?.name || "—"}</div>
                          <div>Purchase price: {money(unit.purchase_price)}</div>
                          <div>
                            Last cleaned:{" "}
                            {unit.last_cleaned_at
                              ? new Date(unit.last_cleaned_at).toLocaleDateString()
                              : "—"}
                          </div>
                          <div>
                            Last inspected:{" "}
                            {unit.last_inspected_at
                              ? new Date(
                                  unit.last_inspected_at
                                ).toLocaleDateString()
                              : "—"}
                          </div>
                          <div>
                            Purchase date:{" "}
                            {unit.purchase_date
                              ? new Date(unit.purchase_date).toLocaleDateString()
                              : "—"}
                          </div>
                          <div className="truncate">Barcode: {unit.barcode || "—"}</div>
                        </div>

                        {unit.notes && (
                          <div className="mt-3 rounded-xl bg-[#fcfaf7] p-3 text-xs leading-5 text-[#6c6258] ring-1 ring-[#eee5d9] sm:mt-4 sm:rounded-2xl sm:p-4 sm:text-sm sm:leading-6">
                            {unit.notes}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <form
                          action={updateInventoryUnitAction}
                          className="rounded-[16px] border border-[#eee5d9] bg-[#fcfaf7] p-3 sm:rounded-[24px] sm:p-4"
                        >
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="unitId" value={unit.id} />

                          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                            <Field label="Serial">
                              <Input
                                name="serialNumber"
                                defaultValue={unit.serial_number || ""}
                              />
                            </Field>

                            <Field label="Status">
                              <Select
                                name="status"
                                defaultValue={unit.status || "available"}
                              >
                                <option value="available">Available</option>
                                <option value="reserved">Reserved</option>
                                <option value="picked">Picked</option>
                                <option value="loaded">Loaded</option>
                                <option value="installed">Installed</option>
                                <option value="returned">Returned</option>
                                <option value="cleaning">Cleaning</option>
                                <option value="maintenance">Maintenance</option>
                                <option value="damaged">Damaged</option>
                                <option value="lost">Lost</option>
                                <option value="retired">Retired</option>
                              </Select>
                            </Field>

                            <Field label="Location">
                              <Select
                                name="locationId"
                                defaultValue={unit.warehouse_location_id || ""}
                              >
                                <option value="">No location</option>
                                {locations.map((locationItem: any) => (
                                  <option
                                    key={locationItem.id}
                                    value={locationItem.id}
                                  >
                                    {locationItem.name}
                                  </option>
                                ))}
                              </Select>
                            </Field>

                            <Field label="Condition">
                              <Input
                                name="condition"
                                defaultValue={unit.condition || "good"}
                              />
                            </Field>

                            <div className="col-span-2">
                              <Field label="Purchase price">
                                <Input
                                  name="purchasePrice"
                                  type="number"
                                  step="0.01"
                                  defaultValue={numberValue(
                                    unit.purchase_price,
                                    "0"
                                  )}
                                />
                              </Field>
                            </div>
                          </div>

                          <div className="mt-3 sm:mt-4">
                            <Field label="Reason">
                              <Input
                                name="reason"
                                placeholder="Cleaning complete, moved to van..."
                              />
                            </Field>
                          </div>

                          <div className="mt-3 sm:mt-4">
                            <Field label="Notes">
                              <Input
                                name="notes"
                                defaultValue={unit.notes || ""}
                                placeholder="Short unit notes..."
                              />
                            </Field>
                          </div>

                          <button
                            type="submit"
                            className="mt-3 w-full rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#18222d] sm:mt-4 sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold"
                          >
                            Save unit
                          </button>
                        </form>

                        <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-1 sm:gap-3">
                          <form action={archiveInventoryUnitAction}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="unitId" value={unit.id} />
                            <input
                              type="hidden"
                              name="reason"
                              value={`Archived from item page. Unit: ${
                                unit.serial_number || unit.id
                              }`}
                            />

                            <button
                              type="submit"
                              className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-100 sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                            >
                              Archive unit
                            </button>
                          </form>

                          <form action={deleteInventoryUnitAction}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="unitId" value={unit.id} />

                            <button
                              type="submit"
                              className="w-full rounded-xl bg-red-700 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-red-800 sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                            >
                              Delete unit
                            </button>
                          </form>

                          <div className="col-span-2 rounded-xl bg-[#fff8eb] p-3 text-[11px] leading-4 text-[#8a6b20] ring-1 ring-[#efd582] sm:col-span-1 sm:rounded-2xl sm:text-xs sm:leading-5">
                            Delete works only for units without history. If this
                            unit was received, booked, moved or returned, use
                            Archive unit.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {units.length === 0 && (
                <div className="px-6 py-14 text-center sm:py-16">
                  <div className="text-lg font-semibold text-[#1f1e1b]">
                    No active serialized units
                  </div>

                  <p className="mt-2 text-sm text-[#6c6258]">
                    Receive stock to create units for this item.
                  </p>

                  <a
                    href="/admin/inventory/receive"
                    className="mt-5 inline-flex rounded-xl bg-[#c9964f] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-6 sm:font-semibold"
                  >
                    Receive stock
                  </a>
                </div>
              )}
            </div>
          </section>

          {archivedUnits.length > 0 && (
            <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
              <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
                <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                  Archived units
                </h3>

                <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
                  Retired or archived units are hidden from availability and
                  booking.
                </p>
              </div>

              <div className="divide-y divide-[#eee5d9]">
                {archivedUnits.map((unit: any) => {
                  const location = getRelationOne(unit.warehouse_locations);

                  return (
                    <div
                      key={unit.id}
                      className="grid gap-3 p-3.5 sm:gap-4 sm:p-6 md:grid-cols-[minmax(0,1fr)_180px]"
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <div className="min-w-0 truncate font-bold text-[#1f1e1b] sm:font-semibold">
                            {unit.serial_number || "Unit"}
                          </div>

                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                              unit.status
                            )}`}
                          >
                            {unit.status || "archived"}
                          </span>
                        </div>

                        <div className="mt-1.5 text-xs text-[#6c6258] sm:mt-2 sm:text-sm">
                          Location: {location?.name || "—"} · Cost:{" "}
                          {money(unit.purchase_price)}
                        </div>

                        {unit.notes && (
                          <div className="mt-1.5 line-clamp-2 text-xs text-[#6c6258] sm:mt-2 sm:text-sm">
                            {unit.notes}
                          </div>
                        )}
                      </div>

                      <form action={restoreInventoryUnitAction}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="unitId" value={unit.id} />

                        <button
                          type="submit"
                          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold"
                        >
                          Restore unit
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </section>
    </div>
  );
}

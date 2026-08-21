import { requireAdminPermission } from "@/lib/auth/require-admin";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    category?: string;
    status?: string;
    type?: string;
    location?: string;
    attention?: string;
  }>;
};

const unitStatuses = [
  "available",
  "reserved",
  "picked",
  "loaded",
  "installed",
  "returned",
  "cleaning",
  "maintenance",
  "damaged",
  "lost",
  "retired",
];

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  if (!status) return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";

  if (["available", "returned", "active"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (["reserved", "picked", "loaded", "installed"].includes(status)) {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (["cleaning", "maintenance"].includes(status)) {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  if (["damaged", "lost", "retired", "unavailable"].includes(status)) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function trackingTypeLabel(value: string | null | undefined) {
  if (value === "serialized") return "Serialized";
  if (value === "quantity") return "Quantity";
  if (value === "kit") return "Kit";
  if (value === "consumable") return "Consumable";
  return prettyStatus(value);
}

function getUnits(item: any) {
  return item.inventory_units || [];
}

function countUnitsByStatus(item: any, statuses: string[]) {
  return getUnits(item).filter((unit: any) => statuses.includes(unit.status))
    .length;
}

function getItemTotal(item: any) {
  if (item.tracking_type === "quantity") {
    return Number(item.quantity_on_hand || 0);
  }

  return getUnits(item).length;
}

function getItemAvailable(item: any) {
  if (item.tracking_type === "quantity") {
    return Number(item.quantity_available || 0);
  }

  return countUnitsByStatus(item, ["available", "returned"]);
}

function getItemOut(item: any) {
  if (item.tracking_type === "quantity") {
    return 0;
  }

  return countUnitsByStatus(item, ["reserved", "picked", "loaded", "installed"]);
}

function getItemCleaning(item: any) {
  return countUnitsByStatus(item, ["cleaning"]);
}

function getItemRepair(item: any) {
  return countUnitsByStatus(item, ["maintenance", "damaged"]);
}

function getItemLostOrRetired(item: any) {
  return countUnitsByStatus(item, ["lost", "retired"]);
}

function getItemNeedsAttention(item: any) {
  if (item.tracking_type === "quantity") {
    return Number(item.quantity_available || 0) <= Number(item.reorder_point || 0);
  }

  return (
    getItemCleaning(item) > 0 ||
    getItemRepair(item) > 0 ||
    getItemLostOrRetired(item) > 0
  );
}

function getPrimaryLocation(item: any) {
  const units = getUnits(item);
  const locationMap = new Map<string, number>();

  for (const unit of units) {
    const name = unit.warehouse_locations?.name;
    if (!name) continue;

    locationMap.set(name, (locationMap.get(name) || 0) + 1);
  }

  const sorted = Array.from(locationMap.entries()).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    return "—";
  }

  if (sorted.length === 1) {
    return sorted[0][0];
  }

  return `${sorted[0][0]} +${sorted.length - 1}`;
}

function getCategoryName(item: any) {
  return item.inventory_categories?.name || "Uncategorized";
}

function getFilteredItems({
  items,
  query,
  category,
  status,
  type,
  location,
  attention,
}: {
  items: any[];
  query: string;
  category: string;
  status: string;
  type: string;
  location: string;
  attention: string;
}) {
  return items.filter((item) => {
    const units = getUnits(item);

    const queryText = [
      item.name,
      item.sku,
      item.description,
      item.inventory_categories?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (query && !queryText.includes(query.toLowerCase())) {
      return false;
    }

    if (category && item.category_id !== category) {
      return false;
    }

    if (type && item.tracking_type !== type) {
      return false;
    }

    if (attention === "1" && !getItemNeedsAttention(item)) {
      return false;
    }

    if (status) {
      if (item.tracking_type === "quantity") {
        if (status === "low_stock") {
          return getItemNeedsAttention(item);
        }

        return true;
      }

      const hasStatus = units.some((unit: any) => unit.status === status);
      if (!hasStatus) return false;
    }

    if (location) {
      const hasLocation = units.some(
        (unit: any) => unit.warehouse_location_id === location
      );

      if (!hasLocation) return false;
    }

    return true;
  });
}

function buildQueryString(params: Record<string, string>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }

  const value = query.toString();
  return value ? `?${value}` : "";
}

export default async function InventoryPage(props: PageProps) {
  const searchParams = props.searchParams ? await props.searchParams : {};

  const query = (searchParams.q || "").trim();
  const category = searchParams.category || "";
  const status = searchParams.status || "";
  const type = searchParams.type || "";
  const location = searchParams.location || "";
  const attention = searchParams.attention || "";

  const { supabase } = await requireAdminPermission("inventory.view");

  const [categoriesResult, locationsResult, itemsResult] = await Promise.all([
    supabase
      .from("inventory_categories")
      .select("id, name, slug, parent_id, sort_order, active")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("warehouse_locations")
      .select("id, name, slug, location_type, sort_order, active")
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
        description,
        tracking_type,
        category_id,
        unit_label,
        quantity_on_hand,
        quantity_available,
        minimum_stock,
        reorder_point,
        active,
        sort_order,
        notes,
        inventory_categories (
          id,
          name,
          slug
        ),
        inventory_units (
          id,
          unit_code,
          status,
          warehouse_location_id,
          condition,
          last_cleaned_at,
          last_inspected_at,
          warehouse_locations (
            id,
            name,
            slug,
            location_type
          )
        )
      `
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);

  const categories = categoriesResult.data || [];
  const locations = locationsResult.data || [];
  const items = itemsResult.data || [];

  const filteredItems = getFilteredItems({
    items,
    query,
    category,
    status,
    type,
    location,
    attention,
  });

  const allUnits = items.flatMap((item: any) => getUnits(item));

  const availableUnits = allUnits.filter((unit: any) =>
    ["available", "returned"].includes(unit.status)
  );

  const outUnits = allUnits.filter((unit: any) =>
    ["reserved", "picked", "loaded", "installed"].includes(unit.status)
  );

  const cleaningUnits = allUnits.filter((unit: any) => unit.status === "cleaning");

  const repairUnits = allUnits.filter((unit: any) =>
    ["maintenance", "damaged"].includes(unit.status)
  );

  const attentionItems = items.filter((item: any) => getItemNeedsAttention(item));

  const categoryCounts = categories.map((cat: any) => ({
    ...cat,
    count: items.filter((item: any) => item.category_id === cat.id).length,
  }));

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[22px] sm:p-4 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Items
          </div>
          <div className="mt-2 text-2xl font-semibold sm:text-3xl text-[#1f1e1b]">
            {items.length}
          </div>
          <div className="mt-1 text-xs text-[#6c6258]">Warehouse positions</div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[22px] sm:p-4 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Units
          </div>
          <div className="mt-2 text-2xl font-semibold sm:text-3xl text-[#1f1e1b]">
            {allUnits.length}
          </div>
          <div className="mt-1 text-xs text-[#6c6258]">Serialized units</div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[22px] sm:p-4 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Available
          </div>
          <div className="mt-2 text-2xl font-semibold sm:text-3xl text-emerald-700">
            {availableUnits.length}
          </div>
          <div className="mt-1 text-xs text-[#6c6258]">Ready to rent</div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[22px] sm:p-4 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Out
          </div>
          <div className="mt-2 text-2xl font-semibold sm:text-3xl text-[#8a6b20]">
            {outUnits.length}
          </div>
          <div className="mt-1 text-xs text-[#6c6258]">Rental lifecycle</div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[22px] sm:p-4 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Cleaning / repair
          </div>
          <div className="mt-2 text-2xl font-semibold sm:text-3xl text-[#355879]">
            {cleaningUnits.length + repairUnits.length}
          </div>
          <div className="mt-1 text-xs text-[#6c6258]">Not ready</div>
        </div>

        <a
          href="/admin/inventory?attention=1"
          className="min-w-0 rounded-[18px] border border-red-100 bg-red-50 p-3 shadow-[0_6px_20px_rgba(0,0,0,0.03)] transition hover:bg-red-100 sm:rounded-[22px] sm:p-4 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">
            Attention
          </div>
          <div className="mt-2 text-2xl font-semibold sm:text-3xl text-red-700">
            {attentionItems.length}
          </div>
          <div className="mt-1 text-xs text-red-700/70">
            Low stock / problems
          </div>
        </a>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3 sm:space-y-4">
          <div className="min-w-0 rounded-[20px] border border-black/5 bg-white shadow-[0_6px_22px_rgba(0,0,0,0.03)] sm:rounded-[26px] sm:shadow-[0_8px_28px_rgba(0,0,0,0.035)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-5 sm:py-4">
              <h3 className="font-semibold text-[#1f1e1b]">Categories</h3>
            </div>

            <div className="flex max-w-full gap-2 overflow-x-auto p-2.5 sm:p-3 xl:block xl:max-h-[560px] xl:overflow-y-auto xl:space-y-1">
              <a
                href="/admin/inventory"
                className={[
                  "flex min-w-max items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm xl:min-w-0",
                  !category
                    ? "bg-[#23313f] text-white"
                    : "text-[#3a342d] hover:bg-[#fcfaf7]",
                ].join(" ")}
              >
                <span>All items</span>
                <span>{items.length}</span>
              </a>

              {categoryCounts.map((cat: any) => (
                <a
                  key={cat.id}
                  href={`/admin/inventory${buildQueryString({
                    category: cat.id,
                    q: query,
                    status,
                    type,
                    location,
                    attention,
                  })}`}
                  className={[
                    "flex min-w-max items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm xl:mt-1 xl:min-w-0",
                    category === cat.id
                      ? "bg-[#23313f] text-white"
                      : "text-[#3a342d] hover:bg-[#fcfaf7]",
                  ].join(" ")}
                >
                  <span className="truncate">{cat.name}</span>
                  <span>{cat.count}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-[20px] border border-black/5 bg-white p-3.5 shadow-[0_6px_22px_rgba(0,0,0,0.03)] sm:rounded-[26px] sm:p-4 sm:shadow-[0_8px_28px_rgba(0,0,0,0.035)]">
            <h3 className="font-semibold text-[#1f1e1b]">Quick filters</h3>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <a
                href="/admin/inventory?status=available"
                className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200"
              >
                Available
              </a>
              <a
                href="/admin/inventory?status=installed"
                className="rounded-2xl bg-[#fff4d8] px-4 py-3 text-sm font-semibold text-[#8a6b20] ring-1 ring-[#efd582]"
              >
                Installed / out
              </a>
              <a
                href="/admin/inventory?status=cleaning"
                className="rounded-2xl bg-[#eaf2f9] px-4 py-3 text-sm font-semibold text-[#355879] ring-1 ring-[#cfe0ef]"
              >
                Cleaning
              </a>
              <a
                href="/admin/inventory?status=damaged"
                className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200"
              >
                Damaged
              </a>
            </div>
          </div>

          <div className="min-w-0 rounded-[20px] border border-black/5 bg-[#23313f] p-3.5 text-white shadow-[0_6px_22px_rgba(0,0,0,0.03)] sm:rounded-[26px] sm:p-4 sm:shadow-[0_8px_28px_rgba(0,0,0,0.035)]">
            <h3 className="font-semibold">Warehouse actions</h3>

            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <a
                href="/admin/inventory/receive"
                className="rounded-full bg-[#c9964f] px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                Receive stock
              </a>
              <a
                href="/admin/inventory/write-offs"
                className="rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-[#23313f] transition hover:bg-[#f5efe6]"
              >
                Write-off
              </a>
              <a
                href="/admin/inventory/movements"
                className="rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Movements
              </a>
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4 sm:space-y-6">
          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_6px_22px_rgba(0,0,0,0.03)] sm:rounded-[26px] sm:shadow-[0_8px_28px_rgba(0,0,0,0.035)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-5 sm:py-4">
              <form
                method="get"
                className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-[1fr_160px_160px_160px_110px]"
              >
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Search name, SKU, category..."
                  className="col-span-2 min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3 xl:col-span-1"
                />

                <select
                  name="type"
                  defaultValue={type}
                  title="Filter by inventory type"
                  aria-label="Filter by inventory type"
                  className="min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none sm:rounded-2xl sm:px-4 sm:py-3"
                >
                  <option value="">All types</option>
                  <option value="serialized">Serialized</option>
                  <option value="quantity">Quantity</option>
                  <option value="kit">Kit</option>
                  <option value="consumable">Consumable</option>
                </select>

                <select
                  name="status"
                  defaultValue={status}
                  title="Filter by unit status"
                  aria-label="Filter by unit status"
                  className="min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none sm:rounded-2xl sm:px-4 sm:py-3"
                >
                  <option value="">All statuses</option>
                  <option value="low_stock">Low stock / attention</option>
                  {unitStatuses.map((row) => (
                    <option key={row} value={row}>
                      {prettyStatus(row)}
                    </option>
                  ))}
                </select>

                <select
                  name="location"
                  defaultValue={location}
                  title="Filter by warehouse location"
                  aria-label="Filter by warehouse location"
                  className="min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none sm:rounded-2xl sm:px-4 sm:py-3"
                >
                  <option value="">All locations</option>
                  {locations.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>

                {category && (
                  <input type="hidden" name="category" value={category} />
                )}

                {attention && (
                  <input type="hidden" name="attention" value={attention} />
                )}

                <button
                  type="submit"
                  className="col-span-2 rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 xl:col-span-1"
                >
                  Filter
                </button>
              </form>
            </div>

            <div className="min-w-0 overflow-visible sm:overflow-x-auto">
              <table className="block w-full border-collapse text-sm sm:table sm:min-w-[1120px]">
                <thead className="hidden sm:table-header-group">
                  <tr className="border-b border-[#eee5d9] bg-[#fcfaf7] text-left text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Available</th>
                    <th className="px-4 py-3 text-right">Out</th>
                    <th className="px-4 py-3 text-right">Clean</th>
                    <th className="px-4 py-3 text-right">Repair</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Open</th>
                  </tr>
                </thead>

                <tbody className="block space-y-2.5 p-2.5 sm:table-row-group sm:space-y-0 sm:p-0 sm:divide-y sm:divide-[#f0e7dc]">
                  {filteredItems.map((item: any) => {
                    const attentionRow = getItemNeedsAttention(item);

                    return (
                      <tr
                        key={item.id}
                        className="block overflow-hidden rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] hover:bg-[#fcfaf7] sm:table-row sm:rounded-none sm:border-0 sm:bg-white"
                      >
                        <td className="block px-3 py-3 sm:table-cell sm:px-4 sm:py-3">
                          <a
                            href={`/admin/inventory/items/${item.id}`}
                            className="block truncate text-base font-bold text-[#1f1e1b] hover:text-[#c9964f] sm:text-sm sm:font-semibold"
                          >
                            {item.name}
                          </a>

                          <div className="mt-1 text-xs text-[#8f7f6b]">
                            SKU: {item.sku || "—"}
                          </div>

                          <div className="mt-4 grid grid-cols-5 gap-1 sm:hidden">
                            <div className="text-center">
                              <div className="text-base font-bold text-[#1f1e1b]">
                                {getItemTotal(item)}
                              </div>
                              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8f7f6b]">
                                Total
                              </div>
                            </div>

                            <div className="text-center">
                              <div className="text-base font-bold text-emerald-700">
                                {getItemAvailable(item)}
                              </div>
                              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8f7f6b]">
                                Free
                              </div>
                            </div>

                            <div className="text-center">
                              <div className="text-base font-bold text-[#8a6b20]">
                                {getItemOut(item)}
                              </div>
                              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8f7f6b]">
                                Out
                              </div>
                            </div>

                            <div className="text-center">
                              <div className="text-base font-bold text-[#355879]">
                                {getItemCleaning(item)}
                              </div>
                              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8f7f6b]">
                                Clean
                              </div>
                            </div>

                            <div className="text-center">
                              <div className="text-base font-bold text-red-700">
                                {getItemRepair(item)}
                              </div>
                              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8f7f6b]">
                                Repair
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3 sm:hidden">
                            {attentionRow ? (
                              <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-200">
                                Attention
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                                OK
                              </span>
                            )}

                            <a
                              href={`/admin/inventory/items/${item.id}`}
                              aria-label={`Open ${item.name}`}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#23313f] text-lg font-bold text-white transition hover:bg-[#18222d]"
                            >
                              →
                            </a>
                          </div>
                        </td>

                        <td className="hidden px-4 py-3 text-[#6c6258] sm:table-cell">
                          {getCategoryName(item)}
                        </td>

                        <td className="hidden px-4 py-3 sm:table-cell">
                          <span className="rounded-full bg-[#eaf2f9] px-3 py-1 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
                            {trackingTypeLabel(item.tracking_type)}
                          </span>
                        </td>

                        <td className="hidden px-4 py-3 text-right font-semibold text-[#1f1e1b] sm:table-cell">
                          {getItemTotal(item)}
                        </td>

                        <td className="hidden px-4 py-3 text-right font-semibold text-emerald-700 sm:table-cell">
                          {getItemAvailable(item)}
                        </td>

                        <td className="hidden px-4 py-3 text-right font-semibold text-[#8a6b20] sm:table-cell">
                          {getItemOut(item)}
                        </td>

                        <td className="hidden px-4 py-3 text-right font-semibold text-[#355879] sm:table-cell">
                          {getItemCleaning(item)}
                        </td>

                        <td className="hidden px-4 py-3 text-right font-semibold text-red-700 sm:table-cell">
                          {getItemRepair(item)}
                        </td>

                        <td className="hidden px-4 py-3 text-[#6c6258] sm:table-cell">
                          {getPrimaryLocation(item)}
                        </td>

                        <td className="hidden px-4 py-3 sm:table-cell">
                          {attentionRow ? (
                            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                              Attention
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                              OK
                            </span>
                          )}
                        </td>

                        <td className="hidden px-4 py-3 text-right sm:table-cell">
                          <a
                            href={`/admin/inventory/items/${item.id}`}
                            className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#18222d]"
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-6 py-16 text-center">
                        <div className="text-lg font-semibold text-[#1f1e1b]">
                          No inventory items found
                        </div>
                        <p className="mt-2 text-sm text-[#6c6258]">
                          Change filters or add a new warehouse item.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}
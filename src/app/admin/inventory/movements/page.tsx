import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    type?: string;
    item?: string;
    unit?: string;
    status?: string;
    from?: string;
    to?: string;
  }>;
};

const movementTypes = [
  "purchase_receive",
  "manual_adjustment",
  "reservation_hold",
  "pick_for_order",
  "load_to_vehicle",
  "install_at_event",
  "pickup_from_event",
  "return_to_warehouse",
  "send_to_cleaning",
  "cleaning_complete",
  "inspection_complete",
  "send_to_repair",
  "repair_complete",
  "write_off",
  "lost",
  "transfer_location",
  "inventory_count",
  "status_change",
  "other",
];

const statuses = [
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
  if (!status) return "—";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  if (!status) return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";

  if (
    ["available", "returned", "active", "cleaning_complete", "repair_complete"].includes(
      status
    )
  ) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (
    [
      "reserved",
      "picked",
      "loaded",
      "installed",
      "reservation_hold",
      "pick_for_order",
      "load_to_vehicle",
      "install_at_event",
    ].includes(status)
  ) {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (
    [
      "cleaning",
      "maintenance",
      "send_to_cleaning",
      "inspection_complete",
      "send_to_repair",
      "transfer_location",
      "status_change",
      "manual_adjustment",
      "inventory_count",
    ].includes(status)
  ) {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  if (["damaged", "lost", "retired", "write_off"].includes(status)) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  if (
    ["purchase_receive", "return_to_warehouse", "pickup_from_event"].includes(
      status
    )
  ) {
    return "bg-[#f4ede2] text-[#9a723e] ring-1 ring-[#e3d3bb]";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getMovementDescription(movement: any) {
  const itemName = movement.inventory_items?.name || "Inventory item";
  const unitCode = movement.inventory_units?.unit_code;
  const qty = Number(movement.quantity || 1);

  if (unitCode) {
    return `${itemName} · ${unitCode}`;
  }

  return `${itemName} · qty ${qty}`;
}

export default async function InventoryMovementsPage(props: PageProps) {
  const searchParams = props.searchParams ? await props.searchParams : {};

  const q = (searchParams.q || "").trim();
  const type = searchParams.type || "";
  const item = searchParams.item || "";
  const unit = searchParams.unit || "";
  const status = searchParams.status || "";
  const from = searchParams.from || "";
  const to = searchParams.to || "";

  const supabase = await createClient();

  const [itemsResult, unitsResult, locationsResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id, name, sku")
      .order("name", { ascending: true }),

    supabase
      .from("inventory_units")
      .select(
        `
        id,
        unit_code,
        status,
        inventory_items (
          id,
          name
        )
      `
      )
      .order("unit_code", { ascending: true }),

    supabase
      .from("warehouse_locations")
      .select("id, name, location_type")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (unitsResult.error) throw new Error(unitsResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);

  const items = itemsResult.data || [];
  const units = unitsResult.data || [];
  const locations = locationsResult.data || [];

  let movementsQuery = supabase
    .from("inventory_movements")
    .select(
      `
      id,
      movement_type,
      quantity,
      from_status,
      to_status,
      reason,
      notes,
      created_at,
      inventory_items (
        id,
        name,
        sku
      ),
      inventory_units (
        id,
        unit_code,
        status
      ),
      bookings (
        id,
        booking_number,
        event_date,
        customers (
          id,
          full_name
        )
      ),
      from_location:from_location_id (
        id,
        name,
        location_type
      ),
      to_location:to_location_id (
        id,
        name,
        location_type
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(250);

  if (type) {
    movementsQuery = movementsQuery.eq("movement_type", type);
  }

  if (item) {
    movementsQuery = movementsQuery.eq("inventory_item_id", item);
  }

  if (unit) {
    movementsQuery = movementsQuery.eq("inventory_unit_id", unit);
  }

  if (status) {
    movementsQuery = movementsQuery.or(
      `from_status.eq.${status},to_status.eq.${status}`
    );
  }

  if (from) {
    movementsQuery = movementsQuery.gte("created_at", `${from}T00:00:00`);
  }

  if (to) {
    movementsQuery = movementsQuery.lte("created_at", `${to}T23:59:59`);
  }

  const movementsResult = await movementsQuery;

  if (movementsResult.error) {
    throw new Error(movementsResult.error.message);
  }

  const allMovements = movementsResult.data || [];

  const movements = q
    ? allMovements.filter((movement: any) => {
        const searchText = [
          movement.movement_type,
          movement.reason,
          movement.notes,
          movement.inventory_items?.name,
          movement.inventory_items?.sku,
          movement.inventory_units?.unit_code,
          movement.bookings?.booking_number,
          movement.bookings?.customers?.full_name,
          movement.from_location?.name,
          movement.to_location?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchText.includes(q.toLowerCase());
      })
    : allMovements;

  const receiveCount = movements.filter(
    (movement: any) => movement.movement_type === "purchase_receive"
  ).length;

  const rentalCount = movements.filter((movement: any) =>
    [
      "reservation_hold",
      "pick_for_order",
      "load_to_vehicle",
      "install_at_event",
      "pickup_from_event",
      "return_to_warehouse",
    ].includes(movement.movement_type)
  ).length;

  const serviceCount = movements.filter((movement: any) =>
    [
      "send_to_cleaning",
      "cleaning_complete",
      "inspection_complete",
      "send_to_repair",
      "repair_complete",
    ].includes(movement.movement_type)
  ).length;

  const writeOffCount = movements.filter((movement: any) =>
    ["write_off", "lost"].includes(movement.movement_type)
  ).length;

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white px-4 py-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:px-6 sm:py-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between xl:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Warehouse journal
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Inventory Movements
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Полная история движения склада: прием, резерв, загрузка,
              установка, возврат, чистка, ремонт, перемещение и списание.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <a
              href="/admin/inventory"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2.5 text-center text-[11px] font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Inventory
            </a>

            <a
              href="/admin/inventory/receive"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c9964f] px-2.5 text-center text-[11px] font-bold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Receive
            </a>

            <a
              href="/admin/inventory/write-offs"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#23313f] px-2.5 text-center text-[11px] font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Write-offs
            </a>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Total shown
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {movements.length}
          </div>
        </div>

        <a
          href="/admin/inventory/movements?type=purchase_receive"
          className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] transition hover:bg-[#fcfaf7] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Receipts
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {receiveCount}
          </div>
        </a>

        <a
          href="/admin/inventory/movements?type=reservation_hold"
          className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] transition hover:bg-[#fcfaf7] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Rental flow
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#8a6b20] sm:mt-2 sm:text-3xl sm:font-semibold">
            {rentalCount}
          </div>
        </a>

        <a
          href="/admin/inventory/movements?type=send_to_cleaning"
          className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] transition hover:bg-[#fcfaf7] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Service
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#355879] sm:mt-2 sm:text-3xl sm:font-semibold">
            {serviceCount}
          </div>
        </a>

        <a
          href="/admin/inventory/movements?type=write_off"
          className="col-span-2 min-w-0 rounded-[18px] border border-red-100 bg-red-50 p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] transition hover:bg-red-100 sm:col-span-1 sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">
            Write-offs
          </div>
          <div className="mt-1.5 text-2xl font-bold text-red-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {writeOffCount}
          </div>
        </a>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[28px] sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-5 sm:py-4">
              <h3 className="font-bold text-[#1f1e1b] sm:font-semibold">
                Filters
              </h3>
            </div>

            <form
              method="get"
              className="grid grid-cols-2 gap-2.5 p-3.5 sm:gap-3 sm:p-5 xl:block xl:space-y-4"
            >
              <label className="col-span-2 block min-w-0 xl:col-span-1">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
                  Search
                </span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Item, unit, reason..."
                  className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3"
                />
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
                  Movement type
                </span>
                <select
                  name="type"
                  defaultValue={type}
                  className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3"
                >
                  <option value="">All movement types</option>
                  {movementTypes.map((row) => (
                    <option key={row} value={row}>
                      {prettyStatus(row)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
                  Item
                </span>
                <select
                  name="item"
                  defaultValue={item}
                  className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3"
                >
                  <option value="">All items</option>
                  {items.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.name} {row.sku ? `· ${row.sku}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
                  Unit
                </span>
                <select
                  name="unit"
                  defaultValue={unit}
                  className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3"
                >
                  <option value="">All units</option>
                  {units.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.inventory_items?.name || "Item"} · {row.unit_code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
                  Status
                </span>
                <select
                  name="status"
                  defaultValue={status}
                  className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3"
                >
                  <option value="">Any status</option>
                  {statuses.map((row) => (
                    <option key={row} value={row}>
                      {prettyStatus(row)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
                  From
                </span>
                <input
                  name="from"
                  type="date"
                  defaultValue={from}
                  className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3"
                />
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
                  To
                </span>
                <input
                  name="to"
                  type="date"
                  defaultValue={to}
                  className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3"
                />
              </label>

              <button
                type="submit"
                className="col-span-2 w-full rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold xl:col-span-1"
              >
                Apply filters
              </button>

              <a
                href="/admin/inventory/movements"
                className="col-span-2 block rounded-xl border border-[#d8cec0] bg-white px-4 py-2.5 text-center text-sm font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold xl:col-span-1"
              >
                Reset
              </a>
            </form>
          </div>

          <div className="rounded-[20px] border border-black/5 bg-[#23313f] p-3.5 text-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[28px] sm:p-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
            <h3 className="font-bold sm:font-semibold">Quick views</h3>

            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-1">
              <a
                href="/admin/inventory/movements?type=purchase_receive"
                className="rounded-xl bg-white px-3 py-2 text-center text-xs font-bold text-[#23313f] sm:rounded-full sm:px-4 sm:text-sm sm:font-semibold"
              >
                Receipts
              </a>

              <a
                href="/admin/inventory/movements?type=return_to_warehouse"
                className="rounded-xl border border-white/15 px-3 py-2 text-center text-xs font-bold text-white hover:bg-white/10 sm:rounded-full sm:px-4 sm:text-sm sm:font-semibold"
              >
                Returns
              </a>

              <a
                href="/admin/inventory/movements?type=send_to_cleaning"
                className="rounded-xl border border-white/15 px-3 py-2 text-center text-xs font-bold text-white hover:bg-white/10 sm:rounded-full sm:px-4 sm:text-sm sm:font-semibold"
              >
                Cleaning
              </a>

              <a
                href="/admin/inventory/movements?type=write_off"
                className="rounded-xl border border-white/15 px-3 py-2 text-center text-xs font-bold text-white hover:bg-white/10 sm:rounded-full sm:px-4 sm:text-sm sm:font-semibold"
              >
                Write-offs
              </a>
            </div>
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
              Movement log
            </h3>

            <p className="mt-0.5 text-xs text-[#6c6258] sm:mt-1 sm:text-sm">
              Showing latest {movements.length} records.
            </p>
          </div>

          <div className="block space-y-2.5 p-2.5 sm:hidden">
            {movements.map((movement: any) => {
              const booking = Array.isArray(movement.bookings)
                ? movement.bookings[0]
                : movement.bookings;

              const customer = Array.isArray(booking?.customers)
                ? booking.customers[0]
                : booking?.customers;

              return (
                <div
                  key={movement.id}
                  className="rounded-[16px] border border-[#eee5d9] bg-[#fcfaf7] p-3"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[#1f1e1b]">
                        {getMovementDescription(movement)}
                      </div>

                      <div className="mt-0.5 text-[11px] text-[#8f7f6b]">
                        {formatDateTime(movement.created_at)}
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClass(
                        movement.movement_type
                      )}`}
                    >
                      {prettyStatus(movement.movement_type)}
                    </span>
                  </div>

                  {(movement.from_status || movement.to_status) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {movement.from_status && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[#6c6258] ring-1 ring-[#eee5d9]">
                          From {prettyStatus(movement.from_status)}
                        </span>
                      )}

                      {movement.to_status && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(
                            movement.to_status
                          )}`}
                        >
                          To {prettyStatus(movement.to_status)}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#eee5d9] pt-2.5">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                        Location
                      </div>
                      <div className="mt-0.5 text-[11px] leading-4 text-[#6c6258]">
                        {movement.from_location?.name || "—"} →{" "}
                        {movement.to_location?.name || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                        Qty
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-[#1f1e1b]">
                        {movement.quantity || 1}
                      </div>
                    </div>
                  </div>

                  {(movement.reason || booking?.id || movement.inventory_items?.id) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      {movement.reason && (
                        <span className="text-[#8f7f6b]">
                          {movement.reason}
                        </span>
                      )}

                      {movement.inventory_items?.id && (
                        <a
                          href={`/admin/inventory/items/${movement.inventory_items.id}`}
                          className="font-bold text-[#c9964f]"
                        >
                          Open item
                        </a>
                      )}

                      {booking?.id && (
                        <a
                          href={`/admin/bookings/${booking.id}`}
                          className="font-bold text-[#355879]"
                        >
                          Booking #{booking.booking_number || booking.id.slice(0, 8)}
                          {customer?.full_name ? ` · ${customer.full_name}` : ""}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {movements.length === 0 && (
              <div className="px-4 py-10 text-center">
                <div className="text-base font-bold text-[#1f1e1b]">
                  No movements found
                </div>
                <p className="mt-1 text-sm text-[#6c6258]">
                  Change filters or create warehouse actions.
                </p>
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#eee5d9] bg-[#fcfaf7] text-left text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Item / unit</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Location</th>
                  <th className="px-5 py-4">Booking</th>
                  <th className="px-5 py-4 text-right">Qty</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#f0e7dc]">
                {movements.map((movement: any) => {
                  const booking = Array.isArray(movement.bookings)
                    ? movement.bookings[0]
                    : movement.bookings;

                  const customer = Array.isArray(booking?.customers)
                    ? booking.customers[0]
                    : booking?.customers;

                  return (
                    <tr key={movement.id} className="hover:bg-[#fcfaf7]">
                      <td className="px-5 py-4 text-[#6c6258]">
                        {formatDateTime(movement.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                            movement.movement_type
                          )}`}
                        >
                          {prettyStatus(movement.movement_type)}
                        </span>

                        {movement.reason && (
                          <div className="mt-2 text-xs text-[#8f7f6b]">
                            {movement.reason}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-[#1f1e1b]">
                          {getMovementDescription(movement)}
                        </div>

                        {movement.inventory_items?.id && (
                          <a
                            href={`/admin/inventory/items/${movement.inventory_items.id}`}
                            className="mt-1 inline-flex text-xs font-semibold text-[#c9964f] hover:text-[#9a723e]"
                          >
                            Open item
                          </a>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {movement.from_status && (
                            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-[#6c6258] ring-1 ring-[#eee5d9]">
                              From {prettyStatus(movement.from_status)}
                            </span>
                          )}

                          {movement.to_status && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(
                                movement.to_status
                              )}`}
                            >
                              To {prettyStatus(movement.to_status)}
                            </span>
                          )}

                          {!movement.from_status && !movement.to_status && (
                            <span className="text-[#8f7f6b]">—</span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-[#6c6258]">
                        <div>
                          From: {movement.from_location?.name || "—"}
                        </div>
                        <div className="mt-1">
                          To: {movement.to_location?.name || "—"}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {booking?.id ? (
                          <a
                            href={`/admin/bookings/${booking.id}`}
                            className="font-semibold text-[#1f1e1b] hover:text-[#c9964f]"
                          >
                            #{booking.booking_number || booking.id.slice(0, 8)}
                            <div className="mt-1 text-xs font-normal text-[#6c6258]">
                              {customer?.full_name || "No client"}
                            </div>
                          </a>
                        ) : (
                          <span className="text-[#8f7f6b]">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right font-semibold text-[#1f1e1b]">
                        {movement.quantity || 1}
                      </td>
                    </tr>
                  );
                })}

                {movements.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="text-lg font-semibold text-[#1f1e1b]">
                        No movements found
                      </div>
                      <p className="mt-2 text-sm text-[#6c6258]">
                        Change filters or create warehouse actions.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </section>
    </div>
  );
}

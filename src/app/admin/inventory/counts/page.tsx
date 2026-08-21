import { createClient } from "@/lib/supabase/server";
import {
  cancelInventoryCountAction,
  completeInventoryCountAction,
  createInventoryCountAction,
  updateInventoryCountLineAction,
} from "./actions";

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
  if (!status) {
    return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
  }

  if (["completed", "available", "returned"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (
    ["draft", "in_progress", "reserved", "picked", "loaded", "installed"].includes(
      status
    )
  ) {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (["cleaning", "maintenance"].includes(status)) {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  if (["cancelled", "damaged", "lost", "retired"].includes(status)) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
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

function getLineProblem(line: any) {
  const difference = Number(line.difference_quantity || 0);

  if (difference !== 0) {
    return true;
  }

  if (
    line.expected_status &&
    line.counted_status &&
    line.expected_status !== line.counted_status
  ) {
    return true;
  }

  return false;
}

export default async function InventoryCountsPage() {
  const supabase = await createClient();

  const [locationsResult, countsResult] = await Promise.all([
    supabase
      .from("warehouse_locations")
      .select("id, name, slug, location_type")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("inventory_counts")
      .select(
        `
        id,
        count_number,
        status,
        warehouse_location_id,
        started_at,
        completed_at,
        notes,
        warehouse_locations (
          id,
          name,
          location_type
        ),
        inventory_count_lines (
          id,
          inventory_item_id,
          inventory_unit_id,
          expected_quantity,
          counted_quantity,
          difference_quantity,
          expected_status,
          counted_status,
          notes,
          inventory_items (
            id,
            name,
            sku,
            tracking_type
          ),
          inventory_units (
            id,
            unit_code,
            status
          )
        )
      `
      )
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }

  if (countsResult.error) {
    throw new Error(countsResult.error.message);
  }

  const locations = locationsResult.data || [];
  const counts = countsResult.data || [];

  const activeCount =
    counts.find((count: any) => count.status === "in_progress") ||
    counts.find((count: any) => count.status === "draft");

  const completedCounts = counts.filter(
    (count: any) => count.status === "completed"
  );

  const activeLines = activeCount?.inventory_count_lines || [];
  const problemLines = activeLines.filter((line: any) => getLineProblem(line));

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white px-4 py-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:px-6 sm:py-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between xl:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Warehouse audit
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Inventory Counts
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Инвентаризация склада: expected vs counted, проверка статусов,
              расхождения, потерянные unit и пересчет quantity-позиций.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a
              href="/admin/inventory"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-center text-xs font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Inventory list
            </a>

            <a
              href="/admin/inventory/movements"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#23313f] px-3 text-center text-xs font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Movements
            </a>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Counts
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {counts.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Active
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#8a6b20] sm:mt-2 sm:text-3xl sm:font-semibold">
            {activeCount ? 1 : 0}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Lines
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {activeLines.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-red-100 bg-red-50 p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">
            Problems
          </div>
          <div className="mt-1.5 text-2xl font-bold text-red-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {problemLines.length}
          </div>
        </div>

        <div className="col-span-2 min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:col-span-1 sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Completed
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {completedCounts.length}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4 sm:space-y-6">
          <form
            action={createInventoryCountAction}
            className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]"
          >
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Start new count
              </h3>

              <p className="mt-0.5 text-xs text-[#6c6258] sm:mt-1 sm:text-sm">
                Создает snapshot текущего склада и строки для проверки.
              </p>
            </div>

            <div className="space-y-3 p-3.5 sm:space-y-4 sm:p-6">
              <Field label="Location">
                <Select name="warehouseLocationId">
                  <option value="">All warehouse</option>
                  {locations.map((location: any) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Notes">
                <Textarea
                  name="notes"
                  rows={3}
                  placeholder="Monthly count, after busy weekend, before season..."
                />
              </Field>

              <button
                type="submit"
                className="w-full rounded-xl bg-[#c9964f] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-5 sm:font-semibold"
              >
                Start count
              </button>
            </div>
          </form>

          <div className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Count history
              </h3>
            </div>

            <div className="max-h-[460px] divide-y divide-[#f0e7dc] overflow-y-auto sm:max-h-[620px]">
              {counts.map((count: any) => {
                const lines = count.inventory_count_lines || [];
                const problems = lines.filter((line: any) =>
                  getLineProblem(line)
                );

                return (
                  <div
                    key={count.id}
                    className="px-3.5 py-3 sm:px-6 sm:py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-[#1f1e1b] sm:font-semibold">
                          {count.count_number || count.id.slice(0, 8)}
                        </div>

                        <div className="mt-0.5 truncate text-xs text-[#6c6258] sm:mt-1 sm:text-sm">
                          {getOne(count.warehouse_locations)?.name ||
                            "All warehouse"}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                          count.status
                        )}`}
                      >
                        {prettyStatus(count.status)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] sm:mt-3 sm:gap-2 sm:text-xs">
                      <span className="rounded-full bg-[#eaf2f9] px-2.5 py-1 font-bold text-[#355879] ring-1 ring-[#cfe0ef] sm:px-3 sm:font-semibold">
                        {lines.length} lines
                      </span>

                      {problems.length > 0 && (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 font-bold text-red-700 ring-1 ring-red-200 sm:px-3 sm:font-semibold">
                          {problems.length} problems
                        </span>
                      )}
                    </div>

                    <div className="mt-2 text-[11px] text-[#8f7f6b] sm:mt-3 sm:text-xs">
                      Started {formatDateTime(count.started_at)}
                    </div>
                  </div>
                );
              })}

              {counts.length === 0 && (
                <div className="px-6 py-12 text-center text-sm text-[#6c6258]">
                  No inventory counts yet.
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          {activeCount ? (
            <>
              <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
                  <div>
                    <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                      Active count: {activeCount.count_number}
                    </h3>

                    <p className="mt-0.5 text-xs text-[#6c6258] sm:mt-1 sm:text-sm">
                      {getOne(activeCount.warehouse_locations)?.name ||
                        "All warehouse"}{" "}
                      · Started {formatDateTime(activeCount.started_at)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <form action={completeInventoryCountAction}>
                      <input
                        type="hidden"
                        name="countId"
                        value={activeCount.id}
                      />
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800 sm:w-auto sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                      >
                        Complete
                      </button>
                    </form>

                    <form action={cancelInventoryCountAction}>
                      <input
                        type="hidden"
                        name="countId"
                        value={activeCount.id}
                      />
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-red-700 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-red-800 sm:w-auto sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
                      >
                        Cancel
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              <div className="block space-y-2.5 p-2.5 sm:hidden">
                {activeLines.map((line: any) => {
                  const item = Array.isArray(line.inventory_items)
                    ? line.inventory_items[0]
                    : line.inventory_items;

                  const unit = Array.isArray(line.inventory_units)
                    ? line.inventory_units[0]
                    : line.inventory_units;

                  const problem = getLineProblem(line);

                  return (
                    <div
                      key={line.id}
                      className={[
                        "rounded-[16px] border p-3",
                        problem
                          ? "border-red-200 bg-red-50/40"
                          : "border-[#eee5d9] bg-[#fcfaf7]",
                      ].join(" ")}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-[#1f1e1b]">
                            {item?.name || "Inventory item"}
                          </div>

                          <div className="mt-0.5 text-[11px] text-[#8f7f6b]">
                            {unit?.unit_code
                              ? `Unit ${unit.unit_code}`
                              : item?.tracking_type || "quantity"}
                          </div>
                        </div>

                        {problem && (
                          <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700 ring-1 ring-red-200">
                            Problem
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                            Expected
                          </div>
                          <div className="mt-0.5 text-sm font-bold text-[#1f1e1b]">
                            {line.expected_quantity || 0}
                          </div>
                        </div>

                        <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                            Counted
                          </div>

                          <form
                            id={`line-mobile-${line.id}`}
                            action={updateInventoryCountLineAction}
                          >
                            <input
                              type="hidden"
                              name="countId"
                              value={activeCount.id}
                            />
                            <input
                              type="hidden"
                              name="lineId"
                              value={line.id}
                            />
                            <input
                              type="hidden"
                              name="expectedQuantity"
                              value={line.expected_quantity || 0}
                            />

                            <Input
                              name="countedQuantity"
                              type="number"
                              defaultValue={line.counted_quantity || 0}
                              className="mt-1 px-2 py-1.5 text-right text-xs"
                            />
                          </form>
                        </div>

                        <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                          <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                            Diff
                          </div>
                          <div
                            className={[
                              "mt-0.5 text-sm font-bold",
                              Number(line.difference_quantity || 0) === 0
                                ? "text-emerald-700"
                                : "text-red-700",
                            ].join(" ")}
                          >
                            {line.difference_quantity || 0}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                            Expected status
                          </div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClass(
                              line.expected_status
                            )}`}
                          >
                            {prettyStatus(line.expected_status)}
                          </span>
                        </div>

                        <Field label="Counted status">
                          <Select
                            name="countedStatus"
                            defaultValue={line.counted_status || ""}
                            form={`line-mobile-${line.id}`}
                          >
                            <option value="">No status</option>
                            {statuses.map((status) => (
                              <option key={status} value={status}>
                                {prettyStatus(status)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>

                      <div className="mt-2">
                        <Field label="Notes">
                          <Input
                            name="notes"
                            defaultValue={line.notes || ""}
                            placeholder="Missing, damaged, extra..."
                            form={`line-mobile-${line.id}`}
                          />
                        </Field>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between gap-3">
                        {item?.id ? (
                          <a
                            href={`/admin/inventory/items/${item.id}`}
                            className="text-[11px] font-bold text-[#c9964f]"
                          >
                            Open item
                          </a>
                        ) : (
                          <span />
                        )}

                        <button
                          type="submit"
                          form={`line-mobile-${line.id}`}
                          className="rounded-xl bg-[#23313f] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#18222d]"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                })}

                {activeLines.length === 0 && (
                  <div className="px-4 py-10 text-center">
                    <div className="text-base font-bold text-[#1f1e1b]">
                      No count lines
                    </div>

                    <p className="mt-1 text-sm text-[#6c6258]">
                      Start another count or check inventory items.
                    </p>
                  </div>
                )}
              </div>

              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[1080px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#eee5d9] bg-[#fcfaf7] text-left text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                      <th className="px-5 py-4">Item / unit</th>
                      <th className="px-5 py-4 text-right">Expected</th>
                      <th className="px-5 py-4 text-right">Counted</th>
                      <th className="px-5 py-4 text-right">Diff</th>
                      <th className="px-5 py-4">Expected status</th>
                      <th className="px-5 py-4">Counted status</th>
                      <th className="px-5 py-4">Notes</th>
                      <th className="px-5 py-4 text-right">Save</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#f0e7dc]">
                    {activeLines.map((line: any) => {
                      const item = Array.isArray(line.inventory_items)
                        ? line.inventory_items[0]
                        : line.inventory_items;

                      const unit = Array.isArray(line.inventory_units)
                        ? line.inventory_units[0]
                        : line.inventory_units;

                      const problem = getLineProblem(line);

                      return (
                        <tr
                          key={line.id}
                          className={
                            problem ? "bg-red-50/35" : "hover:bg-[#fcfaf7]"
                          }
                        >
                          <td className="px-5 py-4">
                            <div className="font-semibold text-[#1f1e1b]">
                              {item?.name || "Inventory item"}
                            </div>

                            <div className="mt-1 text-xs text-[#8f7f6b]">
                              {unit?.unit_code
                                ? `Unit ${unit.unit_code}`
                                : item?.tracking_type || "quantity"}
                            </div>

                            {item?.id && (
                              <a
                                href={`/admin/inventory/items/${item.id}`}
                                className="mt-1 inline-flex text-xs font-semibold text-[#c9964f] hover:text-[#9a723e]"
                              >
                                Open item
                              </a>
                            )}
                          </td>

                          <td className="px-5 py-4 text-right font-semibold text-[#1f1e1b]">
                            {line.expected_quantity || 0}
                          </td>

                          <td className="px-5 py-4">
                            <form
                              id={`line-${line.id}`}
                              action={updateInventoryCountLineAction}
                            >
                              <input
                                type="hidden"
                                name="countId"
                                value={activeCount.id}
                              />
                              <input
                                type="hidden"
                                name="lineId"
                                value={line.id}
                              />
                              <input
                                type="hidden"
                                name="expectedQuantity"
                                value={line.expected_quantity || 0}
                              />

                              <Input
                                name="countedQuantity"
                                type="number"
                                defaultValue={line.counted_quantity || 0}
                                className="text-right"
                              />
                            </form>
                          </td>

                          <td className="px-5 py-4 text-right">
                            <span
                              className={[
                                "font-semibold",
                                Number(line.difference_quantity || 0) === 0
                                  ? "text-emerald-700"
                                  : "text-red-700",
                              ].join(" ")}
                            >
                              {line.difference_quantity || 0}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                                line.expected_status
                              )}`}
                            >
                              {prettyStatus(line.expected_status)}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <Select
                              name="countedStatus"
                              defaultValue={line.counted_status || ""}
                              form={`line-${line.id}`}
                            >
                              <option value="">No status</option>
                              {statuses.map((status) => (
                                <option key={status} value={status}>
                                  {prettyStatus(status)}
                                </option>
                              ))}
                            </Select>
                          </td>

                          <td className="px-5 py-4">
                            <Input
                              name="notes"
                              defaultValue={line.notes || ""}
                              placeholder="Missing, damaged, extra..."
                              form={`line-${line.id}`}
                            />
                          </td>

                          <td className="px-5 py-4 text-right">
                            <button
                              type="submit"
                              form={`line-${line.id}`}
                              className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#18222d]"
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {activeLines.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-16 text-center">
                          <div className="text-lg font-semibold text-[#1f1e1b]">
                            No count lines
                          </div>

                          <p className="mt-2 text-sm text-[#6c6258]">
                            Start another count or check inventory items.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="px-6 py-14 text-center sm:py-20">
              <div className="text-lg font-semibold text-[#1f1e1b]">
                No active inventory count
              </div>

              <p className="mt-2 text-sm text-[#6c6258]">
                Start a new count from the left panel.
              </p>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { writeOffUnitAction } from "../actions";

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  if (!status) {
    return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
  }

  if (["available", "returned"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (["reserved", "picked", "loaded", "installed"].includes(status)) {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (["cleaning", "maintenance"].includes(status)) {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  if (["damaged", "lost", "retired"].includes(status)) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
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

export default async function InventoryWriteOffsPage() {
  const supabase = await createClient();

  const [unitsResult, adjustmentsResult] = await Promise.all([
    supabase
      .from("inventory_units")
      .select(
        `
        id,
        unit_code,
        status,
        condition,
        inventory_items (
          id,
          name,
          sku,
          tracking_type
        ),
        warehouse_locations (
          id,
          name,
          location_type
        )
      `
      )
      .not("status", "in", "(retired,lost)")
      .order("unit_code", { ascending: true }),

    supabase
      .from("inventory_adjustments")
      .select(
        `
        id,
        adjustment_type,
        quantity_change,
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
          unit_code
        )
      `
      )
      .in("adjustment_type", ["write_off", "loss", "damage"])
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (unitsResult.error) throw new Error(unitsResult.error.message);
  if (adjustmentsResult.error) throw new Error(adjustmentsResult.error.message);

  const units = unitsResult.data || [];
  const adjustments = adjustmentsResult.data || [];

  const activeUnits = units.filter(
    (unit: any) => !["retired", "lost"].includes(unit.status)
  );

  const availableUnits = activeUnits.filter((unit: any) =>
    ["available", "returned"].includes(unit.status)
  );

  const outUnits = activeUnits.filter((unit: any) =>
    ["reserved", "picked", "loaded", "installed"].includes(unit.status)
  );

  const problemUnits = activeUnits.filter((unit: any) =>
    ["cleaning", "maintenance", "damaged"].includes(unit.status)
  );

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white px-4 py-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:px-6 sm:py-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between xl:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Warehouse write-offs
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Write-offs
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Списание, потеря, повреждение или перевод оборудования в ремонт.
              Все действия записываются в складской журнал.
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

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Active units
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {activeUnits.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Available
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {availableUnits.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Out / rented
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#8a6b20] sm:mt-2 sm:text-3xl sm:font-semibold">
            {outUnits.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-red-100 bg-red-50 p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">
            Problems
          </div>
          <div className="mt-1.5 text-2xl font-bold text-red-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {problemUnits.length}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <main className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
              Active equipment
            </h3>
            <p className="mt-0.5 text-xs text-[#6c6258] sm:mt-1 sm:text-sm">
              Выбери unit справа в форме и зафиксируй списание или проблему.
            </p>
          </div>

          <div className="block space-y-2.5 p-2.5 sm:hidden">
            {activeUnits.map((unit: any) => (
              <div
                key={unit.id}
                className="rounded-[16px] border border-[#eee5d9] bg-[#fcfaf7] p-3"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[#1f1e1b]">
                      {unit.inventory_items?.name || "Inventory item"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#8f7f6b]">
                      {unit.unit_code || "Unit"} · SKU{" "}
                      {unit.inventory_items?.sku || "—"}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClass(
                      unit.status
                    )}`}
                  >
                    {prettyStatus(unit.status)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#eee5d9] pt-2.5">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                      Location
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[#6c6258]">
                      {unit.warehouse_locations?.name || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                      Condition
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[#6c6258]">
                      {unit.condition || "—"}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {activeUnits.length === 0 && (
              <div className="px-4 py-10 text-center">
                <div className="text-base font-bold text-[#1f1e1b]">
                  No active units
                </div>
                <p className="mt-1 text-sm text-[#6c6258]">
                  Nothing to write off.
                </p>
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#eee5d9] bg-[#fcfaf7] text-left text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                  <th className="px-5 py-4">Unit</th>
                  <th className="px-5 py-4">Item</th>
                  <th className="px-5 py-4">Location</th>
                  <th className="px-5 py-4">Condition</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#f0e7dc]">
                {activeUnits.map((unit: any) => (
                  <tr key={unit.id} className="hover:bg-[#fcfaf7]">
                    <td className="px-5 py-4 font-semibold text-[#1f1e1b]">
                      {unit.unit_code || "Unit"}
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-semibold text-[#1f1e1b]">
                        {unit.inventory_items?.name || "Inventory item"}
                      </div>
                      <div className="mt-1 text-xs text-[#8f7f6b]">
                        SKU: {unit.inventory_items?.sku || "—"}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-[#6c6258]">
                      {unit.warehouse_locations?.name || "—"}
                    </td>

                    <td className="px-5 py-4 text-[#6c6258]">
                      {unit.condition || "—"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                          unit.status
                        )}`}
                      >
                        {prettyStatus(unit.status)}
                      </span>
                    </td>
                  </tr>
                ))}

                {activeUnits.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-14 text-center">
                      <div className="text-lg font-semibold text-[#1f1e1b]">
                        No active units
                      </div>
                      <p className="mt-2 text-sm text-[#6c6258]">
                        Nothing to write off.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>

        <aside className="min-w-0 space-y-4 sm:space-y-6">
          <form
            action={writeOffUnitAction}
            className="min-w-0 overflow-hidden rounded-[20px] border border-red-100 bg-red-50 shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]"
          >
            <div className="border-b border-red-100 px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold text-red-800 sm:text-xl sm:font-semibold">
                Create write-off
              </h3>
              <p className="mt-0.5 text-xs text-red-700/75 sm:mt-1 sm:text-sm">
                Используй для списания, потери или фиксации повреждения.
              </p>
            </div>

            <div className="space-y-3 p-3.5 sm:space-y-4 sm:p-6">
              <Field label="Unit">
                <Select name="unitId" required>
                  <option value="">Choose unit</option>
                  {activeUnits.map((unit: any) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.inventory_items?.name || "Item"} ·{" "}
                      {unit.unit_code || "Unit"} · {prettyStatus(unit.status)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Action">
                <Select name="writeOffStatus" defaultValue="retired">
                  <option value="retired">Retired — списать полностью</option>
                  <option value="lost">Lost — потеряно</option>
                  <option value="damaged">Damaged — повреждено</option>
                  <option value="maintenance">
                    Maintenance — отправить в ремонт
                  </option>
                </Select>
              </Field>

              <Field label="Reason">
                <Input
                  name="reason"
                  placeholder="Torn vinyl, missing item, broken blower..."
                />
              </Field>

              <Field label="Notes">
                <Textarea
                  name="notes"
                  rows={3}
                  placeholder="Details, who reported, event, photos link..."
                />
              </Field>

              <div className="rounded-[16px] bg-white p-3 text-xs leading-5 text-red-700/80 ring-1 ring-red-100 sm:rounded-[22px] sm:p-4 sm:text-sm sm:leading-6">
                <b>Retired</b> и <b>Lost</b> убирают unit из активного склада.
                <br />
                <b>Damaged</b> и <b>Maintenance</b> оставляют unit в системе,
                но помечают как недоступный.
              </div>
            </div>

            <div className="border-t border-red-100 px-3.5 py-3 sm:px-6 sm:py-5">
              <button
                type="submit"
                className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-800 sm:rounded-full sm:px-5 sm:font-semibold"
              >
                Save write-off
              </button>
            </div>
          </form>

          <div className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Recent write-offs
              </h3>
            </div>

            <div className="max-h-[420px] divide-y divide-[#f0e7dc] overflow-y-auto sm:max-h-[520px]">
              {adjustments.map((adjustment: any) => (
                <div
                  key={adjustment.id}
                  className="px-3.5 py-3 sm:px-6 sm:py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[#1f1e1b] sm:font-semibold">
                        {adjustment.inventory_items?.name || "Inventory item"}
                      </div>
                      <div className="mt-0.5 text-xs text-[#6c6258] sm:mt-1 sm:text-sm">
                        {adjustment.inventory_units?.unit_code || "Unit"}
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                        adjustment.to_status
                      )}`}
                    >
                      {prettyStatus(adjustment.to_status)}
                    </span>
                  </div>

                  <div className="mt-2 text-[11px] text-[#8f7f6b] sm:text-xs">
                    {prettyStatus(adjustment.adjustment_type)} ·{" "}
                    {formatDateTime(adjustment.created_at)}
                  </div>

                  {(adjustment.reason || adjustment.notes) && (
                    <div className="mt-2 rounded-xl bg-[#fcfaf7] p-2.5 text-[11px] leading-4 text-[#6c6258] ring-1 ring-[#eee5d9] sm:mt-3 sm:rounded-2xl sm:p-3 sm:text-xs sm:leading-5">
                      {adjustment.reason && <div>{adjustment.reason}</div>}
                      {adjustment.notes && <div>{adjustment.notes}</div>}
                    </div>
                  )}
                </div>
              ))}

              {adjustments.length === 0 && (
                <div className="px-6 py-12 text-center text-sm text-[#6c6258]">
                  No write-offs yet.
                </div>
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

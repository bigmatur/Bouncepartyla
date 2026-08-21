import { createClient } from "@/lib/supabase/server";
import {
  cancelInventorySupplyAction,
  deleteDraftInventorySupplyAction,
} from "./actions";

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
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

export default async function InventorySuppliesPage() {
  const supabase = await createClient();

  const [suppliesResult, linesResult] = await Promise.all([
    supabase
      .from("inventory_supplies")
      .select(
        `
        id,
        supply_number,
        supplier_name,
        warehouse_location_id,
        received_by,
        currency,
        status,
        supply_date,
        received_at,
        reversed_at,
        notes,
        created_at,
        warehouse_locations (
          id,
          name
        )
      `
      )
      .order("supply_date", { ascending: false })
      .limit(100),

    supabase
      .from("inventory_supply_lines")
      .select("id, supply_id, quantity, total_cost"),
  ]);

  if (suppliesResult.error) {
    throw new Error(suppliesResult.error.message);
  }

  if (linesResult.error) {
    throw new Error(linesResult.error.message);
  }

  const supplies = suppliesResult.data || [];
  const lines = linesResult.data || [];

  const totalsBySupplyId = new Map<
    string,
    {
      linesCount: number;
      totalQty: number;
      totalCost: number;
    }
  >();

  for (const line of lines as any[]) {
    const current = totalsBySupplyId.get(line.supply_id) || {
      linesCount: 0,
      totalQty: 0,
      totalCost: 0,
    };

    current.linesCount += 1;
    current.totalQty += Number(line.quantity || 0);
    current.totalCost += Number(line.total_cost || 0);

    totalsBySupplyId.set(line.supply_id, current);
  }

  const draftCount = supplies.filter((s: any) => s.status === "draft").length;
  const receivedCount = supplies.filter(
    (s: any) => s.status === "received"
  ).length;
  const reversedCount = supplies.filter(
    (s: any) => s.status === "reversed"
  ).length;

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Warehouse documents
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Supplies
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Документы поступления товара на склад. Черновик можно
              редактировать. После приема склад увеличивается, а исправления
              делаются через reverse / adjustment.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a
              href="/admin/inventory"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-center text-xs font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Inventory
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
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Supplies
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {supplies.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Draft
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#8a6b20] sm:mt-2 sm:text-3xl sm:font-semibold">
            {draftCount}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Received
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {receivedCount}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Reversed
          </div>
          <div className="mt-1.5 text-2xl font-bold text-blue-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {reversedCount}
          </div>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
            Supply documents
          </h3>

          <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
            Открой поставку, чтобы добавить строки, принять на склад или сделать
            reverse.
          </p>
        </div>

        <div className="divide-y divide-[#eee5d9]">
          {supplies.map((supply: any) => {
            const totals = totalsBySupplyId.get(supply.id) || {
              linesCount: 0,
              totalQty: 0,
              totalCost: 0,
            };

            const location = Array.isArray(supply.warehouse_locations)
              ? supply.warehouse_locations[0]
              : supply.warehouse_locations;

            return (
              <div
                key={supply.id}
                className="p-3.5 transition hover:bg-[#fcfaf7] sm:p-5"
              >
                <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_140px_140px_160px_130px]">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <a
                        href={`/admin/inventory/supplies/${supply.id}`}
                        className="min-w-0 truncate text-base font-bold text-[#1f1e1b] hover:text-[#9a723e] sm:text-lg sm:font-semibold"
                      >
                        {supply.supply_number || "Supply"}
                      </a>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                          supply.status
                        )}`}
                      >
                        {labelStatus(supply.status)}
                      </span>
                    </div>

                    <div className="mt-1 text-[11px] leading-4 text-[#6c6258] sm:text-sm sm:leading-5">
                      {new Date(supply.supply_date).toLocaleString()} ·{" "}
                      {supply.supplier_name || "No supplier"} ·{" "}
                      {location?.name || "No location"}
                    </div>

                    {supply.notes && (
                      <div className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-[#6c6258] sm:mt-2 sm:text-sm sm:leading-5">
                        {supply.notes}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 xl:contents">
                    <div className="rounded-xl bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] xl:rounded-none xl:bg-transparent xl:p-0 xl:ring-0">
                      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-normal sm:tracking-[0.14em]">
                        Lines
                      </div>
                      <div className="mt-0.5 text-base font-bold text-[#1f1e1b] sm:mt-1 sm:text-lg sm:font-semibold">
                        {totals.linesCount}
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] xl:rounded-none xl:bg-transparent xl:p-0 xl:ring-0">
                      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-normal sm:tracking-[0.14em]">
                        Qty
                      </div>
                      <div className="mt-0.5 text-base font-bold text-[#1f1e1b] sm:mt-1 sm:text-lg sm:font-semibold">
                        {totals.totalQty}
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] xl:rounded-none xl:bg-transparent xl:p-0 xl:ring-0">
                      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-normal sm:tracking-[0.14em]">
                        Total
                      </div>
                      <div className="mt-0.5 break-words text-sm font-bold leading-4 text-[#1f1e1b] sm:mt-1 sm:text-lg sm:font-semibold sm:leading-6">
                        {money(totals.totalCost)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 xl:flex xl:flex-col">
                    <a
                      href={`/admin/inventory/supplies/${supply.id}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#23313f] px-3 text-center text-[11px] font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-4 sm:py-2 sm:text-xs sm:font-semibold"
                    >
                      Open
                    </a>

                    {supply.status === "draft" && (
                      <form action={cancelInventorySupplyAction}>
                        <input
                          type="hidden"
                          name="supplyId"
                          value={supply.id}
                        />
                        <button
                          type="submit"
                          className="min-h-10 w-full rounded-xl border border-[#d8cec0] bg-white px-3 text-[11px] font-bold text-[#6c6258] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-4 sm:py-2 sm:text-xs sm:font-semibold"
                        >
                          Cancel
                        </button>
                      </form>
                    )}

                    {(supply.status === "draft" ||
                      supply.status === "cancelled") && (
                      <form action={deleteDraftInventorySupplyAction}>
                        <input
                          type="hidden"
                          name="supplyId"
                          value={supply.id}
                        />
                        <button
                          type="submit"
                          className="min-h-10 w-full rounded-xl border border-red-200 bg-red-50 px-3 text-[11px] font-bold text-red-700 transition hover:bg-red-100 sm:rounded-full sm:px-4 sm:py-2 sm:text-xs sm:font-semibold"
                        >
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {supplies.length === 0 && (
            <div className="px-6 py-14 text-center sm:py-16">
              <div className="text-lg font-semibold text-[#1f1e1b]">
                No supplies yet
              </div>

              <p className="mt-2 text-sm text-[#6c6258]">
                Create the first supply document.
              </p>

              <a
                href="/admin/inventory/supplies/new"
                className="mt-5 inline-flex rounded-xl bg-[#c9964f] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-6 sm:font-semibold"
              >
                New supply
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

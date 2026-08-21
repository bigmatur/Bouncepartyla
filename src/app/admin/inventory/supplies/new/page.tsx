import { createClient } from "@/lib/supabase/server";
import { createInventorySupplyAction } from "../actions";

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

export default async function NewInventorySupplyPage() {
  const supabase = await createClient();

  const locationsResult = await supabase
    .from("warehouse_locations")
    .select("id, name, active, location_type, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }

  const locations = locationsResult.data || [];

  const nowLocal = new Date();
  const defaultDateValue = new Date(
    nowLocal.getTime() - nowLocal.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 16);

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
              New warehouse document
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              New Supply
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Создай черновик поставки. На следующем экране можно будет добавить
              товары, количество и цены, затем принять поставку на склад.
            </p>
          </div>

          <a
            href="/admin/inventory/supplies"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-4 text-center text-xs font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
          >
            All supplies
          </a>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
              Supply header
            </h3>

            <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
              Общая информация о поставке.
            </p>
          </div>

          <form action={createInventorySupplyAction} className="space-y-3.5 sm:space-y-6">
            <div className="grid gap-3.5 p-3.5 sm:gap-5 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                <Field label="Supply date">
                  <Input
                    type="datetime-local"
                    name="supplyDate"
                    defaultValue={defaultDateValue}
                  />
                </Field>

                <Field label="Warehouse">
                  <Select name="warehouseLocationId" defaultValue="">
                    <option value="">No warehouse</option>

                    {locations.map((location: any) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                        {location.location_type
                          ? ` · ${location.location_type}`
                          : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                <Field label="Supplier">
                  <Input
                    name="supplierName"
                    placeholder="Vendor / factory / Amazon / Alibaba..."
                  />
                </Field>

                <Field label="Currency">
                  <Select name="currency" defaultValue="USD">
                    <option value="USD">USD — $</option>
                    <option value="EUR">EUR — €</option>
                    <option value="CNY">CNY — ¥</option>
                    <option value="RUB">RUB — ₽</option>
                  </Select>
                </Field>
              </div>

              <Field label="Employee">
                <Input name="receivedBy" placeholder="Ilias" />
              </Field>

              <Field label="Notes">
                <Textarea
                  name="notes"
                  rows={3}
                  placeholder="Invoice number, shipment notes, supplier comments..."
                />
              </Field>
            </div>

            <div className="border-t border-[#eee5d9] px-3.5 py-3 sm:flex sm:justify-end sm:px-6 sm:py-5">
              <button
                type="submit"
                className="w-full rounded-xl bg-[#c9964f] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_22px_rgba(201,150,79,0.20)] transition hover:bg-[#b78744] sm:w-auto sm:rounded-full sm:px-8 sm:py-4 sm:font-semibold"
              >
                Create supply draft
              </button>
            </div>
          </form>
        </section>

        <aside className="min-w-0">
          <section className="min-w-0 rounded-[20px] border border-black/5 bg-white p-4 shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
              How supplies work
            </h3>

            <div className="mt-3 grid gap-2.5 text-xs leading-5 text-[#6c6258] sm:mt-5 sm:space-y-4 sm:text-sm sm:leading-6">
              <div className="rounded-xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9] sm:rounded-2xl sm:bg-transparent sm:p-0 sm:ring-0">
                <strong className="text-[#1f1e1b]">Draft</strong> можно
                редактировать: добавлять строки, менять количество, цену и
                удалять позиции.
              </div>

              <div className="rounded-xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9] sm:rounded-2xl sm:bg-transparent sm:p-0 sm:ring-0">
                <strong className="text-[#1f1e1b]">Receive stock</strong>{" "}
                применяет поставку к складу: создает units или увеличивает
                quantity.
              </div>

              <div className="rounded-xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9] sm:rounded-2xl sm:bg-transparent sm:p-0 sm:ring-0">
                После приема поставку нельзя просто удалить. Ошибки исправляются
                через reverse / adjustment, чтобы история склада оставалась
                честной.
              </div>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

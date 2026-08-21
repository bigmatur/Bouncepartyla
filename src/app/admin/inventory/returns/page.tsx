import { createClient } from "@/lib/supabase/server";
import { processReturnAction } from "./actions";

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  if (!status) return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";

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

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
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

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
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

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
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
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

export default async function InventoryReturnsPage() {
  const supabase = await createClient();

  const [reservationsResult, locationsResult, returnedMovementsResult] =
    await Promise.all([
      supabase
        .from("inventory_reservations")
        .select(
          `
          id,
          status,
          quantity,
          reserved_from,
          reserved_until,
          picked_at,
          loaded_at,
          installed_at,
          picked_up_at,
          returned_at,
          damage_reported,
          damage_notes,
          inventory_items (
            id,
            name,
            sku,
            tracking_type
          ),
          inventory_units (
            id,
            unit_code,
            status,
            condition,
            warehouse_locations (
              id,
              name
            )
          ),
          bookings (
            id,
            booking_number,
            event_date,
            event_start_time,
            event_end_time,
            setup_city,
            setup_zip,
            customers (
              id,
              full_name,
              phone,
              email
            )
          )
        `
        )
        .in("status", ["picked", "loaded", "installed"])
        .is("returned_at", null)
        .order("reserved_until", { ascending: true })
        .limit(100),

      supabase
        .from("warehouse_locations")
        .select("id, name, slug, location_type")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),

      supabase
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
            unit_code
          ),
          bookings (
            id,
            booking_number,
            customers (
              id,
              full_name
            )
          )
        `
        )
        .in("movement_type", [
          "return_to_warehouse",
          "send_to_cleaning",
          "send_to_repair",
        ])
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  if (reservationsResult.error) {
    throw new Error(reservationsResult.error.message);
  }

  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }

  if (returnedMovementsResult.error) {
    throw new Error(returnedMovementsResult.error.message);
  }

  const reservations = reservationsResult.data || [];
  const locations = locationsResult.data || [];
  const returnedMovements = returnedMovementsResult.data || [];

  const pickedUp = reservations.filter((row: any) => row.picked_up_at);
  const installed = reservations.filter((row: any) => row.status === "installed");
  const loaded = reservations.filter((row: any) => row.status === "loaded");
  const picked = reservations.filter((row: any) => row.status === "picked");

  const defaultReturnLocation =
    locations.find((row: any) => row.slug === "receiving-area") ||
    locations.find((row: any) => row.slug === "main-warehouse") ||
    locations[0];

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white px-4 py-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:px-6 sm:py-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Rental returns
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Returns
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Возврат оборудования после заказа: принять на склад, отправить на
              чистку, ремонт или сразу сделать доступным. После обработки
              позиция пропадает из этого списка.
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
            Need processing
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">
            {reservations.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Picked up
          </div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">
            {pickedUp.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Installed
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#8a6b20]">
            {installed.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Loaded
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#355879]">
            {loaded.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Picked
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">
            {picked.length}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0 space-y-3 sm:space-y-5">
          {reservations.map((reservation: any) => {
            const booking = getOne(reservation.bookings);
            const customer = getOne(booking?.customers);
            const item = getOne(reservation.inventory_items);
            const unit = getOne(reservation.inventory_units);

            return (
              <section
                key={reservation.id}
                className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]"
              >
                <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="p-3.5 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                          reservation.status
                        )}`}
                      >
                        {prettyStatus(reservation.status)}
                      </span>

                      {reservation.picked_up_at && (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          Picked up {formatDateTime(reservation.picked_up_at)}
                        </span>
                      )}

                      <span className="rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold text-[#9a723e] ring-1 ring-[#e3d3bb]">
                        Until {formatDateTime(reservation.reserved_until)}
                      </span>
                    </div>

                    <h3 className="mt-3 text-lg font-bold tracking-tight text-[#1f1e1b] sm:mt-4 sm:text-xl sm:font-semibold">
                      {item?.name || "Inventory item"}
                    </h3>

                    <div className="mt-1 text-sm text-[#6c6258]">
                      {unit?.unit_code
                        ? `Unit ${unit.unit_code}`
                        : `Qty ${reservation.quantity || 1}`}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-4 md:grid-cols-3">
                      <div className="min-w-0 rounded-xl bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] sm:rounded-2xl sm:p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                          Booking
                        </div>

                        <a
                          href={
                            booking?.id
                              ? `/admin/bookings/${booking.id}`
                              : "/admin/bookings"
                          }
                          className="mt-2 block font-semibold text-[#1f1e1b] hover:text-[#c9964f]"
                        >
                          #
                          {booking?.booking_number ||
                            booking?.id?.slice(0, 8) ||
                            "—"}
                        </a>

                        <div className="mt-1 text-xs text-[#6c6258]">
                          {formatDate(booking?.event_date)}
                        </div>
                      </div>

                      <div className="min-w-0 rounded-xl bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] sm:rounded-2xl sm:p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                          Customer
                        </div>

                        <div className="mt-2 font-semibold text-[#1f1e1b]">
                          {customer?.full_name || "No client"}
                        </div>

                        <div className="mt-1 text-xs text-[#6c6258]">
                          {customer?.phone || customer?.email || "—"}
                        </div>
                      </div>

                      <div className="min-w-0 rounded-xl bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] sm:rounded-2xl sm:p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                          Unit status
                        </div>

                        <div className="mt-2 font-semibold text-[#1f1e1b]">
                          {prettyStatus(unit?.status)}
                        </div>

                        <div className="mt-1 text-xs text-[#6c6258]">
                          {unit?.warehouse_locations?.name || "No location"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <form
                    action={processReturnAction}
                    className="border-t border-[#eee5d9] bg-[#fcfaf7] p-3.5 sm:p-6 xl:border-l xl:border-t-0"
                  >
                    <input
                      type="hidden"
                      name="reservationId"
                      value={reservation.id}
                    />
                    <input type="hidden" name="itemId" value={item?.id || ""} />
                    <input type="hidden" name="unitId" value={unit?.id || ""} />
                    <input
                      type="hidden"
                      name="bookingId"
                      value={booking?.id || ""}
                    />
                    <input
                      type="hidden"
                      name="currentStatus"
                      value={reservation.status || ""}
                    />

                    <h4 className="font-semibold text-[#1f1e1b]">
                      Process return
                    </h4>

                    <div className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
                      <Field label="Result status">
                        <Select name="resultStatus" defaultValue="returned">
                          <option value="available">Available — ready now</option>
                          <option value="returned">Returned — waiting check</option>
                          <option value="cleaning">Cleaning — needs cleaning</option>
                          <option value="maintenance">
                            Maintenance — repair needed
                          </option>
                          <option value="damaged">Damaged — damage reported</option>
                        </Select>
                      </Field>

                      <Field label="Return location">
                        <Select
                          name="locationId"
                          defaultValue={defaultReturnLocation?.id || ""}
                        >
                          <option value="">No location</option>
                          {locations.map((location: any) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <label className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-[#eee5d9]">
                        <span className="text-sm font-semibold text-[#1f1e1b]">
                          Damage reported
                        </span>
                        <input
                          name="damageReported"
                          type="checkbox"
                          className="h-5 w-5 rounded border-[#d8cec0]"
                        />
                      </label>

                      <Field label="Damage notes">
                        <Textarea
                          name="damageNotes"
                          rows={3}
                          placeholder="Tear, wet, missing part..."
                        />
                      </Field>

                      <Field label="Return notes">
                        <Input
                          name="notes"
                          placeholder="Driver notes, cleaning required..."
                        />
                      </Field>

                      <button
                        type="submit"
                        className="w-full rounded-xl bg-[#c9964f] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-5 sm:font-semibold"
                      >
                        Save return
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            );
          })}

          {reservations.length === 0 && (
            <div className="rounded-[30px] border border-black/5 bg-white px-6 py-16 text-center shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
              <div className="text-lg font-semibold text-[#1f1e1b]">
                No rental items waiting for return processing
              </div>

              <p className="mt-2 text-sm text-[#6c6258]">
                Items will appear here after they are picked, loaded or
                installed, and will disappear after Save return.
              </p>
            </div>
          )}
        </main>

        <aside className="min-w-0 space-y-4 sm:space-y-6">
          <div className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Recent returns
              </h3>
            </div>

            <div className="max-h-[720px] overflow-y-auto divide-y divide-[#f0e7dc]">
              {returnedMovements.map((movement: any) => {
                const booking = getOne(movement.bookings);
                const customer = getOne(booking?.customers);

                return (
                  <div key={movement.id} className="px-3.5 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[#1f1e1b]">
                          {movement.inventory_items?.name || "Inventory item"}
                        </div>

                        <div className="mt-1 text-sm text-[#6c6258]">
                          {movement.inventory_units?.unit_code
                            ? `Unit ${movement.inventory_units.unit_code}`
                            : `Qty ${movement.quantity || 1}`}
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                          movement.to_status
                        )}`}
                      >
                        {prettyStatus(movement.to_status)}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-[#8f7f6b]">
                      {prettyStatus(movement.movement_type)} ·{" "}
                      {formatDateTime(movement.created_at)}
                    </div>

                    {booking?.id && (
                      <a
                        href={`/admin/bookings/${booking.id}`}
                        className="mt-2 block text-xs font-semibold text-[#c9964f] hover:text-[#9a723e]"
                      >
                        Booking #
                        {booking.booking_number || booking.id.slice(0, 8)}
                        {customer?.full_name ? ` · ${customer.full_name}` : ""}
                      </a>
                    )}
                  </div>
                );
              })}

              {returnedMovements.length === 0 && (
                <div className="px-6 py-12 text-center text-sm text-[#6c6258]">
                  No returns yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[20px] border border-black/5 bg-[#23313f] p-4 text-white shadow-[0_8px_26px_rgba(0,0,0,0.05)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
            <h3 className="text-lg font-semibold">Return statuses</h3>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs leading-5 text-white/65 sm:mt-4 sm:block sm:space-y-3 sm:text-sm sm:leading-6">
              <p>
                <b className="text-white">Available</b> — проверено, можно снова
                сдавать.
              </p>
              <p>
                <b className="text-white">Returned</b> — вернулось, но еще не
                проверено.
              </p>
              <p>
                <b className="text-white">Cleaning</b> — нужно чистить или
                сушить.
              </p>
              <p>
                <b className="text-white">Maintenance</b> — нужен ремонт.
              </p>
              <p>
                <b className="text-white">Damaged</b> — зафиксировано
                повреждение.
              </p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
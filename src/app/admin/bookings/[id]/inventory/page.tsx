import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  autoReserveBookingItemsAction,
  reserveQuantityItemAction,
  reserveSerializedUnitAction,
  transitionAllReservationsAction,
  transitionSingleReservationAction,
} from "./actions";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

const lifecycleActions = [
  {
    label: "Pick items",
    value: "picked",
    description: "Собрать оборудование под заказ.",
  },
  {
    label: "Load to vehicle",
    value: "loaded",
    description: "Загрузить в машину.",
  },
  {
    label: "Mark installed",
    value: "installed",
    description: "Отметить как установленное у клиента.",
  },
  {
    label: "Picked up",
    value: "picked_up",
    description: "Забрали после праздника. Дальше обработать в Returns.",
  },
];

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

export default async function BookingInventoryPage(props: PageProps) {
  const params = await props.params;
  const bookingId = params.id;
  const supabase = await createClient();

  const [
    bookingResult,
    reservationsResult,
    locationsResult,
    movementsResult,
    inventoryItemsResult,
    inventoryUnitsResult,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `
        id,
        booking_number,
        status,
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
        ),
        booking_items (
          id,
          products (
            id,
            name,
            image_url
          )
        )
      `
      )
      .eq("id", bookingId)
      .single(),

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
          warehouse_location_id,
          condition,
          warehouse_locations (
            id,
            name
          )
        )
      `
      )
      .eq("booking_id", bookingId)
      .order("reserved_from", { ascending: true }),

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
          name
        ),
        inventory_units (
          id,
          unit_code
        ),
        from_location:from_location_id (
          id,
          name
        ),
        to_location:to_location_id (
          id,
          name
        )
      `
      )
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("inventory_items")
      .select(
        `
        id,
        name,
        sku,
        tracking_type,
        quantity_available,
        active
      `
      )
      .eq("active", true)
      .order("name", { ascending: true }),

    supabase
      .from("inventory_units")
      .select(
        `
        id,
        inventory_item_id,
        unit_code,
        status,
        condition,
        warehouse_location_id,
        inventory_items (
          id,
          name,
          sku
        ),
        warehouse_locations (
          id,
          name
        )
      `
      )
      .in("status", ["available", "returned"])
      .order("unit_code", { ascending: true }),
  ]);

  if (bookingResult.error || !bookingResult.data) {
    notFound();
  }

  if (reservationsResult.error) throw new Error(reservationsResult.error.message);
  if (locationsResult.error) throw new Error(locationsResult.error.message);
  if (movementsResult.error) throw new Error(movementsResult.error.message);
  if (inventoryItemsResult.error) throw new Error(inventoryItemsResult.error.message);
  if (inventoryUnitsResult.error) throw new Error(inventoryUnitsResult.error.message);

  const booking = bookingResult.data as any;
  const customer = getOne(booking.customers);
  const reservations = reservationsResult.data || [];
  const locations = locationsResult.data || [];
  const movements = movementsResult.data || [];
  const inventoryItems = inventoryItemsResult.data || [];
  const inventoryUnits = inventoryUnitsResult.data || [];

  const serializedItems = inventoryItems.filter((item: any) =>
    ["serialized", "kit"].includes(item.tracking_type)
  );

  const quantityItems = inventoryItems.filter((item: any) =>
    ["quantity", "consumable"].includes(item.tracking_type)
  );

  const defaultVehicle =
    locations.find((row: any) => row.slug === "van-1") ||
    locations.find((row: any) => row.location_type === "vehicle") ||
    locations[0];

  const customerSite =
    locations.find((row: any) => row.slug === "customer-site") ||
    locations.find((row: any) => row.location_type === "customer_site");

  const receivingArea =
    locations.find((row: any) => row.slug === "receiving-area") ||
    locations.find((row: any) => row.slug === "main-warehouse") ||
    locations[0];

  return (
    <div className="min-h-screen bg-[#f5efe6] p-4 text-[#1d1d1b] lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="rounded-[32px] border border-black/5 bg-white px-6 py-5 shadow-[0_18px_70px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <a
                href={`/admin/bookings/${booking.id}`}
                className="text-sm font-semibold text-[#9a723e] hover:text-[#7f633a]"
              >
                ← Back to booking
              </a>

              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
                Booking inventory lifecycle
              </div>

              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
                Booking #{booking.booking_number || booking.id.slice(0, 8)}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
                {customer?.full_name || "No client"} · {formatDate(booking.event_date)} ·{" "}
                {booking.setup_city || "No city"} {booking.setup_zip || ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href="/admin/inventory"
                className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
              >
                Inventory
              </a>

              <a
                href="/admin/inventory/returns"
                className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
              >
                Returns
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              Reservations
            </div>
            <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">
              {reservations.length}
            </div>
          </div>

          {["reserved", "picked", "loaded", "installed"].map((status) => (
            <div
              key={status}
              className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.03)]"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                {prettyStatus(status)}
              </div>
              <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">
                {
                  reservations.filter((reservation: any) => reservation.status === status)
                    .length
                }
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <aside className="space-y-6">
            <div className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
              <div className="border-b border-[#eee5d9] px-6 py-5">
                <h3 className="text-xl font-semibold text-[#1f1e1b]">
                  Reserve inventory
                </h3>

                <p className="mt-1 text-sm text-[#6c6258]">
                  Привязать складскую позицию к этому заказу.
                </p>
              </div>

              <div className="space-y-5 p-6">
                            <form
              action={autoReserveBookingItemsAction}
              className="rounded-[30px] border border-black/5 bg-[#23313f] p-6 text-white shadow-[0_12px_40px_rgba(0,0,0,0.06)]"
            >
              <input type="hidden" name="bookingId" value={booking.id} />

              <h3 className="text-xl font-semibold">
                Auto reserve from booking
              </h3>

              <p className="mt-2 text-sm leading-6 text-white/65">
                Система возьмет booking items, найдет связанные inventory items
                через Product → Inventory Link и автоматически создаст складские
                reservations.
              </p>

              <div className="mt-5 space-y-3">
                <Field label="Default location">
                  <Select name="locationId" defaultValue={locations[0]?.id || ""}>
                    <option value="">No location</option>
                    {locations.map((location: any) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Notes">
                  <Input
                    name="notes"
                    placeholder="Auto reserved from booking items..."
                  />
                </Field>

                <button
                  type="submit"
                  className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
                >
                  Auto reserve from booking items
                </button>
              </div>

              <div className="mt-4 rounded-2xl bg-white/10 p-4 text-xs leading-5 text-white/65">
                Перед этим проверь страницу{" "}
                <a
                  href="/admin/catalog/inventory-links"
                  className="font-semibold text-white underline"
                >
                  Product → Inventory Links
                </a>
                , иначе продукты без связи будут пропущены.
              </div>
            </form>

                <form
                  action={reserveQuantityItemAction}
                  className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-4"
                >
                  <input type="hidden" name="bookingId" value={booking.id} />

                  <div className="font-semibold text-[#1f1e1b]">
                    Reserve quantity item
                  </div>

                  <div className="mt-4 space-y-3">
                    <Field label="Quantity item">
                      <Select name="itemId" required>
                        <option value="">Choose item</option>
                        {quantityItems.map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · available {item.quantity_available || 0}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field label="Quantity">
                      <Input name="quantity" type="number" defaultValue="1" />
                    </Field>

                    <Field label="Location">
                      <Select name="locationId">
                        <option value="">No location</option>
                        {locations.map((location: any) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field label="Notes">
                      <Input name="notes" placeholder="Balls, supplies..." />
                    </Field>

                    <button
                      type="submit"
                      className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                    >
                      Reserve quantity
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
              <div className="border-b border-[#eee5d9] px-6 py-5">
                <h3 className="text-xl font-semibold text-[#1f1e1b]">
                  Bulk lifecycle actions
                </h3>
              </div>

              <div className="space-y-4 p-6">
                {lifecycleActions.map((action) => {
                  const defaultLocation =
                    action.value === "loaded"
                      ? defaultVehicle
                      : action.value === "installed"
                        ? customerSite
                        : action.value === "picked_up"
                          ? receivingArea
                          : locations[0];

                  return (
                    <form
                      key={action.value}
                      action={transitionAllReservationsAction}
                      className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-4"
                    >
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <input type="hidden" name="targetStatus" value={action.value} />

                      <div className="font-semibold text-[#1f1e1b]">
                        {action.label}
                      </div>

                      <p className="mt-1 text-sm text-[#6c6258]">
                        {action.description}
                      </p>

                      <div className="mt-3 space-y-3">
                        <Field label="Location">
                          <Select
                            name="locationId"
                            defaultValue={defaultLocation?.id || ""}
                          >
                            <option value="">No location</option>
                            {locations.map((location: any) => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field label="Notes">
                          <Input name="notes" placeholder="Driver, van, route..." />
                        </Field>

                        <button
                          type="submit"
                          className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                        >
                          {action.label}
                        </button>
                      </div>
                    </form>
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
              <div className="border-b border-[#eee5d9] px-6 py-5">
                <h3 className="text-xl font-semibold text-[#1f1e1b]">
                  Reserved inventory
                </h3>

                <p className="mt-1 text-sm text-[#6c6258]">
                  Каждую позицию можно двигать отдельно.
                </p>
              </div>

              <div className="divide-y divide-[#f0e7dc]">
                {reservations.map((reservation: any) => {
                  const item = getOne(reservation.inventory_items);
                  const unit = getOne(reservation.inventory_units);

                  return (
                    <div
                      key={reservation.id}
                      className="grid gap-5 px-6 py-5 xl:grid-cols-[1fr_360px]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                              reservation.status
                            )}`}
                          >
                            Reservation {prettyStatus(reservation.status)}
                          </span>

                          {unit?.status && (
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                                unit.status
                              )}`}
                            >
                              Unit {prettyStatus(unit.status)}
                            </span>
                          )}
                        </div>

                        <h4 className="mt-4 text-lg font-semibold text-[#1f1e1b]">
                          {item?.name || "Inventory item"}
                        </h4>

                        <div className="mt-1 text-sm text-[#6c6258]">
                          {unit?.unit_code
                            ? `Unit ${unit.unit_code}`
                            : `Qty ${reservation.quantity || 1}`}
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]">
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                              Reserved window
                            </div>
                            <div className="mt-2 text-sm text-[#1f1e1b]">
                              {formatDateTime(reservation.reserved_from)}
                            </div>
                            <div className="mt-1 text-sm text-[#1f1e1b]">
                              {formatDateTime(reservation.reserved_until)}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]">
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                              Current location
                            </div>
                            <div className="mt-2 text-sm font-semibold text-[#1f1e1b]">
                              {unit?.warehouse_locations?.name || "—"}
                            </div>
                            <div className="mt-1 text-xs text-[#6c6258]">
                              Condition: {unit?.condition || "—"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 text-xs text-[#8f7f6b] md:grid-cols-2">
                          <div>Picked: {formatDateTime(reservation.picked_at)}</div>
                          <div>Loaded: {formatDateTime(reservation.loaded_at)}</div>
                          <div>Installed: {formatDateTime(reservation.installed_at)}</div>
                          <div>Picked up: {formatDateTime(reservation.picked_up_at)}</div>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-4">
                        <div className="font-semibold text-[#1f1e1b]">
                          Move this item
                        </div>

                        <div className="mt-4 space-y-3">
                          {lifecycleActions.map((action) => {
                            const defaultLocation =
                              action.value === "loaded"
                                ? defaultVehicle
                                : action.value === "installed"
                                  ? customerSite
                                  : action.value === "picked_up"
                                    ? receivingArea
                                    : locations[0];

                            return (
                              <form
                                key={action.value}
                                action={transitionSingleReservationAction}
                              >
                                <input type="hidden" name="bookingId" value={booking.id} />
                                <input
                                  type="hidden"
                                  name="reservationId"
                                  value={reservation.id}
                                />
                                <input
                                  type="hidden"
                                  name="targetStatus"
                                  value={action.value}
                                />
                                <input
                                  type="hidden"
                                  name="locationId"
                                  value={defaultLocation?.id || ""}
                                />

                                <button
                                  type="submit"
                                  className="w-full rounded-full border border-[#d8cec0] bg-white px-4 py-2.5 text-sm font-semibold text-[#23313f] transition hover:bg-[#f5efe6]"
                                >
                                  {action.label}
                                </button>
                              </form>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {reservations.length === 0 && (
                  <div className="px-6 py-16 text-center">
                    <div className="text-lg font-semibold text-[#1f1e1b]">
                      No inventory reservations for this booking
                    </div>

                    <p className="mt-2 text-sm text-[#6c6258]">
                      Use Reserve inventory form to attach warehouse items to this booking.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
              <div className="border-b border-[#eee5d9] px-6 py-5">
                <h3 className="text-xl font-semibold text-[#1f1e1b]">
                  Movement history
                </h3>
              </div>

              <div className="divide-y divide-[#f0e7dc]">
                {movements.map((movement: any) => (
                  <div
                    key={movement.id}
                    className="grid gap-4 px-6 py-4 md:grid-cols-[1fr_180px_180px]"
                  >
                    <div>
                      <div className="font-semibold text-[#1f1e1b]">
                        {prettyStatus(movement.movement_type)}
                      </div>
                      <div className="mt-1 text-sm text-[#6c6258]">
                        {movement.inventory_items?.name || "Item"}{" "}
                        {movement.inventory_units?.unit_code
                          ? `· ${movement.inventory_units.unit_code}`
                          : ""}
                      </div>
                      {movement.reason && (
                        <div className="mt-1 text-xs text-[#8f7f6b]">
                          {movement.reason}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                        Status
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
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
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                        Date
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                        {formatDateTime(movement.created_at)}
                      </div>
                      <div className="mt-1 text-xs text-[#6c6258]">
                        To: {movement.to_location?.name || "—"}
                      </div>
                    </div>
                  </div>
                ))}

                {movements.length === 0 && (
                  <div className="px-6 py-12 text-center text-sm text-[#6c6258]">
                    No booking inventory movements yet.
                  </div>
                )}
              </div>
            </section>
          </main>
        </section>
      </div>
    </div>
  );
}
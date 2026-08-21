import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  createBookingRouteStopsAction,
  deleteBookingRouteStopAction,
} from "./actions";

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function timeValue(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function formatTime(value: string | null | undefined) {
  const cleanValue = timeValue(value);

  if (!cleanValue) return "Any time";

  const date = new Date(`2000-01-01T${cleanValue}:00`);

  if (Number.isNaN(date.getTime())) return cleanValue;

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No date";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "No date";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function stopTypeLabel(value: string | null | undefined) {
  if (value === "delivery") return "Delivery";
  if (value === "pickup") return "Pickup";
  if (value === "service") return "Service";
  if (value === "warehouse") return "Warehouse";
  return "Other";
}

function statusLabel(value: string | null | undefined) {
  if (value === "scheduled") return "Scheduled";
  if (value === "on_the_way") return "On the way";
  if (value === "arrived") return "Arrived";
  if (value === "installed") return "Installed";
  if (value === "picked_up") return "Picked up";
  if (value === "completed") return "Completed";
  if (value === "failed") return "Failed";
  if (value === "cancelled") return "Cancelled";
  return "Scheduled";
}

function mapUrl(stop: any) {
  const address = [stop.address, stop.city, stop.state, stop.zip]
    .filter(Boolean)
    .join(", ");

  if (!address) return "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
}

function safeBookingNumber(booking: any) {
  return (
    booking?.booking_number ||
    booking?.reference_number ||
    booking?.confirmation_number ||
    booking?.id?.slice(0, 8) ||
    "Booking"
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
        {label}
      </span>

      {children}

      {hint && <span className="mt-1 block text-xs text-[#8b8177]">{hint}</span>}
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

function StatusBadge({ value }: { value: string | null | undefined }) {
  const isDone = ["installed", "picked_up", "completed"].includes(
    String(value || "")
  );

  const isProblem = ["failed", "cancelled"].includes(String(value || ""));

  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1",
        isProblem
          ? "bg-red-50 text-red-700 ring-red-200"
          : isDone
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-blue-50 text-blue-700 ring-blue-200",
      ].join(" ")}
    >
      {statusLabel(value)}
    </span>
  );
}

export default async function BookingRoutesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ notice?: string }>;
}) {
  const { id: bookingId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const notice = String(resolvedSearchParams?.notice || "");

  const supabase = await createClient();

  const [bookingResult, routeStopsResult] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle(),

    supabase
      .from("route_stops")
      .select(
        `
        id,
        booking_id,
        stop_date,
        stop_type,
        status,
        customer_name,
        customer_phone,
        address,
        city,
        state,
        zip,
        scheduled_start_time,
        scheduled_end_time,
        driver_name,
        truck_name,
        items_summary,
        surface,
        gate_code,
        parking_notes,
        setup_notes,
        pickup_notes,
        balance_due,
        sort_order,
        arrived_at,
        completed_at,
        created_at,
        updated_at
      `
      )
      .eq("booking_id", bookingId)
      .order("stop_date", { ascending: true })
      .order("scheduled_start_time", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  if (bookingResult.error) {
    throw new Error(bookingResult.error.message);
  }

  if (routeStopsResult.error) {
    throw new Error(routeStopsResult.error.message);
  }

  const booking = bookingResult.data || {};
  const routeStops = routeStopsResult.data || [];

  const hasDelivery = routeStops.some((stop: any) => stop.stop_type === "delivery");
  const hasPickup = routeStops.some((stop: any) => stop.stop_type === "pickup");

  const defaultDate =
    booking.event_date ||
    booking.start_date ||
    booking.delivery_date ||
    todayISO();

  const defaultCustomerName =
    booking.customer_name ||
    booking.client_name ||
    booking.name ||
    "";

  const defaultCustomerPhone =
    booking.customer_phone ||
    booking.client_phone ||
    booking.phone ||
    "";

  const defaultAddress =
    booking.event_address ||
    booking.address ||
    booking.delivery_address ||
    booking.setup_address ||
    "";

  const defaultCity =
    booking.event_city ||
    booking.city ||
    booking.delivery_city ||
    booking.setup_city ||
    "";

  const defaultState =
    booking.event_state ||
    booking.state ||
    booking.delivery_state ||
    booking.setup_state ||
    "CA";

  const defaultZip =
    booking.event_zip ||
    booking.zip ||
    booking.delivery_zip ||
    booking.setup_zip ||
    "";

  const defaultBalanceDue =
    booking.balance_due ||
    booking.remaining_balance ||
    booking.amount_due ||
    0;

  const defaultItemsSummary =
    booking.items_summary ||
    booking.product_summary ||
    booking.selected_products_summary ||
    booking.notes ||
    "";

  const defaultSurface =
    booking.surface ||
    booking.installation_surface ||
    booking.setup_surface ||
    "";

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Booking route stops
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Routes for {safeBookingNumber(booking)}
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Создай delivery и pickup stops для этого бронирования. Система
              больше не даст создать дубли delivery/pickup для одного booking.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`/admin/bookings/${bookingId}`}
              className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              Back to booking
            </a>

            <a
              href={`/admin/bookings/${bookingId}/checklist`}
              className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
            >
              Checklist
            </a>

            <a
              href="/admin/routes"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Route board
            </a>
          </div>
        </div>
      </section>

      {notice === "created" && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">
          Route stops created successfully.
        </section>
      )}

      {notice === "already-exists" && (
        <section className="rounded-2xl border border-[#efd582] bg-[#fff4d8] px-5 py-3 text-sm font-semibold text-[#8a6b20]">
          Delivery / pickup stop already exists for this booking. Duplicate was not created.
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Delivery
          </div>

          <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
            {hasDelivery ? "Created" : "Not created"}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Pickup
          </div>

          <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
            {hasPickup ? "Created" : "Not created"}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Create delivery / pickup
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Можно создать обе остановки сразу или только одну. Уже созданные
              типы будут автоматически пропущены.
            </p>
          </div>

          <form action={createBookingRouteStopsAction} className="space-y-6">
            <input type="hidden" name="bookingId" value={bookingId} />

            <div className="grid gap-4 p-6">
              <div className="grid gap-3 md:grid-cols-2">
                <label
                  className={[
                    "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold",
                    hasDelivery
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-[#d8cec0] bg-white text-[#1f1e1b]",
                  ].join(" ")}
                >
                  <span>{hasDelivery ? "Delivery exists" : "Create delivery"}</span>
                  <input
                    type="checkbox"
                    name="createDelivery"
                    defaultChecked={!hasDelivery}
                    disabled={hasDelivery}
                    className="h-5 w-5"
                  />
                </label>

                <label
                  className={[
                    "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold",
                    hasPickup
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-[#d8cec0] bg-white text-[#1f1e1b]",
                  ].join(" ")}
                >
                  <span>{hasPickup ? "Pickup exists" : "Create pickup"}</span>
                  <input
                    type="checkbox"
                    name="createPickup"
                    defaultChecked={!hasPickup}
                    disabled={hasPickup}
                    className="h-5 w-5"
                  />
                </label>
              </div>

              <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-4">
                <div className="text-sm font-semibold text-[#1f1e1b]">
                  Delivery window
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Date">
                    <Input
                      name="deliveryDate"
                      type="date"
                      defaultValue={defaultDate}
                    />
                  </Field>

                  <Field label="Start">
                    <Input name="deliveryStartTime" type="time" />
                  </Field>

                  <Field label="End">
                    <Input name="deliveryEndTime" type="time" />
                  </Field>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-4">
                <div className="text-sm font-semibold text-[#1f1e1b]">
                  Pickup window
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Date">
                    <Input
                      name="pickupDate"
                      type="date"
                      defaultValue={defaultDate}
                    />
                  </Field>

                  <Field label="Start">
                    <Input name="pickupStartTime" type="time" />
                  </Field>

                  <Field label="End">
                    <Input name="pickupEndTime" type="time" />
                  </Field>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Customer name">
                  <Input
                    name="customerName"
                    defaultValue={defaultCustomerName}
                    placeholder="Customer"
                  />
                </Field>

                <Field label="Phone">
                  <Input
                    name="customerPhone"
                    defaultValue={defaultCustomerPhone}
                    placeholder="Phone"
                  />
                </Field>
              </div>

              <Field label="Address">
                <Input
                  name="address"
                  defaultValue={defaultAddress}
                  placeholder="Street address"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-[1fr_80px_100px]">
                <Field label="City">
                  <Input
                    name="city"
                    defaultValue={defaultCity}
                    placeholder="City"
                  />
                </Field>

                <Field label="State">
                  <Input name="state" defaultValue={defaultState || "CA"} />
                </Field>

                <Field label="ZIP">
                  <Input name="zip" defaultValue={defaultZip} placeholder="ZIP" />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Driver">
                  <Input name="driverName" placeholder="Driver name" />
                </Field>

                <Field label="Truck">
                  <Input name="truckName" placeholder="Truck / van" />
                </Field>
              </div>

              <Field label="Items">
                <Textarea
                  name="itemsSummary"
                  rows={4}
                  defaultValue={defaultItemsSummary}
                  placeholder="White Castle, blower, tarp, extension cord, sandbags..."
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Surface">
                  <Input
                    name="surface"
                    defaultValue={defaultSurface}
                    placeholder="Grass, concrete, turf..."
                  />
                </Field>

                <Field label="Gate code">
                  <Input name="gateCode" placeholder="Gate / access code" />
                </Field>
              </div>

              <Field label="Parking notes">
                <Textarea
                  name="parkingNotes"
                  rows={3}
                  placeholder="Where to park, loading access, entrance..."
                />
              </Field>

              <Field label="Setup notes">
                <Textarea
                  name="setupNotes"
                  rows={3}
                  placeholder="Install notes, ball colors, special instructions..."
                />
              </Field>

              <Field label="Pickup notes">
                <Textarea
                  name="pickupNotes"
                  rows={3}
                  placeholder="Pickup time, where items will be left..."
                />
              </Field>

              <Field label="Balance due">
                <Input
                  name="balanceDue"
                  type="number"
                  step="0.01"
                  defaultValue={defaultBalanceDue || "0"}
                />
              </Field>
            </div>

            <div className="border-t border-[#eee5d9] px-6 py-5">
              <button
                type="submit"
                className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.24)] transition hover:bg-[#b78744]"
              >
                Create missing route stops
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Existing route stops
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Эти остановки уже связаны с этим booking.
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {routeStops.map((stop: any) => {
              const url = mapUrl(stop);

              return (
                <div key={stop.id} className="px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-[#1f1e1b]">
                          {stopTypeLabel(stop.stop_type)} ·{" "}
                          {formatDate(stop.stop_date)}
                        </div>

                        <StatusBadge value={stop.status} />
                      </div>

                      <div className="mt-1 text-sm text-[#6c6258]">
                        {formatTime(stop.scheduled_start_time)}
                        {stop.scheduled_end_time
                          ? ` — ${formatTime(stop.scheduled_end_time)}`
                          : ""}
                      </div>

                      <div className="mt-2 text-sm text-[#1f1e1b]">
                        {[stop.address, stop.city, stop.state, stop.zip]
                          .filter(Boolean)
                          .join(", ") || "No address"}
                      </div>

                      {stop.items_summary && (
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#6c6258]">
                          {stop.items_summary}
                        </div>
                      )}

                      {Number(stop.balance_due || 0) > 0 && (
                        <div className="mt-2 text-sm font-semibold text-[#8a6b20]">
                          Balance due: {money(stop.balance_due)}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col gap-2">
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-[#23313f] px-4 py-2 text-center text-xs font-semibold text-white transition hover:bg-[#18222d]"
                        >
                          Maps
                        </a>
                      )}

                      <a
                        href={`/admin/routes?date=${stop.stop_date}`}
                        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-center text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
                      >
                        Route board
                      </a>

                      <form action={deleteBookingRouteStopAction}>
                        <input type="hidden" name="bookingId" value={bookingId} />
                        <input type="hidden" name="stopId" value={stop.id} />

                        <button
                          type="submit"
                          className="w-full rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}

            {routeStops.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No route stops yet
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Create delivery and pickup stops for this booking.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
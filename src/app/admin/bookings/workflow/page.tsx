import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";

  const cleanValue = String(value).slice(0, 5);
  const date = new Date(`2000-01-01T${cleanValue}:00`);

  if (Number.isNaN(date.getTime())) return cleanValue;

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function statusClass(status: string | null | undefined) {
  const value = String(status || "");

  if (
    [
      "booked",
      "scheduled",
      "inventory_reserved",
      "loaded",
      "out_for_delivery",
      "installed",
      "pickup_scheduled",
      "picked_up",
      "returned",
      "closed",
      "completed",
      "available",
      "paid",
      "signed",
    ].includes(value)
  ) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (
    [
      "draft",
      "quote",
      "pending_deposit",
      "reserved",
      "scheduled",
      "on_the_way",
      "arrived",
      "cleaning",
      "dirty",
      "reported",
      "repair_needed",
      "in_repair",
    ].includes(value)
  ) {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (
    [
      "cancelled",
      "refunded",
      "failed",
      "damaged",
      "missing",
      "lost",
      "retired",
    ].includes(value)
  ) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
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

function StepIcon({
  done,
  warning,
  danger,
}: {
  done?: boolean;
  warning?: boolean;
  danger?: boolean;
}) {
  if (danger) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
        !
      </div>
    );
  }

  if (warning) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#c9964f] text-sm font-bold text-white">
        …
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
        ✓
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7ddd0] text-sm font-bold text-[#6c6258]">
      ○
    </div>
  );
}

function TimelineStep({
  title,
  subtitle,
  status,
  done,
  warning,
  danger,
  children,
}: {
  title: string;
  subtitle?: string;
  status?: string | null;
  done?: boolean;
  warning?: boolean;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <StepIcon done={done} warning={warning} danger={danger} />
        <div className="mt-2 h-full min-h-[36px] w-px bg-[#eadfce]" />
      </div>

      <div className="min-w-0 flex-1 pb-8">
        <div className="rounded-[26px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[#1f1e1b]">{title}</h3>

              {subtitle && (
                <p className="mt-1 text-sm leading-6 text-[#6c6258]">
                  {subtitle}
                </p>
              )}
            </div>

            {status && (
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  statusClass(status),
                ].join(" ")}
              >
                {prettyStatus(status)}
              </span>
            )}
          </div>

          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string | number;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
        {label}
      </div>

      <div
        className={[
          "mt-2 text-3xl font-semibold",
          danger ? "text-red-700" : "text-[#1f1e1b]",
        ].join(" ")}
      >
        {value}
      </div>

      {hint && <div className="mt-1 text-xs text-[#6c6258]">{hint}</div>}
    </div>
  );
}

function MiniRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-[#fcfaf7] px-4 py-3 text-sm ring-1 ring-[#eee5d9]">
      <span className="text-[#6c6258]">{label}</span>
      <span className="text-right font-semibold text-[#1f1e1b]">{value}</span>
    </div>
  );
}

export default async function BookingWorkflowPage({ params }: PageProps) {
  const resolvedParams = await params;
  const bookingId = resolvedParams.id;

  if (!isUuid(bookingId)) {
    notFound();
  }

  const supabase = await createClient();

  const [
    bookingResult,
    reservationsResult,
    routeStopsResult,
    checklistResult,
    damageReportsResult,
    cleaningLogsResult,
    paymentsResult,
    contractsResult,
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
        setup_address,
        setup_city,
        setup_state,
        setup_zip,
        subtotal,
        delivery_fee,
        tax_amount,
        total_amount,
        deposit_amount,
        balance_due,
        contract_status,
        created_at,
        updated_at,
        customers (
          id,
          full_name,
          phone,
          email
        )
      `
      )
      .eq("id", bookingId)
      .maybeSingle(),

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
          serial_number,
          status,
          condition
        )
      `
      )
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true }),

    supabase
      .from("route_stops")
      .select(
        `
        id,
        stop_date,
        stop_type,
        status,
        scheduled_start_time,
        scheduled_end_time,
        driver_name,
        truck_name,
        address,
        city,
        state,
        zip,
        arrived_at,
        completed_at,
        created_at,
        updated_at
      `
      )
      .eq("booking_id", bookingId)
      .order("stop_date", { ascending: true })
      .order("scheduled_start_time", { ascending: true }),

    supabase
      .from("booking_checklist_items")
      .select(
        `
        id,
        title,
        item_type,
        source,
        quantity,
        loaded,
        installed,
        picked_up,
        returned,
        needs_cleaning,
        damaged,
        missing,
        loaded_at,
        installed_at,
        picked_up_at,
        returned_at,
        checked_by,
        notes,
        inventory_items (
          id,
          name,
          sku
        ),
        inventory_units (
          id,
          unit_code,
          serial_number,
          status,
          condition
        )
      `
      )
      .eq("booking_id", bookingId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),

    supabase
      .from("inventory_damage_reports")
      .select(
        `
        id,
        status,
        severity,
        damage_title,
        damage_description,
        reported_by,
        reported_at,
        repaired_at,
        closed_at,
        estimated_repair_cost,
        actual_repair_cost,
        inventory_items (
          id,
          name,
          sku
        ),
        inventory_units (
          id,
          unit_code,
          serial_number
        )
      `
      )
      .eq("booking_id", bookingId)
      .order("reported_at", { ascending: false }),

    supabase
      .from("inventory_cleaning_logs")
      .select(
        `
        id,
        inventory_unit_id,
        inventory_item_id,
        status_from,
        status_to,
        cleaned_by,
        notes,
        created_at,
        inventory_items (
          id,
          name,
          sku
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("payments")
      .select("id, amount, method, status, paid_at, created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false }),

    supabase
      .from("contracts")
      .select("id, status, sent_at, viewed_at, signed_at, created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (bookingResult.error) {
    throw new Error(bookingResult.error.message);
  }

  if (!bookingResult.data) {
    notFound();
  }

  if (reservationsResult.error) {
    throw new Error(reservationsResult.error.message);
  }

  if (routeStopsResult.error) {
    throw new Error(routeStopsResult.error.message);
  }

  if (checklistResult.error) {
    throw new Error(checklistResult.error.message);
  }

  if (damageReportsResult.error) {
    throw new Error(damageReportsResult.error.message);
  }

  if (cleaningLogsResult.error) {
    throw new Error(cleaningLogsResult.error.message);
  }

  if (paymentsResult.error) {
    throw new Error(paymentsResult.error.message);
  }

  if (contractsResult.error) {
    throw new Error(contractsResult.error.message);
  }

  const booking = bookingResult.data as any;
  const customer = getOne(booking.customers);

  const reservations = reservationsResult.data || [];
  const routeStops = routeStopsResult.data || [];
  const checklistItems = checklistResult.data || [];
  const damageReports = damageReportsResult.data || [];
  const cleaningLogs = cleaningLogsResult.data || [];
  const payments = paymentsResult.data || [];
  const latestContract = (contractsResult.data || [])[0] || null;

  const deliveryStop = routeStops.find((stop: any) => stop.stop_type === "delivery");
  const pickupStop = routeStops.find((stop: any) => stop.stop_type === "pickup");

  const totalChecklist = checklistItems.length;
  const loadedChecklist = checklistItems.filter((item: any) => item.loaded).length;
  const installedChecklist = checklistItems.filter((item: any) => item.installed).length;
  const pickedUpChecklist = checklistItems.filter((item: any) => item.picked_up).length;
  const returnedChecklist = checklistItems.filter((item: any) => item.returned).length;

  const cleaningItems = checklistItems.filter((item: any) => item.needs_cleaning);
  const damagedItems = checklistItems.filter((item: any) => item.damaged);
  const missingItems = checklistItems.filter((item: any) => item.missing);

  const problemCount = cleaningItems.length + damagedItems.length + missingItems.length;

  const totalPaid = payments.reduce((sum: number, payment: any) => {
    if (String(payment.status || "") !== "paid") return sum;
    return sum + Number(payment.amount || 0);
  }, 0);

  const bookingCreated = Boolean(booking.created_at);
  const contractSigned =
    String(latestContract?.status || booking.contract_status || "") === "signed" ||
    Boolean(latestContract?.signed_at);
  const depositPaid = totalPaid > 0 || Number(booking.deposit_amount || 0) > 0;
  const inventoryReserved = reservations.length > 0;
  const routesCreated = routeStops.length > 0;
  const deliveryDone =
    deliveryStop &&
    ["installed", "completed"].includes(String(deliveryStop.status || ""));
  const pickupDone =
    pickupStop &&
    ["picked_up", "completed"].includes(String(pickupStop.status || ""));
  const checklistStarted =
    loadedChecklist > 0 ||
    installedChecklist > 0 ||
    pickedUpChecklist > 0 ||
    returnedChecklist > 0;
  const allReturned = totalChecklist > 0 && returnedChecklist === totalChecklist;
  const hasProblems = problemCount > 0;
  const closed = String(booking.status || "") === "closed";

  const fullAddress = [
    booking.setup_address,
    booking.setup_city,
    booking.setup_state,
    booking.setup_zip,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Booking workflow
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Workflow for #{safeBookingNumber(booking)}
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              {customer?.full_name || "No customer"} · {formatDate(booking.event_date)} ·{" "}
              {formatTime(booking.event_start_time)} — {formatTime(booking.event_end_time)}
            </p>

            <p className="mt-1 max-w-4xl text-sm leading-6 text-[#6c6258]">
              {fullAddress || "No address"}
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
              href={`/admin/bookings/${bookingId}/routes`}
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Routes
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Booking status"
          value={prettyStatus(booking.status)}
          hint="Current lifecycle status"
          danger={["cancelled", "refunded"].includes(String(booking.status || ""))}
        />

        <SummaryCard
          label="Route stops"
          value={routeStops.length}
          hint={`${deliveryStop ? "Delivery yes" : "No delivery"} · ${
            pickupStop ? "Pickup yes" : "No pickup"
          }`}
        />

        <SummaryCard
          label="Checklist"
          value={`${returnedChecklist}/${totalChecklist}`}
          hint="Returned items"
        />

        <SummaryCard
          label="Problems"
          value={problemCount}
          hint="Cleaning / damaged / missing"
          danger={problemCount > 0}
        />

        <SummaryCard
          label="Balance"
          value={money(booking.balance_due)}
          hint={`Paid: ${money(totalPaid)}`}
          danger={Number(booking.balance_due || 0) > 0}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <main className="rounded-[30px] border border-black/5 bg-[#fcfaf7] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <TimelineStep
            title="Booking created"
            subtitle={`Created ${formatDateTime(booking.created_at)}.`}
            status={booking.status}
            done={bookingCreated}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <MiniRow label="Customer" value={customer?.full_name || "—"} />
              <MiniRow label="Phone" value={customer?.phone || "—"} />
              <MiniRow label="Email" value={customer?.email || "—"} />
              <MiniRow label="Total" value={money(booking.total_amount)} />
            </div>
          </TimelineStep>

          <TimelineStep
            title="Contract"
            subtitle={
              latestContract
                ? `Latest contract created ${formatDateTime(latestContract.created_at)}.`
                : "No contract record found."
            }
            status={latestContract?.status || booking.contract_status}
            done={contractSigned}
            warning={!contractSigned}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <MiniRow label="Sent" value={formatDateTime(latestContract?.sent_at)} />
              <MiniRow label="Viewed" value={formatDateTime(latestContract?.viewed_at)} />
              <MiniRow label="Signed" value={formatDateTime(latestContract?.signed_at)} />
            </div>
          </TimelineStep>

          <TimelineStep
            title="Payment / deposit"
            subtitle={`Paid ${money(totalPaid)}. Balance due ${money(booking.balance_due)}.`}
            status={depositPaid ? "paid" : "pending_deposit"}
            done={depositPaid && Number(booking.balance_due || 0) <= 0}
            warning={depositPaid && Number(booking.balance_due || 0) > 0}
            danger={!depositPaid}
          >
            <div className="space-y-2">
              {payments.map((payment: any) => (
                <MiniRow
                  key={payment.id}
                  label={`${prettyStatus(payment.method)} · ${formatDateTime(
                    payment.paid_at || payment.created_at
                  )}`}
                  value={`${money(payment.amount)} · ${prettyStatus(payment.status)}`}
                />
              ))}

              {payments.length === 0 && (
                <div className="rounded-2xl bg-white p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                  No payment records yet.
                </div>
              )}
            </div>
          </TimelineStep>

          <TimelineStep
            title="Inventory reserved"
            subtitle={`${reservations.length} inventory reservations connected to this booking.`}
            status={inventoryReserved ? "inventory_reserved" : "not_reserved"}
            done={inventoryReserved}
            warning={!inventoryReserved}
          >
            <div className="space-y-2">
              {reservations.slice(0, 10).map((reservation: any) => {
                const item = getOne(reservation.inventory_items);
                const unit = getOne(reservation.inventory_units);

                return (
                  <MiniRow
                    key={reservation.id}
                    label={item?.name || "Inventory item"}
                    value={`${unit?.unit_code || unit?.serial_number || "Qty"} · ${
                      reservation.quantity || 1
                    } · ${prettyStatus(reservation.status)}`}
                  />
                );
              })}

              {reservations.length > 10 && (
                <div className="text-xs text-[#8b8177]">
                  +{reservations.length - 10} more reservations
                </div>
              )}

              {reservations.length === 0 && (
                <div className="rounded-2xl bg-white p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                  No inventory reservations found.
                </div>
              )}
            </div>
          </TimelineStep>

          <TimelineStep
            title="Route stops created"
            subtitle={`${routeStops.length} route stops created for delivery / pickup.`}
            status={routesCreated ? "scheduled" : "not_scheduled"}
            done={routesCreated}
            warning={!routesCreated}
          >
            <div className="space-y-2">
              {routeStops.map((stop: any) => (
                <MiniRow
                  key={stop.id}
                  label={`${prettyStatus(stop.stop_type)} · ${formatDate(stop.stop_date)}`}
                  value={`${formatTime(stop.scheduled_start_time)} · ${prettyStatus(
                    stop.status
                  )}`}
                />
              ))}

              {routeStops.length === 0 && (
                <div className="rounded-2xl bg-white p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                  No route stops found.
                </div>
              )}
            </div>
          </TimelineStep>

          <TimelineStep
            title="Delivery"
            subtitle={
              deliveryStop
                ? `Delivery status: ${prettyStatus(deliveryStop.status)}.`
                : "No delivery stop created."
            }
            status={deliveryStop?.status || "not_scheduled"}
            done={Boolean(deliveryDone)}
            warning={Boolean(deliveryStop && !deliveryDone)}
            danger={!deliveryStop}
          >
            {deliveryStop ? (
              <div className="grid gap-3 md:grid-cols-2">
                <MiniRow label="Date" value={formatDate(deliveryStop.stop_date)} />
                <MiniRow
                  label="Window"
                  value={`${formatTime(deliveryStop.scheduled_start_time)} — ${formatTime(
                    deliveryStop.scheduled_end_time
                  )}`}
                />
                <MiniRow label="Driver" value={deliveryStop.driver_name || "—"} />
                <MiniRow label="Completed" value={formatDateTime(deliveryStop.completed_at)} />
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                Create delivery stop from booking routes.
              </div>
            )}
          </TimelineStep>

          <TimelineStep
            title="Checklist progress"
            subtitle={`${loadedChecklist}/${totalChecklist} loaded · ${installedChecklist}/${totalChecklist} installed · ${returnedChecklist}/${totalChecklist} returned.`}
            status={checklistStarted ? "in_progress" : "not_started"}
            done={allReturned && !hasProblems}
            warning={checklistStarted && !allReturned}
            danger={hasProblems}
          >
            <div className="grid gap-3 md:grid-cols-4">
              <MiniRow label="Loaded" value={`${loadedChecklist}/${totalChecklist}`} />
              <MiniRow label="Installed" value={`${installedChecklist}/${totalChecklist}`} />
              <MiniRow label="Picked up" value={`${pickedUpChecklist}/${totalChecklist}`} />
              <MiniRow label="Returned" value={`${returnedChecklist}/${totalChecklist}`} />
            </div>
          </TimelineStep>

          <TimelineStep
            title="Pickup"
            subtitle={
              pickupStop
                ? `Pickup status: ${prettyStatus(pickupStop.status)}.`
                : "No pickup stop created."
            }
            status={pickupStop?.status || "not_scheduled"}
            done={Boolean(pickupDone)}
            warning={Boolean(pickupStop && !pickupDone)}
            danger={!pickupStop}
          >
            {pickupStop ? (
              <div className="grid gap-3 md:grid-cols-2">
                <MiniRow label="Date" value={formatDate(pickupStop.stop_date)} />
                <MiniRow
                  label="Window"
                  value={`${formatTime(pickupStop.scheduled_start_time)} — ${formatTime(
                    pickupStop.scheduled_end_time
                  )}`}
                />
                <MiniRow label="Driver" value={pickupStop.driver_name || "—"} />
                <MiniRow label="Completed" value={formatDateTime(pickupStop.completed_at)} />
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                Create pickup stop from booking routes.
              </div>
            )}
          </TimelineStep>

          <TimelineStep
            title="Cleaning / damage review"
            subtitle={`${cleaningItems.length} cleaning · ${damagedItems.length} damaged · ${missingItems.length} missing.`}
            status={hasProblems ? "needs_review" : "clear"}
            done={!hasProblems && allReturned}
            warning={hasProblems}
            danger={damagedItems.length > 0 || missingItems.length > 0}
          >
            <div className="space-y-2">
              {cleaningItems.map((item: any) => (
                <MiniRow key={`clean-${item.id}`} label={item.title} value="Needs cleaning" />
              ))}

              {damagedItems.map((item: any) => (
                <MiniRow key={`damaged-${item.id}`} label={item.title} value="Damaged" />
              ))}

              {missingItems.map((item: any) => (
                <MiniRow key={`missing-${item.id}`} label={item.title} value="Missing" />
              ))}

              {!hasProblems && (
                <div className="rounded-2xl bg-white p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                  No cleaning / damage / missing issues in checklist.
                </div>
              )}
            </div>
          </TimelineStep>

          <TimelineStep
            title="Closed"
            subtitle={
              closed
                ? "Booking is closed."
                : "Booking will close automatically when all items are returned clean."
            }
            status={booking.status}
            done={closed}
            warning={!closed && allReturned}
            danger={!closed && hasProblems}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <MiniRow label="Current status" value={prettyStatus(booking.status)} />
              <MiniRow label="Updated" value={formatDateTime(booking.updated_at)} />
            </div>
          </TimelineStep>
        </main>

        <aside className="space-y-6">
          <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Operations summary
            </h3>

            <div className="mt-5 space-y-3">
              <MiniRow label="Booking" value={`#${safeBookingNumber(booking)}`} />
              <MiniRow label="Status" value={prettyStatus(booking.status)} />
              <MiniRow label="Event date" value={formatDate(booking.event_date)} />
              <MiniRow
                label="Event time"
                value={`${formatTime(booking.event_start_time)} — ${formatTime(
                  booking.event_end_time
                )}`}
              />
              <MiniRow label="Total" value={money(booking.total_amount)} />
              <MiniRow label="Balance" value={money(booking.balance_due)} />
            </div>
          </section>

          <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Damage reports
            </h3>

            <div className="mt-5 space-y-3">
              {damageReports.map((report: any) => {
                const item = getOne(report.inventory_items);
                const unit = getOne(report.inventory_units);

                return (
                  <div
                    key={report.id}
                    className="rounded-2xl border border-red-100 bg-red-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-red-800">
                        {report.damage_title || item?.name || "Damage report"}
                      </div>

                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                        {prettyStatus(report.status)}
                      </span>
                    </div>

                    <div className="mt-2 text-xs leading-5 text-red-700">
                      {unit?.unit_code || unit?.serial_number || "No unit"} ·{" "}
                      {prettyStatus(report.severity)}
                    </div>

                    <div className="mt-2 text-xs text-red-700">
                      Reported {formatDateTime(report.reported_at)}
                    </div>
                  </div>
                );
              })}

              {damageReports.length === 0 && (
                <div className="rounded-2xl bg-[#fcfaf7] p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                  No damage reports.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Cleaning logs
            </h3>

            <div className="mt-5 space-y-3">
              {cleaningLogs.slice(0, 8).map((log: any) => {
                const item = getOne(log.inventory_items);

                return (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] p-4"
                  >
                    <div className="font-semibold text-[#1f1e1b]">
                      {item?.name || "Cleaning log"}
                    </div>

                    <div className="mt-1 text-xs text-[#6c6258]">
                      {prettyStatus(log.status_from)} → {prettyStatus(log.status_to)}
                    </div>

                    <div className="mt-1 text-xs text-[#8b8177]">
                      {formatDateTime(log.created_at)}
                    </div>
                  </div>
                );
              })}

              {cleaningLogs.length === 0 && (
                <div className="rounded-2xl bg-[#fcfaf7] p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                  No cleaning logs yet.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-black/5 bg-[#23313f] p-6 text-white shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
            <h3 className="text-lg font-semibold">Quick links</h3>

            <div className="mt-4 grid gap-2">
              <a
                href={`/admin/bookings/${bookingId}`}
                className="rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-[#23313f]"
              >
                Booking details
              </a>

              <a
                href={`/admin/bookings/${bookingId}/checklist`}
                className="rounded-full bg-[#c9964f] px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Checklist
              </a>

              <a
                href={`/admin/bookings/${bookingId}/routes`}
                className="rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-white/10"
              >
                Routes
              </a>

              <a
                href="/admin/routes/driver/checklists"
                className="rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-white/10"
              >
                Driver checklist
              </a>

              <a
                href="/admin/inventory/cleaning"
                className="rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-white/10"
              >
                Cleaning queue
              </a>

              <a
                href="/admin/inventory/damages"
                className="rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-white/10"
              >
                Damage reports
              </a>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
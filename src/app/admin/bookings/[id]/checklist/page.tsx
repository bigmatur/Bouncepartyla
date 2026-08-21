import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  generateChecklistFromBookingAction,
  quickToggleChecklistItemAction,
  updateChecklistItemAction,
} from "./actions";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

const itemTypes = [
  { value: "equipment", label: "Equipment" },
  { value: "component", label: "Component" },
  { value: "addon", label: "Add-on" },
  { value: "supply", label: "Supply" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other" },
];

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

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusClass(value: boolean, danger = false) {
  if (value && danger) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  if (value) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function itemTypeLabel(value: string | null | undefined) {
  return itemTypes.find((item) => item.value === value)?.label || "Other";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
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

function BooleanBadge({
  label,
  value,
  danger,
}: {
  label: string;
  value: boolean;
  danger?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
        statusClass(value, danger),
      ].join(" ")}
    >
      {label}: {value ? "Yes" : "No"}
    </span>
  );
}

function ToggleButton({
  bookingId,
  checklistItemId,
  field,
  active,
  label,
  danger,
}: {
  bookingId: string;
  checklistItemId: string;
  field: string;
  active: boolean;
  label: string;
  danger?: boolean;
}) {
  return (
    <form action={quickToggleChecklistItemAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="checklistItemId" value={checklistItemId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={active ? "false" : "true"} />

      <button
        type="submit"
        className={[
          "w-full rounded-full px-4 py-2 text-left text-xs font-semibold transition",
          active && danger
            ? "bg-red-600 text-white hover:bg-red-700"
            : active
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-[#f4ede2] text-[#6c6258] hover:bg-[#eadfce]",
        ].join(" ")}
      >
        {label}: {active ? "Yes" : "No"}
      </button>
    </form>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
        {label}
      </div>

      <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">{value}</div>

      {hint && <div className="mt-1 text-xs text-[#6c6258]">{hint}</div>}
    </div>
  );
}

export default async function BookingChecklistPage({ params }: PageProps) {
  const resolvedParams = await params;
  const bookingId = resolvedParams.id;

  if (!isUuid(bookingId)) {
    notFound();
  }

  const supabase = await createClient();

  const [bookingResult, checklistResult] = await Promise.all([
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
      .from("booking_checklist_items")
      .select(
        `
        id,
        booking_id,
        booking_item_id,
        inventory_item_id,
        inventory_unit_id,
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
        sort_order,
        created_at,
        updated_at,
        inventory_items (
          id,
          name,
          sku,
          image_url
        ),
        inventory_units (
          id,
          unit_code,
          serial_number,
          barcode,
          status,
          condition
        )
      `
      )
      .eq("booking_id", bookingId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (bookingResult.error) {
    throw new Error(bookingResult.error.message);
  }

  if (!bookingResult.data) {
    notFound();
  }

  if (checklistResult.error) {
    throw new Error(checklistResult.error.message);
  }

  const booking = bookingResult.data as any;
  const customer = getOne(booking.customers);
  const checklistItems = checklistResult.data || [];

  const total = checklistItems.length;
  const loadedCount = checklistItems.filter((item: any) => item.loaded).length;
  const installedCount = checklistItems.filter((item: any) => item.installed).length;
  const returnedCount = checklistItems.filter((item: any) => item.returned).length;
  const problemCount = checklistItems.filter(
    (item: any) => item.damaged || item.missing || item.needs_cleaning
  ).length;

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
              Booking operations
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Checklist / Packing list
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Booking #{safeBookingNumber(booking)} ·{" "}
              {customer?.full_name || "No customer"} · {formatDate(booking.event_date)}
            </p>

            <p className="mt-1 max-w-4xl text-sm leading-6 text-[#6c6258]">
              {fullAddress || "No address"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={generateChecklistFromBookingAction}>
              <input type="hidden" name="bookingId" value={bookingId} />

              <button
                type="submit"
                className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.24)] transition hover:bg-[#b78744]"
              >
                Generate from booking
              </button>
            </form>

            <a
              href={`/admin/bookings/${bookingId}`}
              className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              Back to booking
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

      <section className="grid gap-4 md:grid-cols-5">
        <SummaryCard label="Items" value={total} />
        <SummaryCard label="Loaded" value={`${loadedCount}/${total}`} />
        <SummaryCard label="Installed" value={`${installedCount}/${total}`} />
        <SummaryCard label="Returned" value={`${returnedCount}/${total}`} />
        <SummaryCard label="Problems" value={problemCount} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Add manual item
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Добавь мешки с песком, extension cord, генератор, документы или
              любые ручные задачи.
            </p>
          </div>

          <form action={addChecklistItemAction} className="space-y-6">
            <input type="hidden" name="bookingId" value={bookingId} />

            <div className="grid gap-4 p-6">
              <Field label="Title">
                <Input
                  name="title"
                  placeholder="Sandbags, blower, extension cord..."
                  required
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Type">
                  <Select name="itemType" defaultValue="equipment">
                    {itemTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Quantity">
                  <Input
                    name="quantity"
                    type="number"
                    step="0.01"
                    defaultValue="1"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Checked by">
                  <Input name="checkedBy" placeholder="Employee name" />
                </Field>

                <Field label="Sort order">
                  <Input name="sortOrder" type="number" defaultValue="100" />
                </Field>
              </div>

              <Field label="Notes">
                <Textarea
                  name="notes"
                  rows={5}
                  placeholder="Special notes for warehouse, driver, setup or pickup..."
                />
              </Field>
            </div>

            <div className="border-t border-[#eee5d9] px-6 py-5">
              <button
                type="submit"
                className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.24)] transition hover:bg-[#b78744]"
              >
                Add item
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Checklist items
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Отмечай каждый этап: loaded, installed, picked up, returned.
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {checklistItems.map((item: any) => {
              const inventoryItem = getOne(item.inventory_items);
              const inventoryUnit = getOne(item.inventory_units);

              return (
                <details key={item.id} className="group">
                  <summary className="grid cursor-pointer gap-4 px-6 py-5 transition hover:bg-[#fcfaf7] xl:grid-cols-[1fr_160px_120px_110px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-[#1f1e1b]">
                          {item.title}
                        </div>

                        <span className="rounded-full bg-[#eaf2f9] px-3 py-1 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
                          {itemTypeLabel(item.item_type)}
                        </span>

                        {item.damaged && <BooleanBadge label="Damaged" value danger />}
                        {item.missing && <BooleanBadge label="Missing" value danger />}
                        {item.needs_cleaning && (
                          <BooleanBadge label="Cleaning" value danger />
                        )}
                      </div>

                      <div className="mt-1 text-sm text-[#6c6258]">
                        Qty {item.quantity || 1} · {prettyStatus(item.source)}
                      </div>

                      {inventoryUnit && (
                        <div className="mt-1 text-xs text-[#8b8177]">
                          Unit:{" "}
                          {inventoryUnit.unit_code ||
                            inventoryUnit.serial_number ||
                            inventoryUnit.barcode ||
                            "—"}{" "}
                          · Status: {prettyStatus(inventoryUnit.status)}
                        </div>
                      )}

                      {inventoryItem && (
                        <div className="mt-1 text-xs text-[#8b8177]">
                          SKU: {inventoryItem.sku || "—"}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                        Progress
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        <BooleanBadge label="L" value={Boolean(item.loaded)} />
                        <BooleanBadge label="I" value={Boolean(item.installed)} />
                        <BooleanBadge label="P" value={Boolean(item.picked_up)} />
                        <BooleanBadge label="R" value={Boolean(item.returned)} />
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                        Checked by
                      </div>

                      <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                        {item.checked_by || "—"}
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <span className="rounded-full bg-[#f4ede2] px-3 py-2 text-xs font-semibold text-[#6c6258] group-open:bg-[#23313f] group-open:text-white">
                        Details
                      </span>
                    </div>
                  </summary>

                  <div className="bg-[#fcfaf7] px-6 pb-6">
                    <div className="grid gap-6 xl:grid-cols-[1fr_240px]">
                      <form
                        action={updateChecklistItemAction}
                        className="grid gap-4 rounded-[26px] border border-[#eee5d9] bg-white p-5 md:grid-cols-2"
                      >
                        <input type="hidden" name="bookingId" value={bookingId} />
                        <input
                          type="hidden"
                          name="checklistItemId"
                          value={item.id}
                        />

                        <div className="md:col-span-2">
                          <Field label="Title">
                            <Input name="title" defaultValue={item.title || ""} />
                          </Field>
                        </div>

                        <Field label="Type">
                          <Select name="itemType" defaultValue={item.item_type}>
                            {itemTypes.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field label="Quantity">
                          <Input
                            name="quantity"
                            type="number"
                            step="0.01"
                            defaultValue={item.quantity || "1"}
                          />
                        </Field>

                        <Field label="Checked by">
                          <Input
                            name="checkedBy"
                            defaultValue={item.checked_by || ""}
                          />
                        </Field>

                        <Field label="Sort order">
                          <Input
                            name="sortOrder"
                            type="number"
                            defaultValue={item.sort_order || "100"}
                          />
                        </Field>

                        <div className="grid gap-3 md:col-span-2 md:grid-cols-4">
                          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                            <span>Loaded</span>
                            <input
                              type="checkbox"
                              name="loaded"
                              defaultChecked={Boolean(item.loaded)}
                              className="h-5 w-5"
                            />
                          </label>

                          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                            <span>Installed</span>
                            <input
                              type="checkbox"
                              name="installed"
                              defaultChecked={Boolean(item.installed)}
                              className="h-5 w-5"
                            />
                          </label>

                          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                            <span>Picked up</span>
                            <input
                              type="checkbox"
                              name="pickedUp"
                              defaultChecked={Boolean(item.picked_up)}
                              className="h-5 w-5"
                            />
                          </label>

                          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                            <span>Returned</span>
                            <input
                              type="checkbox"
                              name="returned"
                              defaultChecked={Boolean(item.returned)}
                              className="h-5 w-5"
                            />
                          </label>
                        </div>

                        <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
                          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#efd582] bg-[#fff4d8] px-4 py-3 text-sm font-semibold text-[#8a6b20]">
                            <span>Needs cleaning</span>
                            <input
                              type="checkbox"
                              name="needsCleaning"
                              defaultChecked={Boolean(item.needs_cleaning)}
                              className="h-5 w-5"
                            />
                          </label>

                          <label className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                            <span>Damaged</span>
                            <input
                              type="checkbox"
                              name="damaged"
                              defaultChecked={Boolean(item.damaged)}
                              className="h-5 w-5"
                            />
                          </label>

                          <label className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                            <span>Missing</span>
                            <input
                              type="checkbox"
                              name="missing"
                              defaultChecked={Boolean(item.missing)}
                              className="h-5 w-5"
                            />
                          </label>
                        </div>

                        <div className="md:col-span-2">
                          <Field label="Notes">
                            <Textarea
                              name="notes"
                              rows={5}
                              defaultValue={item.notes || ""}
                            />
                          </Field>
                        </div>

                        <div className="grid gap-3 rounded-2xl bg-[#f8f4ee] p-4 text-xs text-[#6c6258] md:col-span-2 md:grid-cols-4">
                          <div>
                            <div className="font-semibold text-[#9a7a49]">
                              Loaded at
                            </div>
                            <div className="mt-1">{formatDateTime(item.loaded_at)}</div>
                          </div>

                          <div>
                            <div className="font-semibold text-[#9a7a49]">
                              Installed at
                            </div>
                            <div className="mt-1">
                              {formatDateTime(item.installed_at)}
                            </div>
                          </div>

                          <div>
                            <div className="font-semibold text-[#9a7a49]">
                              Picked up at
                            </div>
                            <div className="mt-1">
                              {formatDateTime(item.picked_up_at)}
                            </div>
                          </div>

                          <div>
                            <div className="font-semibold text-[#9a7a49]">
                              Returned at
                            </div>
                            <div className="mt-1">
                              {formatDateTime(item.returned_at)}
                            </div>
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <button
                            type="submit"
                            className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                          >
                            Save checklist item
                          </button>
                        </div>
                      </form>

                      <aside className="space-y-3">
                        <div className="rounded-[26px] border border-[#eee5d9] bg-white p-5">
                          <div className="text-sm font-semibold text-[#1f1e1b]">
                            Quick toggle
                          </div>

                          <div className="mt-4 grid gap-2">
                            <ToggleButton
                              bookingId={bookingId}
                              checklistItemId={item.id}
                              field="loaded"
                              active={Boolean(item.loaded)}
                              label="Loaded"
                            />

                            <ToggleButton
                              bookingId={bookingId}
                              checklistItemId={item.id}
                              field="installed"
                              active={Boolean(item.installed)}
                              label="Installed"
                            />

                            <ToggleButton
                              bookingId={bookingId}
                              checklistItemId={item.id}
                              field="picked_up"
                              active={Boolean(item.picked_up)}
                              label="Picked up"
                            />

                            <ToggleButton
                              bookingId={bookingId}
                              checklistItemId={item.id}
                              field="returned"
                              active={Boolean(item.returned)}
                              label="Returned"
                            />

                            <ToggleButton
                              bookingId={bookingId}
                              checklistItemId={item.id}
                              field="needs_cleaning"
                              active={Boolean(item.needs_cleaning)}
                              label="Needs cleaning"
                              danger
                            />

                            <ToggleButton
                              bookingId={bookingId}
                              checklistItemId={item.id}
                              field="damaged"
                              active={Boolean(item.damaged)}
                              label="Damaged"
                              danger
                            />

                            <ToggleButton
                              bookingId={bookingId}
                              checklistItemId={item.id}
                              field="missing"
                              active={Boolean(item.missing)}
                              label="Missing"
                              danger
                            />
                          </div>
                        </div>

                        <form
                          action={deleteChecklistItemAction}
                          className="rounded-[26px] border border-red-100 bg-red-50 p-5"
                        >
                          <input type="hidden" name="bookingId" value={bookingId} />
                          <input
                            type="hidden"
                            name="checklistItemId"
                            value={item.id}
                          />

                          <div className="text-sm font-semibold text-red-800">
                            Delete item
                          </div>

                          <p className="mt-1 text-xs leading-5 text-red-700">
                            Удаляй только ошибочные или тестовые строки.
                          </p>

                          <button
                            type="submit"
                            className="mt-4 w-full rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </form>
                      </aside>
                    </div>
                  </div>
                </details>
              );
            })}

            {checklistItems.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No checklist items yet
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Click “Generate from booking” or add items manually.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
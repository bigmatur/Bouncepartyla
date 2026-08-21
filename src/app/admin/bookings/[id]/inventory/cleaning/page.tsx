import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  archiveUnitFromCleaningAction,
  markUnitCleanedAction,
  markUnitDirtyAction,
  sendUnitToMaintenanceAction,
  startCleaningUnitAction,
} from "./actions";

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "dirty", label: "Dirty" },
  { value: "cleaning", label: "Cleaning" },
  { value: "returned", label: "Returned" },
  { value: "maintenance", label: "Maintenance" },
  { value: "available", label: "Available" },
];

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  const value = String(status || "");

  if (value === "available") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (value === "cleaning") {
    return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
  }

  if (value === "dirty" || value === "returned") {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (value === "maintenance") {
    return "bg-purple-50 text-purple-700 ring-1 ring-purple-200";
  }

  if (value === "damaged" || value === "lost" || value === "archived") {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
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

function UnitPhoto({ unit }: { unit: any }) {
  const imageUrl =
    unit.image_url ||
    unit.cleaning_photo_url ||
    unit.inventory_items?.image_url ||
    null;

  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[#efe7dc] ring-1 ring-[#eee5d9]">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={unit.unit_code || "Inventory unit"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9a7a49]">
          No photo
        </div>
      )}
    </div>
  );
}

export default async function InventoryCleaningPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    q?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const selectedStatus = String(resolvedSearchParams?.status || "active");
  const query = String(resolvedSearchParams?.q || "").trim();

  const supabase = await createClient();

  let unitsRequest = supabase
    .from("inventory_units")
    .select(
      `
      id,
      inventory_item_id,
      unit_code,
      serial_number,
      barcode,
      status,
      condition,
      image_url,
      notes,
      last_cleaned_at,
      cleaned_by,
      cleaning_notes,
      cleaning_photo_url,
      updated_at,
      warehouse_locations (
        id,
        name
      ),
      inventory_items (
        id,
        name,
        sku,
        tracking_type,
        image_url
      )
    `
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (selectedStatus === "active") {
    unitsRequest = unitsRequest.in("status", [
      "dirty",
      "cleaning",
      "returned",
      "maintenance",
    ]);
  } else if (selectedStatus !== "all") {
    unitsRequest = unitsRequest.eq("status", selectedStatus);
  }

  const [unitsResult, logsResult] = await Promise.all([
    unitsRequest,
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
          name
        ),
        inventory_units (
          id,
          unit_code
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (unitsResult.error) {
    throw new Error(unitsResult.error.message);
  }

  if (logsResult.error) {
    throw new Error(logsResult.error.message);
  }

  const units = (unitsResult.data || []).filter((unit: any) => {
    if (!query) return true;

    const text = [
      unit.unit_code,
      unit.serial_number,
      unit.barcode,
      unit.status,
      unit.condition,
      unit.notes,
      unit.cleaning_notes,
      unit.cleaned_by,
      unit.inventory_items?.name,
      unit.inventory_items?.sku,
      unit.warehouse_locations?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(query.toLowerCase());
  });

  const logs = logsResult.data || [];

  const dirtyCount = units.filter((unit: any) =>
    ["dirty", "returned"].includes(String(unit.status || ""))
  ).length;

  const cleaningCount = units.filter(
    (unit: any) => String(unit.status || "") === "cleaning"
  ).length;

  const maintenanceCount = units.filter(
    (unit: any) => String(unit.status || "") === "maintenance"
  ).length;

  const availableCount = units.filter(
    (unit: any) => String(unit.status || "") === "available"
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Warehouse workflow
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Cleaning Queue
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              После pickup единицы должны пройти проверку и чистку перед тем,
              как снова стать Available.
            </p>
          </div>

          <a
            href="/admin/inventory"
            className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
          >
            Back to inventory
          </a>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Dirty / Returned" value={dirtyCount} />
        <SummaryCard label="Cleaning" value={cleaningCount} />
        <SummaryCard label="Maintenance" value={maintenanceCount} />
        <SummaryCard label="Available" value={availableCount} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[#1f1e1b]">
                  Units to process
                </h3>

                <p className="mt-1 text-sm leading-6 text-[#6c6258]">
                  Mark units as cleaning, cleaned or maintenance.
                </p>
              </div>
            </div>

            <form className="mt-5 grid gap-3 md:grid-cols-[1fr_190px_120px]">
              <Input name="q" defaultValue={query} placeholder="Search units..." />

              <Select name="status" defaultValue={selectedStatus}>
                <option value="active">Active queue</option>
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>

              <button
                type="submit"
                className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
              >
                Filter
              </button>
            </form>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {units.map((unit: any) => {
              const item = unit.inventory_items;
              const location = unit.warehouse_locations;

              return (
                <details key={unit.id} className="group">
                  <summary className="grid cursor-pointer gap-4 px-6 py-5 transition hover:bg-[#fcfaf7] xl:grid-cols-[1fr_140px_160px_110px]">
                    <div className="flex min-w-0 items-center gap-4">
                      <UnitPhoto unit={unit} />

                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[#1f1e1b]">
                          {item?.name || "Inventory item"}
                        </div>

                        <div className="mt-1 text-sm text-[#6c6258]">
                          {unit.unit_code || unit.serial_number || "No unit code"}
                        </div>

                        <div className="mt-1 text-xs text-[#8b8177]">
                          {item?.sku || "No SKU"} · {location?.name || "No location"}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                        Status
                      </div>

                      <div className="mt-2">
                        <span
                          className={[
                            "rounded-full px-3 py-1 text-xs font-semibold",
                            statusClass(unit.status),
                          ].join(" ")}
                        >
                          {prettyStatus(unit.status)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                        Last cleaned
                      </div>

                      <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                        {formatDateTime(unit.last_cleaned_at)}
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
                      <div className="rounded-[26px] border border-[#eee5d9] bg-white p-5">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                              Item
                            </div>

                            <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                              {item?.name || "Inventory item"}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                              Unit
                            </div>

                            <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                              {unit.unit_code || unit.serial_number || "No unit code"}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                              Condition
                            </div>

                            <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                              {unit.condition || "—"}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                              Cleaned by
                            </div>

                            <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                              {unit.cleaned_by || "—"}
                            </div>
                          </div>
                        </div>

                        {unit.cleaning_notes && (
                          <div className="mt-5 rounded-2xl bg-[#f8f4ee] p-4 text-sm leading-6 text-[#6c6258]">
                            {unit.cleaning_notes}
                          </div>
                        )}

                        {unit.notes && (
                          <div className="mt-3 rounded-2xl bg-[#fff8e8] p-4 text-sm leading-6 text-[#8a6b20] ring-1 ring-[#ead6a8]">
                            {unit.notes}
                          </div>
                        )}
                      </div>

                      <aside className="space-y-3">
                        <form
                          action={startCleaningUnitAction}
                          className="rounded-[26px] border border-[#eee5d9] bg-white p-5"
                        >
                          <input type="hidden" name="unitId" value={unit.id} />

                          <Field label="Employee">
                            <Input name="cleanedBy" placeholder="Name" />
                          </Field>

                          <div className="mt-3">
                            <Field label="Notes">
                              <Textarea
                                name="notes"
                                rows={3}
                                placeholder="Cleaning started..."
                              />
                            </Field>
                          </div>

                          <button
                            type="submit"
                            className="mt-4 w-full rounded-full bg-[#23313f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                          >
                            Start cleaning
                          </button>
                        </form>

                        <form
                          action={markUnitCleanedAction}
                          className="rounded-[26px] border border-emerald-100 bg-emerald-50 p-5"
                        >
                          <input type="hidden" name="unitId" value={unit.id} />

                          <Field label="Cleaned by">
                            <Input name="cleanedBy" placeholder="Name" />
                          </Field>

                          <div className="mt-3">
                            <Field label="Notes">
                              <Textarea
                                name="notes"
                                rows={3}
                                placeholder="Ready for next booking."
                              />
                            </Field>
                          </div>

                          <button
                            type="submit"
                            className="mt-4 w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                          >
                            Mark cleaned / available
                          </button>
                        </form>

                        <form action={markUnitDirtyAction}>
                          <input type="hidden" name="unitId" value={unit.id} />
                          <input
                            type="hidden"
                            name="notes"
                            value="Marked dirty from cleaning queue."
                          />

                          <button
                            type="submit"
                            className="w-full rounded-full border border-[#efd582] bg-[#fff4d8] px-4 py-2 text-sm font-semibold text-[#8a6b20] transition hover:bg-[#ffeab0]"
                          >
                            Mark dirty
                          </button>
                        </form>

                        <form action={sendUnitToMaintenanceAction}>
                          <input type="hidden" name="unitId" value={unit.id} />
                          <input
                            type="hidden"
                            name="notes"
                            value="Sent to maintenance from cleaning queue."
                          />

                          <button
                            type="submit"
                            className="w-full rounded-full border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 transition hover:bg-purple-100"
                          >
                            Send to maintenance
                          </button>
                        </form>

                        <form action={archiveUnitFromCleaningAction}>
                          <input type="hidden" name="unitId" value={unit.id} />
                          <input
                            type="hidden"
                            name="notes"
                            value="Archived from cleaning queue."
                          />

                          <button
                            type="submit"
                            className="w-full rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                          >
                            Archive unit
                          </button>
                        </form>
                      </aside>
                    </div>
                  </div>
                </details>
              );
            })}

            {units.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No units in cleaning queue
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Returned or dirty units will appear here.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Cleaning history
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Last 20 cleaning status changes.
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {logs.map((log: any) => (
              <div key={log.id} className="px-6 py-4">
                <div className="font-semibold text-[#1f1e1b]">
                  {log.inventory_items?.name || "Inventory item"}
                </div>

                <div className="mt-1 text-sm text-[#6c6258]">
                  {log.inventory_units?.unit_code || "Unit"} ·{" "}
                  {prettyStatus(log.status_from)} → {prettyStatus(log.status_to)}
                </div>

                {log.cleaned_by && (
                  <div className="mt-1 text-xs text-[#8b8177]">
                    By {log.cleaned_by}
                  </div>
                )}

                {log.notes && (
                  <div className="mt-2 rounded-2xl bg-[#fcfaf7] p-3 text-xs leading-5 text-[#6c6258]">
                    {log.notes}
                  </div>
                )}

                <div className="mt-2 text-xs text-[#8b8177]">
                  {formatDateTime(log.created_at)}
                </div>
              </div>
            ))}

            {logs.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-[#6c6258]">
                No cleaning history yet.
              </div>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
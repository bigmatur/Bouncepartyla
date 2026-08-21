import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  createDamageReportAction,
  deleteDamageReportAction,
  quickUpdateDamageStatusAction,
  updateDamageReportAction,
} from "./actions";

const statuses = [
  {
    value: "reported",
    label: "Reported",
    tone: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  {
    value: "repair_needed",
    label: "Repair needed",
    tone: "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]",
  },
  {
    value: "in_repair",
    label: "In repair",
    tone: "bg-purple-50 text-purple-700 ring-purple-200",
  },
  {
    value: "repaired",
    label: "Repaired",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  {
    value: "retired",
    label: "Retired",
    tone: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  },
  {
    value: "closed",
    label: "Closed",
    tone: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    tone: "bg-red-50 text-red-700 ring-red-200",
  },
];

const severities = [
  {
    value: "low",
    label: "Low",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  {
    value: "medium",
    label: "Medium",
    tone: "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]",
  },
  {
    value: "high",
    label: "High",
    tone: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  {
    value: "critical",
    label: "Critical",
    tone: "bg-red-50 text-red-700 ring-red-200",
  },
];

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function statusMeta(value: string | null | undefined) {
  return (
    statuses.find((status) => status.value === value) || {
      value: "reported",
      label: "Reported",
      tone: "bg-blue-50 text-blue-700 ring-blue-200",
    }
  );
}

function severityMeta(value: string | null | undefined) {
  return (
    severities.find((severity) => severity.value === value) || {
      value: "medium",
      label: "Medium",
      tone: "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]",
    }
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

function StatusBadge({ value }: { value: string | null | undefined }) {
  const meta = statusMeta(value);

  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1",
        meta.tone,
      ].join(" ")}
    >
      {meta.label}
    </span>
  );
}

function SeverityBadge({ value }: { value: string | null | undefined }) {
  const meta = severityMeta(value);

  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1",
        meta.tone,
      ].join(" ")}
    >
      {meta.label}
    </span>
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

function UnitOptionLabel({ unit }: { unit: any }) {
  const item = unit.inventory_items;
  const location = unit.warehouse_locations;

  return [
    item?.name || "Inventory item",
    unit.unit_code || unit.serial_number || unit.barcode || unit.id?.slice(0, 8),
    unit.status ? prettyStatus(unit.status) : "",
    location?.name || "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function InventoryDamagesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    severity?: string;
    q?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const selectedStatus = String(resolvedSearchParams?.status || "active");
  const selectedSeverity = String(resolvedSearchParams?.severity || "all");
  const query = String(resolvedSearchParams?.q || "").trim();

  const supabase = await createClient();

  let reportsRequest = supabase
    .from("inventory_damage_reports")
    .select(
      `
      id,
      inventory_unit_id,
      inventory_item_id,
      booking_id,
      status,
      severity,
      reported_by,
      assigned_to,
      damage_title,
      damage_description,
      repair_notes,
      estimated_repair_cost,
      actual_repair_cost,
      photo_url,
      reported_at,
      repaired_at,
      closed_at,
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
        condition,
        warehouse_locations (
          id,
          name
        )
      ),
      bookings (
        id,
        booking_number,
        event_date
      )
    `
    )
    .order("updated_at", { ascending: false });

  if (selectedStatus === "active") {
    reportsRequest = reportsRequest.in("status", [
      "reported",
      "repair_needed",
      "in_repair",
    ]);
  } else if (selectedStatus !== "all") {
    reportsRequest = reportsRequest.eq("status", selectedStatus);
  }

  if (selectedSeverity !== "all") {
    reportsRequest = reportsRequest.eq("severity", selectedSeverity);
  }

  const [reportsResult, unitsResult] = await Promise.all([
    reportsRequest,
    supabase
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
        inventory_items (
          id,
          name,
          sku,
          image_url
        ),
        warehouse_locations (
          id,
          name
        )
      `
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  if (reportsResult.error) {
    throw new Error(reportsResult.error.message);
  }

  if (unitsResult.error) {
    throw new Error(unitsResult.error.message);
  }

  const reports = (reportsResult.data || []).filter((report: any) => {
    if (!query) return true;

    const text = [
      report.status,
      report.severity,
      report.reported_by,
      report.assigned_to,
      report.damage_title,
      report.damage_description,
      report.repair_notes,
      report.inventory_items?.name,
      report.inventory_items?.sku,
      report.inventory_units?.unit_code,
      report.inventory_units?.serial_number,
      report.inventory_units?.barcode,
      report.bookings?.booking_number,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(query.toLowerCase());
  });

  const units = unitsResult.data || [];

  const activeCount = reports.filter((report: any) =>
    ["reported", "repair_needed", "in_repair"].includes(String(report.status || ""))
  ).length;

  const criticalCount = reports.filter(
    (report: any) => String(report.severity || "") === "critical"
  ).length;

  const repairCostTotal = reports.reduce((sum: number, report: any) => {
    return (
      sum +
      Number(report.estimated_repair_cost || 0) +
      Number(report.actual_repair_cost || 0)
    );
  }, 0);

  const repairedCount = reports.filter(
    (report: any) => String(report.status || "") === "repaired"
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
              Damage Reports / Repairs
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Повреждения, ремонт, ответственный сотрудник, стоимость ремонта и
              статус единицы на складе.
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
        <SummaryCard label="Active reports" value={activeCount} />
        <SummaryCard label="Critical" value={criticalCount} />
        <SummaryCard label="Repair costs" value={money(repairCostTotal)} />
        <SummaryCard label="Repaired" value={repairedCount} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              New damage report
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Выбери складскую единицу и создай отчет о повреждении.
            </p>
          </div>

          <form action={createDamageReportAction} className="space-y-6">
            <div className="grid gap-4 p-6">
              <Field label="Inventory unit">
                <Select name="inventoryUnitId" required>
                  <option value="">Choose unit</option>
                  {units.map((unit: any) => (
                    <option key={unit.id} value={unit.id}>
                      {UnitOptionLabel({ unit })}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Status">
                  <Select name="status" defaultValue="reported">
                    {statuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Severity">
                  <Select name="severity" defaultValue="medium">
                    {severities.map((severity) => (
                      <option key={severity.value} value={severity.value}>
                        {severity.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Reported by">
                  <Input name="reportedBy" placeholder="Employee" />
                </Field>

                <Field label="Assigned to">
                  <Input name="assignedTo" placeholder="Repair person" />
                </Field>
              </div>

              <Field label="Damage title">
                <Input
                  name="damageTitle"
                  placeholder="Small tear, zipper broken, blower issue..."
                />
              </Field>

              <Field label="Damage description">
                <Textarea
                  name="damageDescription"
                  rows={5}
                  placeholder="Describe what happened and what needs to be checked."
                />
              </Field>

              <Field label="Repair notes">
                <Textarea
                  name="repairNotes"
                  rows={4}
                  placeholder="Repair plan, materials, vendor, etc."
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Estimated cost">
                  <Input
                    name="estimatedRepairCost"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                  />
                </Field>

                <Field label="Actual cost">
                  <Input
                    name="actualRepairCost"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                  />
                </Field>
              </div>
            </div>

            <div className="border-t border-[#eee5d9] px-6 py-5">
              <button
                type="submit"
                className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.24)] transition hover:bg-[#b78744]"
              >
                Create damage report
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Damage queue
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Активные повреждения и история ремонтов.
            </p>

            <form className="mt-5 grid gap-3 xl:grid-cols-[1fr_170px_150px_120px]">
              <Input name="q" defaultValue={query} placeholder="Search damages..." />

              <Select name="status" defaultValue={selectedStatus}>
                <option value="active">Active reports</option>
                <option value="all">All statuses</option>
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>

              <Select name="severity" defaultValue={selectedSeverity}>
                <option value="all">All severity</option>
                {severities.map((severity) => (
                  <option key={severity.value} value={severity.value}>
                    {severity.label}
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
            {reports.map((report: any) => {
              const item = report.inventory_items;
              const unit = report.inventory_units;
              const booking = report.bookings;

              return (
                <details key={report.id} className="group">
                  <summary className="grid cursor-pointer gap-4 px-6 py-5 transition hover:bg-[#fcfaf7] xl:grid-cols-[1fr_130px_120px_110px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-[#1f1e1b]">
                          {report.damage_title || "Damage report"}
                        </div>

                        <StatusBadge value={report.status} />
                        <SeverityBadge value={report.severity} />
                      </div>

                      <div className="mt-1 text-sm text-[#6c6258]">
                        {item?.name || "Inventory item"} ·{" "}
                        {unit?.unit_code || unit?.serial_number || "Unit"}
                      </div>

                      <div className="mt-1 text-xs text-[#8b8177]">
                        Reported {formatDateTime(report.reported_at)}
                        {booking?.booking_number
                          ? ` · Booking #${booking.booking_number}`
                          : ""}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                        Assigned
                      </div>

                      <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                        {report.assigned_to || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                        Cost
                      </div>

                      <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                        {money(
                          Number(report.estimated_repair_cost || 0) +
                            Number(report.actual_repair_cost || 0)
                        )}
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
                        action={updateDamageReportAction}
                        className="grid gap-4 rounded-[26px] border border-[#eee5d9] bg-white p-5 md:grid-cols-2"
                      >
                        <input type="hidden" name="reportId" value={report.id} />

                        <Field label="Status">
                          <Select name="status" defaultValue={report.status}>
                            {statuses.map((status) => (
                              <option key={status.value} value={status.value}>
                                {status.label}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field label="Severity">
                          <Select name="severity" defaultValue={report.severity}>
                            {severities.map((severity) => (
                              <option key={severity.value} value={severity.value}>
                                {severity.label}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field label="Reported by">
                          <Input
                            name="reportedBy"
                            defaultValue={report.reported_by || ""}
                          />
                        </Field>

                        <Field label="Assigned to">
                          <Input
                            name="assignedTo"
                            defaultValue={report.assigned_to || ""}
                          />
                        </Field>

                        <div className="md:col-span-2">
                          <Field label="Damage title">
                            <Input
                              name="damageTitle"
                              defaultValue={report.damage_title || ""}
                            />
                          </Field>
                        </div>

                        <div className="md:col-span-2">
                          <Field label="Damage description">
                            <Textarea
                              name="damageDescription"
                              rows={5}
                              defaultValue={report.damage_description || ""}
                            />
                          </Field>
                        </div>

                        <div className="md:col-span-2">
                          <Field label="Repair notes">
                            <Textarea
                              name="repairNotes"
                              rows={4}
                              defaultValue={report.repair_notes || ""}
                            />
                          </Field>
                        </div>

                        <Field label="Estimated cost">
                          <Input
                            name="estimatedRepairCost"
                            type="number"
                            step="0.01"
                            defaultValue={report.estimated_repair_cost || "0"}
                          />
                        </Field>

                        <Field label="Actual cost">
                          <Input
                            name="actualRepairCost"
                            type="number"
                            step="0.01"
                            defaultValue={report.actual_repair_cost || "0"}
                          />
                        </Field>

                        <div className="md:col-span-2">
                          <button
                            type="submit"
                            className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                          >
                            Save damage report
                          </button>
                        </div>
                      </form>

                      <aside className="space-y-3">
                        <div className="rounded-[26px] border border-[#eee5d9] bg-white p-5">
                          <div className="text-sm font-semibold text-[#1f1e1b]">
                            Quick status
                          </div>

                          <div className="mt-4 grid gap-2">
                            {statuses.map((status) => (
                              <form
                                key={status.value}
                                action={quickUpdateDamageStatusAction}
                              >
                                <input
                                  type="hidden"
                                  name="reportId"
                                  value={report.id}
                                />
                                <input
                                  type="hidden"
                                  name="status"
                                  value={status.value}
                                />

                                <button
                                  type="submit"
                                  className={[
                                    "w-full rounded-full px-4 py-2 text-left text-xs font-semibold transition",
                                    report.status === status.value
                                      ? "bg-[#23313f] text-white"
                                      : "bg-[#f4ede2] text-[#6c6258] hover:bg-[#eadfce]",
                                  ].join(" ")}
                                >
                                  {status.label}
                                </button>
                              </form>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-[26px] border border-[#eee5d9] bg-white p-5">
                          <div className="text-sm font-semibold text-[#1f1e1b]">
                            Linked records
                          </div>

                          <div className="mt-3 space-y-2 text-sm text-[#6c6258]">
                            <div>
                              Item:{" "}
                              <span className="font-semibold text-[#1f1e1b]">
                                {item?.name || "—"}
                              </span>
                            </div>

                            <div>
                              Unit:{" "}
                              <span className="font-semibold text-[#1f1e1b]">
                                {unit?.unit_code || unit?.serial_number || "—"}
                              </span>
                            </div>

                            <div>
                              Unit status:{" "}
                              <span className="font-semibold text-[#1f1e1b]">
                                {prettyStatus(unit?.status)}
                              </span>
                            </div>

                            {booking?.id && (
                              <a
                                href={`/admin/bookings/${booking.id}`}
                                className="block rounded-full bg-[#23313f] px-4 py-2 text-center text-xs font-semibold text-white transition hover:bg-[#18222d]"
                              >
                                Open booking
                              </a>
                            )}
                          </div>
                        </div>

                        <form
                          action={deleteDamageReportAction}
                          className="rounded-[26px] border border-red-100 bg-red-50 p-5"
                        >
                          <input type="hidden" name="reportId" value={report.id} />

                          <div className="text-sm font-semibold text-red-800">
                            Delete report
                          </div>

                          <p className="mt-1 text-xs leading-5 text-red-700">
                            Удаляй только ошибочные или тестовые отчеты.
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

            {reports.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No damage reports
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Create a report when a unit is damaged or needs repair.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
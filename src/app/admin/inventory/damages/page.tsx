import Link from "next/link";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createDamageReportAction, updateDamageStatusAction } from "./actions";

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function severityClass(value: string | null | undefined) {
  if (value === "critical") return "bg-red-600 text-white";
  if (value === "high") return "bg-red-50 text-red-700 ring-1 ring-red-200";
  if (value === "low") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  return "bg-[#fff8e8] text-[#8a6b20] ring-1 ring-[#ead6a8]";
}

function statusClass(value: string | null | undefined) {
  if (value === "resolved" || value === "closed") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (value === "in_repair") return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  return "bg-red-50 text-red-700 ring-1 ring-red-200";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">{label}</span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />
  );
}

type PageProps = { searchParams?: Promise<{ status?: string }> };

export default async function DamageReportsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedStatus = resolvedSearchParams?.status || "open";
  const supabase = await createClient();

  let reportsQuery = supabase
    .from("damage_reports")
    .select(
      `
      id,
      title,
      severity,
      status,
      repair_cost,
      description,
      reported_at,
      resolved_at,
      inventory_items (id, name, sku, image_url),
      inventory_units (id, unit_code, serial_number, status),
      bookings (id, booking_number, event_date, customers (full_name, phone))
    `
    )
    .order("reported_at", { ascending: false });

  if (selectedStatus !== "all") reportsQuery = reportsQuery.eq("status", selectedStatus);

  const [reportsResult, unitsResult, itemsResult, bookingsResult] = await Promise.all([
    reportsQuery.limit(150),
    supabase
      .from("inventory_units")
      .select("id, unit_code, serial_number, status, inventory_item_id, inventory_items (name, sku)")
      .is("deleted_at", null)
      .order("unit_code"),
    supabase
      .from("inventory_items")
      .select("id, name, sku")
      .is("deleted_at", null)
      .neq("active", false)
      .order("name"),
    supabase
      .from("bookings")
      .select("id, booking_number, event_date, customers (full_name)")
      .order("event_date", { ascending: false })
      .limit(80),
  ]);

  if (reportsResult.error) throw new Error(reportsResult.error.message);
  if (unitsResult.error) throw new Error(unitsResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (bookingsResult.error) throw new Error(bookingsResult.error.message);

  const reports = reportsResult.data || [];
  const units = unitsResult.data || [];
  const items = itemsResult.data || [];
  const bookings = bookingsResult.data || [];

  const openCount = reports.filter((report: any) => report.status === "open").length;
  const repairCount = reports.filter((report: any) => report.status === "in_repair").length;
  const totalRepairCost = reports.reduce((sum: number, report: any) => sum + Number(report.repair_cost || 0), 0);

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">Inventory risk</div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">Damage Reports</h2>
            <p className="mt-2 hidden max-w-4xl text-sm leading-6 text-[#6c6258] sm:block">
              Фиксация повреждений, стоимости ремонта и статуса единиц. Это помогает понимать реальную прибыль по каждому батуту.
            </p>
          </div>
          <Link href="/admin/inventory/cleaning" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#23313f] px-4 text-sm font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold">Cleaning queue</Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Visible</div><div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">{reports.length}</div></div>
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Open</div><div className="mt-2 text-3xl font-semibold text-red-700">{openCount}</div></div>
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">In repair</div><div className="mt-2 text-3xl font-semibold text-[#355879]">{repairCount}</div></div>
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Repair cost</div><div className="mt-2 text-3xl font-semibold text-[#8a6b20]">{money(totalRepairCost)}</div></div>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">New damage report</h3>
            <p className="mt-1 text-sm leading-6 text-[#6c6258]">Добавь повреждение и привяжи его к unit, item или booking.</p>
          </div>
          <form action={createDamageReportAction} className="space-y-3.5 p-3.5 sm:space-y-5 sm:p-6">
            <input type="hidden" name="damageRequestId" value={randomUUID()} />
            <Field label="Title"><Input name="title" placeholder="Small tear on slide vinyl" required /></Field>
            <Field label="Unit"><Select name="inventoryUnitId" defaultValue=""><option value="">No unit</option>{units.map((unit: any) => (<option key={unit.id} value={unit.id}>{unit.unit_code || unit.serial_number || "Unit"} · {unit.inventory_items?.name || "Item"} · {unit.status}</option>))}</Select></Field>
            <Field label="Item"><Select name="inventoryItemId" defaultValue=""><option value="">No item</option>{items.map((item: any) => (<option key={item.id} value={item.id}>{item.name} {item.sku ? `· ${item.sku}` : ""}</option>))}</Select></Field>
            <Field label="Booking"><Select name="bookingId" defaultValue=""><option value="">No booking</option>{bookings.map((booking: any) => (<option key={booking.id} value={booking.id}>{booking.booking_number || "Booking"} · {booking.event_date || "No date"} · {booking.customers?.full_name || "Customer"}</option>))}</Select></Field>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2"><Field label="Severity"><Select name="severity" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></Select></Field><Field label="Repair cost"><Input name="repairCost" type="number" step="0.01" defaultValue="0" /></Field></div>
            <Field label="Description"><Textarea name="description" rows={4} placeholder="What happened, what needs to be repaired..." /></Field>
            <button className="w-full rounded-xl bg-[#c9964f] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-5 sm:font-semibold">Create report</button>
          </form>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
              <div><h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">Reports</h3><p className="mt-1 text-sm leading-6 text-[#6c6258]">Открытые повреждения и ремонтные задачи.</p></div>
              <form className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex"><Select name="status" defaultValue={selectedStatus}><option value="open">Open</option><option value="in_repair">In repair</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="all">All</option></Select><button className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white">Filter</button></form>
            </div>
          </div>
          <div className="divide-y divide-[#eee5d9]">
            {reports.map((report: any) => (
              <div key={report.id} className="px-3.5 py-3.5 sm:px-6 sm:py-5">
                <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${severityClass(report.severity)}`}>{report.severity}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(report.status)}`}>{report.status}</span><span className="text-xs font-semibold text-[#9a7a49]">{formatDate(report.reported_at)}</span></div>
                    <div className="mt-3 text-base font-semibold text-[#1f1e1b]">{report.title}</div>
                    <div className="mt-1 text-xs text-[#6c6258]">
                      {report.inventory_items?.name || "No item"} · {report.inventory_units?.unit_code || report.inventory_units?.serial_number || "No unit"} · {report.bookings?.booking_number || "No booking"}
                    </div>
                    {report.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#6c6258]">{report.description}</p>}
                    <div className="mt-2 text-sm font-semibold text-[#8a6b20]">Estimated repair: {money(report.repair_cost)}</div>
                  </div>
                  <form action={updateDamageStatusAction} className="grid w-full grid-cols-2 gap-2 rounded-[16px] bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] sm:rounded-[22px] sm:p-3 md:w-[260px] md:grid-cols-1">
                    <input type="hidden" name="reportId" value={report.id} />
                    <Select name="status" defaultValue={report.status || "open"}><option value="open">Open</option><option value="in_repair">In repair</option><option value="resolved">Resolved</option><option value="closed">Closed</option></Select>
                    <Select name="unitStatus" defaultValue=""><option value="">Do not change unit</option><option value="maintenance">Send to maintenance</option><option value="damaged">Keep damaged</option><option value="available">Mark available</option><option value="retired">Retire unit</option></Select>
                    <Textarea name="notes" rows={2} placeholder="Update notes..." className="col-span-2 md:col-span-1" />
                    <button className="col-span-2 rounded-xl bg-[#23313f] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#18222d] md:col-span-1 md:rounded-full md:py-2 md:font-semibold">Update</button>
                  </form>
                </div>
              </div>
            ))}
            {reports.length === 0 && <div className="px-6 py-16 text-center"><div className="text-lg font-semibold text-[#1f1e1b]">No damage reports</div><p className="mt-2 text-sm text-[#6c6258]">New damage reports will appear here.</p></div>}
          </div>
        </section>
      </section>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  createLeadAction,
  deleteLeadAction,
  quickUpdateLeadStatusAction,
  updateLeadAction,
} from "./actions";

const statuses = [
  { value: "new", label: "New", tone: "bg-blue-50 text-blue-700 ring-blue-200" },
  {
    value: "quote_sent",
    label: "Quote sent",
    tone: "bg-purple-50 text-purple-700 ring-purple-200",
  },
  {
    value: "follow_up",
    label: "Follow-up",
    tone: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  {
    value: "deposit_pending",
    label: "Deposit pending",
    tone: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  {
    value: "booked",
    label: "Booked",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  { value: "lost", label: "Lost", tone: "bg-neutral-100 text-neutral-600 ring-neutral-200" },
  {
    value: "cancelled",
    label: "Cancelled",
    tone: "bg-red-50 text-red-700 ring-red-200",
  },
];

const sources = [
  { value: "instagram", label: "Instagram" },
  { value: "website", label: "Website" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "referral", label: "Referral" },
  { value: "repeat_customer", label: "Repeat customer" },
  { value: "other", label: "Other" },
];

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "No date";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function timeValue(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function statusMeta(value: string | null | undefined) {
  return (
    statuses.find((status) => status.value === value) || {
      value: "new",
      label: "New",
      tone: "bg-blue-50 text-blue-700 ring-blue-200",
    }
  );
}

function sourceLabel(value: string | null | undefined) {
  return sources.find((source) => source.value === value)?.label || "Other";
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

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    source?: string;
    q?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const selectedStatus = String(resolvedSearchParams?.status || "all");
  const selectedSource = String(resolvedSearchParams?.source || "all");
  const query = String(resolvedSearchParams?.q || "").trim();

  const { supabase } = await requireAdminPermission("customers.view");

  let request = supabase
    .from("booking_leads")
    .select(
      `
      id,
      customer_name,
      customer_phone,
      customer_email,
      instagram_username,
      event_date,
      event_start_time,
      event_end_time,
      event_address,
      event_city,
      event_state,
      event_zip,
      requested_product,
      requested_category,
      source,
      status,
      quoted_subtotal,
      quoted_delivery_fee,
      quoted_tax,
      quoted_total,
      deposit_requested,
      last_contacted_at,
      next_follow_up_at,
      notes,
      booking_id,
      created_at,
      updated_at
    `
    )
    .order("created_at", { ascending: false });

  if (selectedStatus !== "all") {
    request = request.eq("status", selectedStatus);
  }

  if (selectedSource !== "all") {
    request = request.eq("source", selectedSource);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  const leads = (data || []).filter((lead: any) => {
    if (!query) return true;

    const text = [
      lead.customer_name,
      lead.customer_phone,
      lead.customer_email,
      lead.instagram_username,
      lead.event_address,
      lead.event_city,
      lead.event_zip,
      lead.requested_product,
      lead.requested_category,
      lead.notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(query.toLowerCase());
  });

  const total = leads.length;
  const followUps = leads.filter((lead: any) =>
    ["follow_up", "quote_sent", "deposit_pending"].includes(lead.status)
  ).length;
  const booked = leads.filter((lead: any) => lead.status === "booked").length;
  const quotedTotal = leads.reduce((sum: number, lead: any) => {
    return sum + Number(lead.quoted_total || 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* MOBILE LEADS */}
<section className="space-y-3 lg:hidden">
  <div className="flex items-center justify-between gap-3">
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
        Sales
      </div>

      <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[#1f1e1b]">
        Leads
      </h1>
    </div>

    <a
      href="/admin/bookings/new"
      className="flex min-h-[44px] items-center justify-center rounded-full bg-[#c9964f] px-4 text-sm font-semibold text-white"
    >
      + Booking
    </a>
  </div>

  <div className="grid grid-cols-3 gap-2">
    <div className="rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#91887f]">
        Leads
      </div>
      <div className="mt-1 text-xl font-bold text-[#1f1e1b]">
        {total}
      </div>
    </div>

    <div className="rounded-2xl bg-[#fff0d5] px-3 py-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9b761f]">
        Follow-up
      </div>
      <div className="mt-1 text-xl font-bold text-[#8a5a00]">
        {followUps}
      </div>
    </div>

    <div className="rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#91887f]">
        Booked
      </div>
      <div className="mt-1 text-xl font-bold text-[#1f1e1b]">
        {booked}
      </div>
    </div>
  </div>

  <form className="rounded-[22px] bg-white p-3 shadow-sm ring-1 ring-black/5">
    <Input
      name="q"
      defaultValue={query}
      placeholder="Search leads..."
    />

    <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
      <Select
        name="status"
        defaultValue={selectedStatus}
      >
        <option value="all">All statuses</option>

        {statuses.map((status) => (
          <option
            key={status.value}
            value={status.value}
          >
            {status.label}
          </option>
        ))}
      </Select>

      <Select
        name="source"
        defaultValue={selectedSource}
      >
        <option value="all">All sources</option>

        {sources.map((source) => (
          <option
            key={source.value}
            value={source.value}
          >
            {source.label}
          </option>
        ))}
      </Select>

      <button
        type="submit"
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-[#23313f] px-3 font-bold text-white"
      >
        →
      </button>
    </div>
  </form>

  <div className="overflow-hidden rounded-[24px] bg-white shadow-sm ring-1 ring-black/5">
    {leads.map((lead: any) => {
      const leadName =
        lead.customer_name ||
        lead.instagram_username ||
        lead.customer_phone ||
        "Unnamed lead";

      return (
        <Link
          key={lead.id}
          href={`/admin/crm/events/${lead.id}`}
          className="block border-b border-[#eee7de] px-4 py-3.5 last:border-0 active:bg-[#f7f3ed]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-[15px] font-bold text-[#25221f]">
                  {leadName}
                </div>

                <StatusBadge value={lead.status} />
              </div>

              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-[#81776f]">
                <span className="shrink-0 font-semibold text-[#315ea8]">
                  {sourceLabel(lead.source)}
                </span>

                {lead.requested_product && (
                  <>
                    <span>·</span>

                    <span className="truncate">
                      {lead.requested_product}
                    </span>
                  </>
                )}
              </div>

              {(lead.event_date ||
                lead.event_city ||
                lead.event_zip) && (
                <div className="mt-1.5 truncate text-xs font-semibold text-[#8a6740]">
                  {lead.event_date
                    ? formatDate(lead.event_date)
                    : "No date"}

                  {lead.event_city
                    ? ` · ${lead.event_city}`
                    : lead.event_zip
                      ? ` · ZIP ${lead.event_zip}`
                      : ""}
                </div>
              )}
            </div>

            <div className="shrink-0 text-right">
              <div className="text-sm font-bold text-[#25221f]">
                {money(lead.quoted_total)}
              </div>

              <div className="mt-2 text-lg leading-none text-[#9b9187]">
                ›
              </div>
            </div>
          </div>
        </Link>
      );
    })}

    {leads.length === 0 && (
      <div className="px-6 py-16 text-center text-sm text-[#8b8177]">
        No leads found.
      </div>
    )}
  </div>
</section>
     <section className="hidden rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)] lg:block">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Sales pipeline
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Leads / Quotes
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Запросы из Instagram, сайта, WhatsApp и телефона. Здесь видно,
              кому отправили цену, кто не оплатил депозит и кому нужно написать
              follow-up.
            </p>
          </div>

          <a
            href="/admin/bookings/new"
            className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.24)] transition hover:bg-[#b78744]"
          >
            New booking
          </a>
        </div>
      </section>
    

      <section className="hidden gap-4 md:grid-cols-4 lg:grid">
        <SummaryCard label="Leads" value={total} hint="Current filtered list" />
        <SummaryCard label="Needs follow-up" value={followUps} />
        <SummaryCard label="Booked" value={booked} />
        <SummaryCard label="Quoted total" value={money(quotedTotal)} />
      </section>

      <section className="hidden gap-6 lg:grid xl:grid-cols-[420px_1fr]">
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">Add lead</h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Быстро добавь запрос клиента, даже если еще нет точного товара или
              адреса.
            </p>
          </div>

          <form action={createLeadAction} className="space-y-6">
            <div className="grid gap-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Customer name">
                  <Input name="customerName" placeholder="Name" />
                </Field>

                <Field label="Instagram">
                  <Input name="instagramUsername" placeholder="@username" />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Phone">
                  <Input name="customerPhone" placeholder="(818) 000-0000" />
                </Field>

                <Field label="Email">
                  <Input name="customerEmail" type="email" placeholder="email" />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Event date">
                  <Input name="eventDate" type="date" />
                </Field>

                <Field label="Start">
                  <Input name="eventStartTime" type="time" />
                </Field>

                <Field label="End">
                  <Input name="eventEndTime" type="time" />
                </Field>
              </div>

              <Field label="Address">
                <Input name="eventAddress" placeholder="Event address" />
              </Field>

              <div className="grid gap-4 md:grid-cols-[1fr_90px_110px]">
                <Field label="City">
                  <Input name="eventCity" placeholder="City" />
                </Field>

                <Field label="State">
                  <Input name="eventState" defaultValue="CA" />
                </Field>

                <Field label="ZIP">
                  <Input name="eventZip" placeholder="91011" />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Requested product">
                  <Input
                    name="requestedProduct"
                    placeholder="White Castle, Soft Play..."
                  />
                </Field>

                <Field label="Category">
                  <Input
                    name="requestedCategory"
                    placeholder="Bounce house, Soft Play..."
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Source">
                  <Select name="source" defaultValue="instagram">
                    {sources.map((source) => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Status">
                  <Select name="status" defaultValue="new">
                    {statuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Quoted subtotal">
                  <Input
                    name="quotedSubtotal"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                  />
                </Field>

                <Field label="Delivery fee">
                  <Input
                    name="quotedDeliveryFee"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Tax">
                  <Input
                    name="quotedTax"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                  />
                </Field>

                <Field label="Quoted total">
                  <Input
                    name="quotedTotal"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Deposit requested">
                  <Input
                    name="depositRequested"
                    type="number"
                    step="0.01"
                    defaultValue="50"
                  />
                </Field>

                <Field label="Next follow-up">
                  <Input name="nextFollowUpAt" type="datetime-local" />
                </Field>
              </div>

              <Field label="Notes">
                <Textarea
                  name="notes"
                  rows={5}
                  placeholder="Client asked for colors, delivery window, park rules..."
                />
              </Field>
            </div>

            <div className="border-t border-[#eee5d9] px-6 py-5">
              <button
                type="submit"
                className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.24)] transition hover:bg-[#b78744]"
              >
                Add lead
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[#1f1e1b]">
                  Lead pipeline
                </h3>

                <p className="mt-1 text-sm leading-6 text-[#6c6258]">
                  Быстро меняй статус и не теряй клиентов, которые еще не
                  оплатили депозит.
                </p>
              </div>
            </div>

            <form className="mt-5 grid gap-3 xl:grid-cols-[1fr_180px_180px_120px]">
              <Input name="q" defaultValue={query} placeholder="Search leads..." />

              <Select name="status" defaultValue={selectedStatus}>
                <option value="all">All statuses</option>
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>

              <Select name="source" defaultValue={selectedSource}>
                <option value="all">All sources</option>
                {sources.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
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
            {leads.map((lead: any) => {
              const contact =
                lead.customer_phone ||
                lead.instagram_username ||
                lead.customer_email ||
                "No contact";

              return (
                <details key={lead.id} className="group">
                  <summary className="grid cursor-pointer gap-4 px-6 py-5 transition hover:bg-[#fcfaf7] xl:grid-cols-[1fr_130px_130px_120px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-[#1f1e1b]">
                          {lead.customer_name ||
                            lead.instagram_username ||
                            lead.customer_phone ||
                            "Unnamed lead"}
                        </div>

                        <StatusBadge value={lead.status} />
                      </div>

                      <div className="mt-1 text-sm text-[#6c6258]">
                        {contact} · {sourceLabel(lead.source)}
                      </div>

                      <div className="mt-1 text-xs text-[#8b8177]">
                        {lead.requested_product || "No product yet"}
                        {lead.event_zip ? ` · ZIP ${lead.event_zip}` : ""}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                        Event
                      </div>

                      <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                        {formatDate(lead.event_date)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                        Quote
                      </div>

                      <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                        {money(lead.quoted_total)}
                      </div>
                    </div>

                    <div className="flex items-center justify-end">
                      <span className="rounded-full bg-[#f4ede2] px-3 py-2 text-xs font-semibold text-[#6c6258] group-open:bg-[#23313f] group-open:text-white">
                        Details
                      </span>
                    </div>
                  </summary>

                  <div className="bg-[#fcfaf7] px-6 pb-6">
                    <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
                      <form
                        action={updateLeadAction}
                        className="grid gap-4 rounded-[26px] border border-[#eee5d9] bg-white p-5 md:grid-cols-2"
                      >
                        <input type="hidden" name="leadId" value={lead.id} />

                        <Field label="Customer name">
                          <Input
                            name="customerName"
                            defaultValue={lead.customer_name || ""}
                          />
                        </Field>

                        <Field label="Instagram">
                          <Input
                            name="instagramUsername"
                            defaultValue={lead.instagram_username || ""}
                          />
                        </Field>

                        <Field label="Phone">
                          <Input
                            name="customerPhone"
                            defaultValue={lead.customer_phone || ""}
                          />
                        </Field>

                        <Field label="Email">
                          <Input
                            name="customerEmail"
                            type="email"
                            defaultValue={lead.customer_email || ""}
                          />
                        </Field>

                        <Field label="Event date">
                          <Input
                            name="eventDate"
                            type="date"
                            defaultValue={lead.event_date || ""}
                          />
                        </Field>

                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Start">
                            <Input
                              name="eventStartTime"
                              type="time"
                              defaultValue={timeValue(lead.event_start_time)}
                            />
                          </Field>

                          <Field label="End">
                            <Input
                              name="eventEndTime"
                              type="time"
                              defaultValue={timeValue(lead.event_end_time)}
                            />
                          </Field>
                        </div>

                        <Field label="Address">
                          <Input
                            name="eventAddress"
                            defaultValue={lead.event_address || ""}
                          />
                        </Field>

                        <div className="grid gap-4 md:grid-cols-[1fr_80px_100px]">
                          <Field label="City">
                            <Input
                              name="eventCity"
                              defaultValue={lead.event_city || ""}
                            />
                          </Field>

                          <Field label="State">
                            <Input
                              name="eventState"
                              defaultValue={lead.event_state || "CA"}
                            />
                          </Field>

                          <Field label="ZIP">
                            <Input
                              name="eventZip"
                              defaultValue={lead.event_zip || ""}
                            />
                          </Field>
                        </div>

                        <Field label="Requested product">
                          <Input
                            name="requestedProduct"
                            defaultValue={lead.requested_product || ""}
                          />
                        </Field>

                        <Field label="Category">
                          <Input
                            name="requestedCategory"
                            defaultValue={lead.requested_category || ""}
                          />
                        </Field>

                        <Field label="Source">
                          <Select name="source" defaultValue={lead.source || "instagram"}>
                            {sources.map((source) => (
                              <option key={source.value} value={source.value}>
                                {source.label}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field label="Status">
                          <Select name="status" defaultValue={lead.status || "new"}>
                            {statuses.map((status) => (
                              <option key={status.value} value={status.value}>
                                {status.label}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field label="Quoted subtotal">
                          <Input
                            name="quotedSubtotal"
                            type="number"
                            step="0.01"
                            defaultValue={lead.quoted_subtotal || "0"}
                          />
                        </Field>

                        <Field label="Delivery fee">
                          <Input
                            name="quotedDeliveryFee"
                            type="number"
                            step="0.01"
                            defaultValue={lead.quoted_delivery_fee || "0"}
                          />
                        </Field>

                        <Field label="Tax">
                          <Input
                            name="quotedTax"
                            type="number"
                            step="0.01"
                            defaultValue={lead.quoted_tax || "0"}
                          />
                        </Field>

                        <Field label="Quoted total">
                          <Input
                            name="quotedTotal"
                            type="number"
                            step="0.01"
                            defaultValue={lead.quoted_total || "0"}
                          />
                        </Field>

                        <Field label="Deposit requested">
                          <Input
                            name="depositRequested"
                            type="number"
                            step="0.01"
                            defaultValue={lead.deposit_requested || "50"}
                          />
                        </Field>

                        <Field label="Next follow-up">
                          <Input
                            name="nextFollowUpAt"
                            type="datetime-local"
                            defaultValue={formatDateTimeLocal(
                              lead.next_follow_up_at
                            )}
                          />
                        </Field>

                        <div className="md:col-span-2">
                          <Field label="Notes">
                            <Textarea
                              name="notes"
                              rows={5}
                              defaultValue={lead.notes || ""}
                            />
                          </Field>
                        </div>

                        <div className="md:col-span-2">
                          <button
                            type="submit"
                            className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                          >
                            Save lead
                          </button>
                        </div>
                      </form>

                      <aside className="space-y-3">
                        <Link
                          href={`/admin/crm/events/${lead.id}`}
                          className="block rounded-[26px] bg-[#23313f] p-5 text-white transition hover:bg-[#18222d]"
                        >
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">CRM</div>
                          <div className="mt-2 text-base font-semibold">Open Event Center</div>
                          <div className="mt-1 text-xs leading-5 text-white/70">Conversation, quote, booking, payments, tasks and timeline.</div>
                        </Link>

                        <div className="rounded-[26px] border border-[#eee5d9] bg-white p-5">
                          <div className="text-sm font-semibold text-[#1f1e1b]">
                            Quick status
                          </div>

                          <div className="mt-4 grid gap-2">
                            {statuses.map((status) => (
                              <form
                                key={status.value}
                                action={quickUpdateLeadStatusAction}
                              >
                                <input
                                  type="hidden"
                                  name="leadId"
                                  value={lead.id}
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
                                    lead.status === status.value
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

                        <form
                          action={deleteLeadAction}
                          className="rounded-[26px] border border-red-100 bg-red-50 p-5"
                        >
                          <input type="hidden" name="leadId" value={lead.id} />

                          <div className="text-sm font-semibold text-red-800">
                            Delete lead
                          </div>

                          <p className="mt-1 text-xs leading-5 text-red-700">
                            Удаляй только ошибочные или тестовые записи.
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

            {leads.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No leads yet
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Add your first quote request from Instagram, website or phone.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}
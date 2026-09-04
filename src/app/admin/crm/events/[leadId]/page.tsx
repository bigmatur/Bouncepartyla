import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  updateLeadAction,
  updateLeadFollowUpAction,
} from "../../../leads/actions";
import {
  completeTaskAction,
  createTaskAction,
} from "../../../tasks/actions";
import {
  resendUpdatedContractManualAction,
} from "../../../bookings/[id]/actions";

type TimelineItem = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail?: string;
  href?: string;
};

function money(value: unknown) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function label(value: unknown) {
  return String(value || "—").replaceAll("_", " ");
}

function StatCard({ labelText, value, hint }: { labelText: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[24px] border border-black/5 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9a723e]">{labelText}</div>
      <div className="mt-2 text-xl font-semibold text-[#1f1e1b]">{value}</div>
      {hint && <div className="mt-1 text-xs leading-5 text-[#7d7369]">{hint}</div>}
    </div>
  );
}

export default async function CrmEventCenterPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const { supabase } = await requireAdminPermission("customers.view");

  const leadResult = await supabase
    .from("booking_leads")
    .select(`
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
    `)
    .eq("id", leadId)
    .maybeSingle();

  if (leadResult.error) throw new Error(leadResult.error.message);
  if (!leadResult.data) notFound();

  const lead: any = leadResult.data;

  const conversationsResult = await supabase
    .from("crm_conversations")
    .select("id, subject, status, priority, needs_reply, last_channel, last_message_at, last_inbound_at, last_outbound_at, booking_id, customer_id, created_at")
    .eq("lead_id", leadId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (conversationsResult.error) throw new Error(conversationsResult.error.message);
  const conversations: any[] = conversationsResult.data || [];
  const conversationIds = conversations.map((item) => item.id);

  const [messagesResult, notesResult, pipelineResult] = await Promise.all([
    conversationIds.length
      ? supabase
          .from("crm_messages")
          .select("id, conversation_id, direction, channel, sender_identity, recipient_identity, body_text, status, sent_at, delivered_at, created_at")
          .in("conversation_id", conversationIds)
          .order("sent_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(250)
      : Promise.resolve({ data: [], error: null } as any),
    supabase
      .from("crm_notes")
      .select("id, body, created_at, updated_at, conversation_id, booking_id, customer_id")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("crm_pipeline_history")
      .select("id, from_status, to_status, reason, changed_at, metadata")
      .eq("lead_id", leadId)
      .order("changed_at", { ascending: false })
      .limit(100),
  ]);

  if (messagesResult.error) throw new Error(messagesResult.error.message);
  if (notesResult.error) throw new Error(notesResult.error.message);
  if (pipelineResult.error) throw new Error(pipelineResult.error.message);

  let booking: any = null;
  let payments: any[] = [];
  let contracts: any[] = [];
  let tasks: any[] = [];
  let routeStops: any[] = [];
  let reservations: any[] = [];

  if (lead.booking_id) {
    const [bookingResult, paymentsResult, contractsResult, tasksResult, routesResult, reservationsResult] = await Promise.all([
      supabase
        .from("bookings")
        .select(`
          id, booking_number, status, event_date, event_start_time, event_end_time,
          setup_address, setup_city, setup_state, setup_zip,
          subtotal, delivery_fee, tax_amount, total_amount, deposit_amount,
          amount_paid, balance_due, payment_status, contract_status,
          created_at, updated_at,
          customers (id, full_name, phone, email),
          booking_items (id, quantity, products (id, name, image_url))
        `)
        .eq("id", lead.booking_id)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("id, method, amount, tip_amount, status, external_reference, created_at")
        .eq("booking_id", lead.booking_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contracts")
        .select("id, status, sent_at, viewed_at, signed_at, created_at")
        .eq("booking_id", lead.booking_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("id, title, description, task_type, due_at, status, completed_at, created_at, lead_id")
        .or(`booking_id.eq.${lead.booking_id},lead_id.eq.${leadId}`)
        .order("due_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("route_stops")
        .select("id, stop_type, status, stop_date, scheduled_start_time, scheduled_end_time, driver_name, arrived_at, completed_at, created_at")
        .eq("booking_id", lead.booking_id)
        .order("stop_date", { ascending: true })
        .order("scheduled_start_time", { ascending: true }),
      supabase
        .from("inventory_reservations")
        .select("id, status, quantity, reserved_from, reserved_until, inventory_items (id, name), inventory_units (id, unit_code, status)")
        .eq("booking_id", lead.booking_id)
        .order("reserved_from", { ascending: true }),
    ]);

    if (bookingResult.error) throw new Error(bookingResult.error.message);
    if (paymentsResult.error) throw new Error(paymentsResult.error.message);
    if (contractsResult.error) throw new Error(contractsResult.error.message);
    if (tasksResult.error) throw new Error(tasksResult.error.message);
    if (routesResult.error) throw new Error(routesResult.error.message);
    if (reservationsResult.error) throw new Error(reservationsResult.error.message);

    booking = bookingResult.data;
    payments = paymentsResult.data || [];
    contracts = contractsResult.data || [];
    tasks = tasksResult.data || [];
    routeStops = routesResult.data || [];
    reservations = reservationsResult.data || [];
  }

  if (!lead.booking_id) {
    const leadTasksResult = await supabase
      .from("tasks")
      .select("id, title, description, task_type, due_at, status, completed_at, created_at, lead_id")
      .eq("lead_id", leadId)
      .order("due_at", { ascending: true, nullsFirst: false });

    if (leadTasksResult.error) throw new Error(leadTasksResult.error.message);
    tasks = leadTasksResult.data || [];
  }

  const customer: any = booking
    ? Array.isArray(booking.customers)
      ? booking.customers[0]
      : booking.customers
    : null;

  const eventDate = booking?.event_date || lead.event_date;
  const eventCity = booking?.setup_city || lead.event_city;
  const eventState = booking?.setup_state || lead.event_state;
  const eventTitle = lead.customer_name || customer?.full_name || lead.instagram_username || "Event";
  const latestContract = contracts[0] || null;
  const openTasks = tasks.filter((item) => String(item.status || "") !== "completed");
  const needsReply = conversations.filter((item) => item.needs_reply).length;
  const inventoryReady = reservations.filter((item) => ["reserved", "allocated", "picked", "loaded", "installed"].includes(String(item.status || ""))).length;

  const timeline: TimelineItem[] = [];

  timeline.push({
    id: `lead-${lead.id}`,
    at: lead.created_at,
    kind: "Lead",
    title: "Event opportunity created",
    detail: `${label(lead.source)} · ${lead.requested_product || "Product not selected yet"}`,
  });

  for (const item of pipelineResult.data || []) {
    timeline.push({
      id: `pipeline-${item.id}`,
      at: item.changed_at,
      kind: "Pipeline",
      title: `${label(item.from_status)} → ${label(item.to_status)}`,
      detail: item.reason || undefined,
    });
  }

  for (const message of messagesResult.data || []) {
    timeline.push({
      id: `message-${message.id}`,
      at: message.sent_at || message.created_at,
      kind: String(message.channel || "CRM").toUpperCase(),
      title: message.direction === "outbound" ? "Staff replied" : "Customer message",
      detail: String(message.body_text || "").slice(0, 180) || "Message without text",
      href: `/admin/crm/inbox/${message.conversation_id}`,
    });
  }

  for (const note of notesResult.data || []) {
    timeline.push({
      id: `note-${note.id}`,
      at: note.created_at,
      kind: "Note",
      title: "Internal note",
      detail: String(note.body || "").slice(0, 220),
    });
  }

  if (booking) {
    timeline.push({
      id: `booking-${booking.id}`,
      at: booking.created_at,
      kind: "Booking",
      title: `${booking.booking_number || "Booking"} created`,
      detail: `Status: ${label(booking.status)} · Total ${money(booking.total_amount)}`,
      href: `/admin/bookings/${booking.id}`,
    });
  }

  for (const payment of payments) {
    timeline.push({
      id: `payment-${payment.id}`,
      at: payment.created_at,
      kind: "Payment",
      title: `${money(Math.max(0, Number(payment.amount || 0) - Number(payment.tip_amount || 0)))} received`,
      detail: `${label(payment.method)} · ${label(payment.status)}${Number(payment.tip_amount || 0) > 0 ? ` · Tip ${money(payment.tip_amount)}` : ""}`,
      href: booking ? `/admin/bookings/${booking.id}` : undefined,
    });
  }

  for (const contract of contracts) {
    timeline.push({
      id: `contract-${contract.id}`,
      at: contract.signed_at || contract.sent_at || contract.created_at,
      kind: "Contract",
      title: contract.signed_at ? "Contract signed" : contract.sent_at ? "Contract sent" : "Contract created",
      detail: `Status: ${label(contract.status)}`,
      href: booking ? `/admin/bookings/${booking.id}` : undefined,
    });
  }

  for (const task of tasks) {
    timeline.push({
      id: `task-${task.id}`,
      at: task.completed_at || task.created_at,
      kind: "Task",
      title: task.status === "completed" ? `Completed: ${task.title}` : task.title,
      detail: task.due_at ? `Due ${formatDateTime(task.due_at)} · ${label(task.status)}` : label(task.status),
      href: "/admin/tasks",
    });
  }

  for (const stop of routeStops) {
    timeline.push({
      id: `route-${stop.id}`,
      at: stop.completed_at || stop.arrived_at || stop.created_at,
      kind: "Route",
      title: `${label(stop.stop_type)} · ${label(stop.status)}`,
      detail: [stop.stop_date, stop.scheduled_start_time, stop.driver_name].filter(Boolean).join(" · ") || undefined,
      href: "/admin/routes",
    });
  }

  timeline.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

  return (
    <div className="space-y-6">
      {/* MOBILE EVENT CENTER */}
<section className="space-y-3 pb-24 lg:hidden">
  <div className="sticky top-[72px] z-30 -mx-3 border-b border-[#e1d9cf] bg-[#f7f3ed]/95 px-3 py-2 backdrop-blur">
    <div className="flex items-center gap-2">
      <Link
        href="/admin/leads"
        aria-label="Back to leads"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl font-semibold text-[#23313f] shadow-sm ring-1 ring-black/5"
      >
        ‹
      </Link>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-[#1f1e1b]">
          {eventTitle}
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          <span className="truncate text-[11px] text-[#81776f]">
            {formatDate(eventDate)}
            {eventCity ? ` · ${eventCity}` : ""}
          </span>

          <span className="rounded-full bg-[#f4ede2] px-2 py-0.5 text-[9px] font-bold uppercase text-[#745934]">
            {label(lead.status)}
          </span>
        </div>
      </div>

      {conversations[0]?.id && (
        <Link
          href={`/admin/crm/inbox/${conversations[0].id}`}
          className="flex h-10 items-center justify-center rounded-full border border-[#d8cec0] bg-white px-3 text-xs font-semibold text-[#23313f]"
        >
          Chat
        </Link>
      )}
    </div>
  </div>

  <section className="rounded-[24px] bg-[#23313f] p-4 text-white shadow-sm">
    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
      Event
    </div>

    <div className="mt-1 text-xl font-bold">
      {lead.requested_product ||
        lead.requested_category ||
        "Product not selected"}
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-2xl bg-white/10 p-3">
        <div className="text-[9px] uppercase tracking-[0.1em] text-white/50">
          Date
        </div>

        <div className="mt-1 text-sm font-semibold">
          {formatDate(eventDate)}
        </div>
      </div>

      <div className="rounded-2xl bg-white/10 p-3">
        <div className="text-[9px] uppercase tracking-[0.1em] text-white/50">
          Time
        </div>

        <div className="mt-1 text-sm font-semibold">
          {[
            booking?.event_start_time ||
              lead.event_start_time,
            booking?.event_end_time ||
              lead.event_end_time,
          ]
            .filter(Boolean)
            .join(" – ") || "—"}
        </div>
      </div>
    </div>

    {(eventCity || lead.event_address || booking?.setup_address) && (
      <div className="mt-3 text-xs leading-5 text-white/70">
        {[
          booking?.setup_address || lead.event_address,
          eventCity,
          eventState,
          booking?.setup_zip || lead.event_zip,
        ]
          .filter(Boolean)
          .join(", ")}
      </div>
    )}
  </section>

  <section className="grid grid-cols-2 gap-2">
    <div className="rounded-[20px] bg-white p-3 shadow-sm ring-1 ring-black/5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#91887f]">
        Quote
      </div>

      <div className="mt-1 text-lg font-bold text-[#1f1e1b]">
        {money(lead.quoted_total)}
      </div>

      <div className="mt-1 text-[10px] text-[#8b8177]">
        Deposit {money(lead.deposit_requested)}
      </div>
    </div>

    <div className="rounded-[20px] bg-white p-3 shadow-sm ring-1 ring-black/5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#91887f]">
        Paid
      </div>

      <div className="mt-1 text-lg font-bold text-[#477253]">
        {money(booking?.amount_paid)}
      </div>

      <div className="mt-1 text-[10px] text-[#8b8177]">
        {booking
          ? `Balance ${money(booking.balance_due)}`
          : "No booking yet"}
      </div>
    </div>

    <div className="rounded-[20px] bg-white p-3 shadow-sm ring-1 ring-black/5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#91887f]">
        Contract
      </div>

      <div className="mt-1 truncate text-sm font-bold capitalize text-[#1f1e1b]">
        {label(
          latestContract?.status ||
            booking?.contract_status,
        )}
      </div>
    </div>

    <div className="rounded-[20px] bg-white p-3 shadow-sm ring-1 ring-black/5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#91887f]">
        Attention
      </div>

      <div className="mt-1 text-lg font-bold text-[#8a5a00]">
        {needsReply + openTasks.length}
      </div>

      <div className="mt-1 text-[10px] text-[#8b8177]">
        {needsReply} replies · {openTasks.length} tasks
      </div>
    </div>
  </section>

  <details
    open
    className="overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-black/5"
  >
    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5">
      <div className="text-sm font-bold text-[#1f1e1b]">
        Customer
      </div>

      <span className="text-lg text-[#9b9187]">
        ›
      </span>
    </summary>

    <div className="border-t border-[#eee7de] px-4 py-3 text-sm text-[#6c6258]">
      <div className="font-semibold text-[#1f1e1b]">
        {customer?.full_name ||
          lead.customer_name ||
          "Unknown customer"}
      </div>

      <div className="mt-2 space-y-1">
        <div>
          {customer?.phone ||
            lead.customer_phone ||
            "No phone"}
        </div>

        <div>
          {customer?.email ||
            lead.customer_email ||
            "No email"}
        </div>

        {lead.instagram_username && (
          <div>
            Instagram: {lead.instagram_username}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(customer?.phone || lead.customer_phone) && (
          <a
            href={`tel:${String(
              customer?.phone || lead.customer_phone,
            ).replace(/[^0-9+]/g, "")}`}
            className="rounded-full border border-[#d8cec0] px-3 py-2.5 text-center text-xs font-semibold text-[#23313f]"
          >
            Call
          </a>
        )}

        {lead.instagram_username && (
          <a
            href={`https://www.instagram.com/${String(
              lead.instagram_username,
            ).replace(/^@+/, "")}/`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[#d8cec0] px-3 py-2.5 text-center text-xs font-semibold text-[#23313f]"
          >
            Instagram
          </a>
        )}
      </div>
    </div>
  </details>

  {lead.notes && (
    <details className="overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-black/5">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5">
        <div className="text-sm font-bold text-[#1f1e1b]">
          Notes
        </div>

        <span className="text-lg text-[#9b9187]">
          ›
        </span>
      </summary>

      <div className="border-t border-[#eee7de] px-4 py-3 whitespace-pre-wrap text-sm leading-6 text-[#6c6258]">
        {lead.notes}
      </div>
    </details>
  )}

  {openTasks.length > 0 && (
    <section className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-[#1f1e1b]">
          Open tasks
        </div>

        <Link
          href="/admin/tasks"
          className="text-xs font-semibold text-[#9a723e]"
        >
          View all
        </Link>
      </div>

      <div className="mt-3 divide-y divide-[#eee7de]">
        {openTasks.slice(0, 3).map((task: any) => (
          <div
            key={task.id}
            className="py-3 first:pt-0 last:pb-0"
          >
            <div className="text-sm font-semibold text-[#2d2925]">
              {task.title}
            </div>

            {task.due_at && (
              <div className="mt-1 text-[11px] text-[#8b8177]">
                {formatDateTime(task.due_at)}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )}

  {/* MOBILE SALES WORKSPACE V1 */}
  <details open className="overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-black/5">
    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5">
      <div>
        <div className="text-sm font-bold text-[#1f1e1b]">Quick actions</div>
        <div className="mt-0.5 text-[10px] text-[#91887f]">Contact customer without leaving Event Center</div>
      </div>
      <span className="text-lg text-[#9b9187]">›</span>
    </summary>
    <div className="grid grid-cols-2 gap-2 border-t border-[#eee7de] p-4">
      {(customer?.phone || lead.customer_phone) && (
        <>
          <a href={`tel:${String(customer?.phone || lead.customer_phone).replace(/[^0-9+]/g, "")}`} className="rounded-full border border-[#d8cec0] px-3 py-2.5 text-center text-xs font-semibold text-[#23313f]">Call</a>
          <a href={`sms:${String(customer?.phone || lead.customer_phone).replace(/[^0-9+]/g, "")}`} className="rounded-full border border-[#d8cec0] px-3 py-2.5 text-center text-xs font-semibold text-[#23313f]">SMS</a>
        </>
      )}
      {lead.instagram_username && (
        <a href={`https://www.instagram.com/${String(lead.instagram_username).replace(/^@+/, "")}/`} target="_blank" rel="noreferrer" className="rounded-full border border-[#d8cec0] px-3 py-2.5 text-center text-xs font-semibold text-[#23313f]">Instagram</a>
      )}
      {conversations[0]?.id && (
        <Link href={`/admin/crm/inbox/${conversations[0].id}`} className="rounded-full bg-[#23313f] px-3 py-2.5 text-center text-xs font-semibold text-white">Chat</Link>
      )}
    </div>
  </details>

  <details open className="overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-black/5">
    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5">
      <div>
        <div className="text-sm font-bold text-[#1f1e1b]">Tasks & follow-up</div>
        <div className="mt-0.5 text-[10px] text-[#91887f]">{openTasks.length} open</div>
      </div>
      <span className="text-lg text-[#9b9187]">›</span>
    </summary>
    <div className="space-y-4 border-t border-[#eee7de] p-4">
      <form action={updateLeadFollowUpAction} className="rounded-2xl bg-[#f7f3ed] p-3">
        <input type="hidden" name="leadId" value={lead.id} />
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9a723e]">Next follow-up</div>
        <input type="datetime-local" name="nextFollowUpAt" defaultValue={formatDateTimeLocal(lead.next_follow_up_at)} className="mt-2 min-h-[44px] w-full rounded-xl border border-[#ded7cd] bg-white px-3 text-sm" />
        <button type="submit" className="mt-2 min-h-[42px] w-full rounded-full bg-[#23313f] px-4 text-xs font-semibold text-white">Save follow-up</button>
      </form>

      {openTasks.length > 0 && (
        <div className="divide-y divide-[#eee7de]">
          {openTasks.slice(0, 5).map((task: any) => (
            <div key={task.id} className="py-3 first:pt-0">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#2d2925]">{task.title}</div>
                  <div className="mt-1 text-[10px] text-[#8b8177]">{label(task.task_type)}{task.due_at ? ` · ${formatDateTime(task.due_at)}` : ""}</div>
                </div>
                <form action={completeTaskAction}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="leadId" value={lead.id} />
                  <button type="submit" className="rounded-full border border-[#d8cec0] px-3 py-2 text-[11px] font-semibold text-[#477253]">Complete</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <form action={createTaskAction} className="space-y-2 rounded-2xl border border-[#eee7de] p-3">
        <input type="hidden" name="leadId" value={lead.id} />
        <input type="hidden" name="bookingId" value={booking?.id || ""} />
        <input type="hidden" name="customerId" value={customer?.id || ""} />
        <input name="title" required placeholder="New task..." className="min-h-[44px] w-full rounded-xl border border-[#ded7cd] bg-[#faf8f5] px-3 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <select name="taskType" defaultValue="follow_up" className="min-h-[42px] rounded-xl border border-[#ded7cd] bg-[#faf8f5] px-2 text-xs">
            <option value="follow_up">Follow-up</option><option value="deposit">Deposit</option><option value="contract">Contract</option><option value="coi">COI / Insurance</option><option value="route">Route</option><option value="inventory">Inventory</option><option value="review">Review request</option>
          </select>
          <input type="date" name="dueDate" className="min-h-[42px] min-w-0 rounded-xl border border-[#ded7cd] bg-[#faf8f5] px-2 text-xs" />
        </div>
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2">
          <input type="time" name="dueTime" defaultValue="09:00" className="min-h-[42px] min-w-0 rounded-xl border border-[#ded7cd] bg-[#faf8f5] px-2 text-xs" />
          <input name="description" placeholder="Notes..." className="min-h-[42px] min-w-0 rounded-xl border border-[#ded7cd] bg-[#faf8f5] px-3 text-xs" />
        </div>
        <button type="submit" className="min-h-[42px] w-full rounded-full bg-[#c9964f] px-4 text-xs font-semibold text-white">Add task</button>
      </form>
    </div>
  </details>

  <details className="overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-black/5">
    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5">
      <div>
        <div className="text-sm font-bold text-[#1f1e1b]">Edit lead</div>
        <div className="mt-0.5 text-[10px] text-[#91887f]">Customer · event · quote · notes</div>
      </div>
      <span className="text-lg text-[#9b9187]">›</span>
    </summary>
    <form action={updateLeadAction} className="space-y-3 border-t border-[#eee7de] p-4">
      <input type="hidden" name="leadId" value={lead.id} />
      <div className="grid grid-cols-2 gap-2">
        <input name="customerName" defaultValue={lead.customer_name || ""} placeholder="Customer name" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
        <input name="instagramUsername" defaultValue={lead.instagram_username || ""} placeholder="@instagram" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="customerPhone" defaultValue={lead.customer_phone || ""} placeholder="Phone" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
        <input name="customerEmail" type="email" defaultValue={lead.customer_email || ""} placeholder="Email" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input name="eventDate" type="date" defaultValue={lead.event_date || ""} className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-2 text-xs" />
        <input name="eventStartTime" type="time" defaultValue={String(lead.event_start_time || "").slice(0,5)} className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-2 text-xs" />
        <input name="eventEndTime" type="time" defaultValue={String(lead.event_end_time || "").slice(0,5)} className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-2 text-xs" />
      </div>
      <input name="eventAddress" defaultValue={lead.event_address || ""} placeholder="Event address" className="min-h-[44px] w-full rounded-xl border border-[#ded7cd] px-3 text-sm" />
      <div className="grid grid-cols-[1fr_62px_86px] gap-2">
        <input name="eventCity" defaultValue={lead.event_city || ""} placeholder="City" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
        <input name="eventState" defaultValue={lead.event_state || "CA"} placeholder="CA" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-2 text-xs" />
        <input name="eventZip" defaultValue={lead.event_zip || ""} placeholder="ZIP" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-2 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="requestedProduct" defaultValue={lead.requested_product || ""} placeholder="Requested product" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
        <input name="requestedCategory" defaultValue={lead.requested_category || ""} placeholder="Category" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select name="source" defaultValue={lead.source || "instagram"} className="min-h-[44px] rounded-xl border border-[#ded7cd] px-3 text-sm">
          <option value="instagram">Instagram</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="email">Email</option><option value="referral">Referral</option><option value="repeat_customer">Repeat customer</option><option value="other">Other</option>
        </select>
        <select name="status" defaultValue={lead.status || "new"} className="min-h-[44px] rounded-xl border border-[#ded7cd] px-3 text-sm">
          <option value="new">New</option><option value="quote_sent">Quote sent</option><option value="follow_up">Follow-up</option><option value="deposit_pending">Deposit pending</option><option value="booked">Booked</option><option value="lost">Lost</option><option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="quotedSubtotal" type="number" step="0.01" defaultValue={lead.quoted_subtotal || "0"} placeholder="Subtotal" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
        <input name="quotedDeliveryFee" type="number" step="0.01" defaultValue={lead.quoted_delivery_fee || "0"} placeholder="Delivery" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
        <input name="quotedTax" type="number" step="0.01" defaultValue={lead.quoted_tax || "0"} placeholder="Tax" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
        <input name="quotedTotal" type="number" step="0.01" defaultValue={lead.quoted_total || "0"} placeholder="Total" className="min-h-[44px] min-w-0 rounded-xl border border-[#ded7cd] px-3 text-sm" />
      </div>
      <input name="depositRequested" type="number" step="0.01" defaultValue={lead.deposit_requested || "50"} placeholder="Deposit requested" className="min-h-[44px] w-full rounded-xl border border-[#ded7cd] px-3 text-sm" />
      <input type="hidden" name="nextFollowUpAt" value={formatDateTimeLocal(lead.next_follow_up_at)} />
      <textarea name="notes" rows={4} defaultValue={lead.notes || ""} placeholder="Notes..." className="w-full resize-y rounded-xl border border-[#ded7cd] px-3 py-3 text-sm leading-5" />
      <button type="submit" className="min-h-[46px] w-full rounded-full bg-[#23313f] px-4 text-sm font-semibold text-white">Save lead</button>
    </form>
  </details>

  {booking?.id && (
    <details open className="overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-black/5">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5">
        <div>
          <div className="text-sm font-bold text-[#1f1e1b]">Payment & contract</div>
          <div className="mt-0.5 text-[10px] text-[#91887f]">Paid {money(booking.amount_paid)} · Balance {money(booking.balance_due)}</div>
        </div>
        <span className="text-lg text-[#9b9187]">›</span>
      </summary>
      <div className="space-y-3 border-t border-[#eee7de] p-4">
        <Link href={`/admin/bookings/${booking.id}`} className="flex min-h-[44px] items-center justify-center rounded-full bg-[#23313f] px-4 text-sm font-semibold text-white">Take payment / POS</Link>
        <form action={resendUpdatedContractManualAction}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <button type="submit" className="min-h-[44px] w-full rounded-full border border-[#d8cec0] bg-white px-4 text-sm font-semibold text-[#23313f]">Resend contract</button>
        </form>
      </div>
    </details>
  )}

  {booking?.id ? (
    <section className="rounded-[22px] bg-[#23313f] p-4 text-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">Operations mode</div>
          <div className="mt-1 text-base font-bold">{booking.booking_number || "Booking"}</div>
          <div className="mt-1 text-xs text-white/65">{label(booking.status)}</div>
        </div>
        <Link href={`/admin/bookings/${booking.id}`} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#23313f]">Open</Link>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white/10 p-3"><div className="text-[9px] uppercase text-white/50">Inventory</div><div className="mt-1 text-lg font-bold">{inventoryReady}/{reservations.length}</div></div>
        <div className="rounded-2xl bg-white/10 p-3"><div className="text-[9px] uppercase text-white/50">Route</div><div className="mt-1 text-lg font-bold">{routeStops.length}</div></div>
        <div className="rounded-2xl bg-white/10 p-3"><div className="text-[9px] uppercase text-white/50">Tasks</div><div className="mt-1 text-lg font-bold">{openTasks.length}</div></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/admin/routes" className="rounded-full bg-white/10 px-3 py-2.5 text-center text-xs font-semibold text-white">Route Board</Link>
        <Link href="/admin/tasks" className="rounded-full bg-white/10 px-3 py-2.5 text-center text-xs font-semibold text-white">Tasks</Link>
      </div>
    </section>
  ) : (
    <section className="rounded-[22px] border border-[#eadfce] bg-[#fffaf2] p-4">
      <div className="text-sm font-bold text-[#1f1e1b]">Ready to convert</div>
      <div className="mt-1 text-xs leading-5 text-[#766d65]">Create a booking when the customer confirms. Event Center switches into operations mode automatically.</div>
      <Link href={`/admin/bookings/new?leadId=${leadId}`} className="mt-3 flex min-h-[44px] items-center justify-center rounded-full bg-[#c9964f] px-4 text-sm font-semibold text-white">Create booking</Link>
    </section>
  )}

  <details className="overflow-hidden rounded-[22px] bg-white shadow-sm ring-1 ring-black/5">
    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5">
      <div>
        <div className="text-sm font-bold text-[#1f1e1b]">
          Activity
        </div>

        <div className="mt-0.5 text-[10px] text-[#91887f]">
          {timeline.length} events
        </div>
      </div>

      <span className="text-lg text-[#9b9187]">
        ›
      </span>
    </summary>

    <div className="border-t border-[#eee7de] px-4 py-2">
      {timeline.slice(0, 8).map((item) => (
        <div
          key={item.id}
          className="border-b border-[#eee7de] py-3 last:border-0"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a723e]">
                {item.kind}
              </div>

              <div className="mt-0.5 text-sm font-semibold text-[#1f1e1b]">
                {item.title}
              </div>

              {item.detail && (
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#6c6258]">
                  {item.detail}
                </div>
              )}
            </div>

            <div className="shrink-0 text-[10px] text-[#91887f]">
              {formatDateTime(item.at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  </details>

  <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ddd5cb] bg-[#f7f3ed]/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
    <div className="grid grid-cols-2 gap-2">
      {conversations[0]?.id && (
        <Link
          href={`/admin/crm/inbox/${conversations[0].id}`}
          className="flex min-h-[46px] items-center justify-center rounded-full border border-[#d8cec0] bg-white px-4 text-sm font-semibold text-[#23313f]"
        >
          Message
        </Link>
      )}

      {booking?.id ? (
        <Link
          href={`/admin/bookings/${booking.id}`}
          className="flex min-h-[46px] items-center justify-center rounded-full bg-[#23313f] px-4 text-sm font-semibold text-white"
        >
          Open booking
        </Link>
      ) : (
        <Link
          href={`/admin/bookings/new?leadId=${leadId}`}
          className="flex min-h-[46px] items-center justify-center rounded-full bg-[#c9964f] px-4 text-sm font-semibold text-white"
        >
          Create booking
        </Link>
      )}
    </div>
  </div>
</section>
      <section className="hidden rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)] lg:block">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin/leads" className="text-sm font-semibold text-[#9a723e]">← Events</Link>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-[#1f1e1b]">{eventTitle}</h1>
              <span className="rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold uppercase text-[#745934]">{label(lead.status)}</span>
            </div>
            <div className="mt-2 text-sm text-[#6c6258]">
              {formatDate(eventDate)}{eventCity ? ` · ${eventCity}${eventState ? `, ${eventState}` : ""}` : ""}
            </div>
            <div className="mt-1 text-sm text-[#8b8177]">{lead.requested_product || lead.requested_category || "Product not selected yet"}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            {conversations[0]?.id && (
              <Link href={`/admin/crm/inbox/${conversations[0].id}`} className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-sm font-semibold text-[#2b2a28]">Open conversation</Link>
            )}
            {booking?.id ? (
              <Link href={`/admin/bookings/${booking.id}`} className="rounded-full bg-[#23313f] px-4 py-2 text-sm font-semibold text-white">Open booking</Link>
            ) : (
              <Link href={`/admin/bookings/new?leadId=${leadId}`} className="rounded-full bg-[#c9964f] px-4 py-2 text-sm font-semibold text-white">Create booking</Link>
            )}
          </div>
        </div>
      </section>

     <section className="hidden gap-4 md:grid-cols-2 lg:grid xl:grid-cols-6">
        <StatCard labelText="Stage" value={label(lead.status)} hint={label(lead.source)} />
        <StatCard labelText="Quote" value={money(lead.quoted_total)} hint={`Deposit ${money(lead.deposit_requested)}`} />
        <StatCard labelText="Paid" value={money(booking?.amount_paid)} hint={booking ? `Balance ${money(booking.balance_due)}` : "No booking yet"} />
        <StatCard labelText="Contract" value={label(latestContract?.status || booking?.contract_status)} hint={latestContract?.signed_at ? `Signed ${formatDateTime(latestContract.signed_at)}` : undefined} />
        <StatCard labelText="Inventory" value={String(reservations.length)} hint={`${inventoryReady} active reservations`} />
        <StatCard labelText="Attention" value={String(needsReply + openTasks.length)} hint={`${needsReply} replies · ${openTasks.length} tasks`} />
      </section>

    <section className="hidden gap-5 lg:grid xl:grid-cols-[minmax(0,1fr)_350px]">
        <section className="rounded-[30px] border border-black/5 bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Event history</div>
              <h2 className="mt-1 text-xl font-semibold text-[#1f1e1b]">Timeline</h2>
            </div>
            <div className="text-xs text-[#8b8177]">{timeline.length} events</div>
          </div>

          <div className="mt-5 space-y-3">
            {timeline.map((item) => {
              const body = (
                <div className="rounded-[22px] border border-[#eee5d9] bg-[#fffdf9] p-4 transition hover:bg-[#fcfaf7]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9a723e]">{item.kind}</div>
                      <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">{item.title}</div>
                      {item.detail && <div className="mt-1 text-sm leading-6 text-[#6c6258]">{item.detail}</div>}
                    </div>
                    <div className="text-xs text-[#8b8177]">{formatDateTime(item.at)}</div>
                  </div>
                </div>
              );
              return item.href ? <Link key={item.id} href={item.href}>{body}</Link> : <div key={item.id}>{body}</div>;
            })}
            {timeline.length === 0 && <div className="py-12 text-center text-sm text-[#8b8177]">No history yet.</div>}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[26px] border border-black/5 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Customer</div>
            <div className="mt-3 font-semibold text-[#1f1e1b]">{customer?.full_name || lead.customer_name || "Unknown customer"}</div>
            <div className="mt-2 space-y-1 text-sm text-[#6c6258]">
              <div>{customer?.phone || lead.customer_phone || "No phone"}</div>
              <div>{customer?.email || lead.customer_email || "No email"}</div>
              {lead.instagram_username && <div>Instagram: {lead.instagram_username}</div>}
            </div>
          </section>

          <section className="rounded-[26px] border border-black/5 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Event</div>
            <div className="mt-3 space-y-2 text-sm text-[#6c6258]">
              <div><span className="font-semibold text-[#1f1e1b]">Date:</span> {formatDate(eventDate)}</div>
              <div><span className="font-semibold text-[#1f1e1b]">Time:</span> {[booking?.event_start_time || lead.event_start_time, booking?.event_end_time || lead.event_end_time].filter(Boolean).join(" – ") || "—"}</div>
              <div><span className="font-semibold text-[#1f1e1b]">Location:</span> {[booking?.setup_address || lead.event_address, eventCity, eventState, booking?.setup_zip || lead.event_zip].filter(Boolean).join(", ") || "—"}</div>
              <div><span className="font-semibold text-[#1f1e1b]">Source:</span> {label(lead.source)}</div>
            </div>
          </section>

          {booking && (
            <section className="rounded-[26px] border border-black/5 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Operations</div>
              <div className="mt-3 space-y-3 text-sm">
                <Link href={`/admin/bookings/${booking.id}`} className="block rounded-2xl bg-[#f5f1eb] px-4 py-3 font-semibold text-[#1f1e1b]">Booking {booking.booking_number}</Link>
                <Link href="/admin/routes" className="block rounded-2xl bg-[#f5f1eb] px-4 py-3 font-semibold text-[#1f1e1b]">Route Board · {routeStops.length} stops</Link>
                <Link href="/admin/tasks" className="block rounded-2xl bg-[#f5f1eb] px-4 py-3 font-semibold text-[#1f1e1b]">Tasks · {openTasks.length} open</Link>
              </div>
            </section>
          )}

          {lead.notes && (
            <section className="rounded-[26px] border border-[#eadfce] bg-[#fffaf2] p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Lead notes</div>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#6c6258]">{lead.notes}</div>
            </section>
          )}
        </aside>
      </section>
    </div>
  );
}

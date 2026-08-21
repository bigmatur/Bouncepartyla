import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";

function Card({ label, value, hint, href }: { label: string; value: number | string; hint: string; href: string }) {
  return (
    <Link href={href} className="rounded-[26px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(0,0,0,0.06)]">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">{value}</div>
      <div className="mt-1 text-sm text-[#6c6258]">{hint}</div>
    </Link>
  );
}

export default async function CrmOverviewPage() {
  const { supabase } = await requireAdminPermission("customers.view");

  const [leadsResult, tasksResult, conversationsResult] = await Promise.all([
    supabase.from("booking_leads").select("id,status", { count: "exact" }).limit(500),
    supabase.from("tasks").select("id,status,due_at").neq("status", "completed").limit(500),
    supabase.from("crm_conversations").select("id,needs_reply,status").neq("status", "archived").limit(500),
  ]);

  const leads = leadsResult.data || [];
  const tasks = tasksResult.data || [];
  const conversations = conversationsResult.data || [];
  const activeEvents = leads.filter((lead: any) => !["booked", "lost", "cancelled"].includes(String(lead.status || ""))).length;
  const needsReply = conversations.filter((item: any) => item.needs_reply).length;
  const openTasks = tasks.length;
  const booked = leads.filter((lead: any) => String(lead.status || "") === "booked").length;

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">Sales workspace</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">CRM</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
          One workspace for conversations, event opportunities, follow-ups and customers. Existing Leads and Tasks stay as the source of truth — CRM only brings them together.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card label="Needs reply" value={needsReply} hint="Conversations waiting for staff" href="/admin/crm/inbox?view=needs_reply" />
        <Card label="Open events" value={activeEvents} hint="New, quoted and deposit pending" href="/admin/leads" />
        <Card label="Open tasks" value={openTasks} hint="Follow-ups and reminders" href="/admin/tasks" />
        <Card label="Booked" value={booked} hint="Converted opportunities" href="/admin/leads?status=booked" />
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Link href="/admin/crm/inbox" className="rounded-[28px] border border-[#d8cec0] bg-[#fffdf9] p-6">
          <div className="text-xl font-semibold text-[#1f1e1b]">Inbox</div>
          <p className="mt-2 text-sm leading-6 text-[#6c6258]">Unified conversation shell. Email, SMS and Instagram adapters will plug into this same timeline.</p>
        </Link>
        <Link href="/admin/leads" className="rounded-[28px] border border-[#d8cec0] bg-[#fffdf9] p-6">
          <div className="text-xl font-semibold text-[#1f1e1b]">Events</div>
          <p className="mt-2 text-sm leading-6 text-[#6c6258]">Uses the existing booking_leads pipeline. Open any lead to enter its unified Event Center.</p>
        </Link>
        <Link href="/admin/tasks" className="rounded-[28px] border border-[#d8cec0] bg-[#fffdf9] p-6">
          <div className="text-xl font-semibold text-[#1f1e1b]">Tasks</div>
          <p className="mt-2 text-sm leading-6 text-[#6c6258]">Existing reminders remain intact and become the CRM follow-up center.</p>
        </Link>
      </section>
    </div>
  );
}

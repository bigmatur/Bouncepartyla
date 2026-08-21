import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  processNotificationQueueAction,
  runNotificationSchedulerAction,
  updateNotificationChannelAction,
  updateNotificationRuleAction,
  updateNotificationScheduleAction,
  updateNotificationTemplateAction,
} from "./actions";

export const dynamic = "force-dynamic";

function providerStatus(channel: string) {
  if (channel === "email") {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD)
      ? { ok: true, label: "SMTP configured" }
      : { ok: false, label: "SMTP credentials missing" };
  }
  if (channel === "sms") {
    return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER)
      ? { ok: true, label: "Twilio configured" }
      : { ok: false, label: "Twilio credentials missing" };
  }
  return { ok: true, label: "Internal delivery" };
}

export default async function NotificationsAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; processed?: string; sent?: string; failed?: string; enqueued?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase } = await requireAdminPermission("settings.view");

  const [categoriesResult, eventsResult, rulesResult, channelsResult, deliveriesResult, templatesResult, smsSuppressionsResult, schedulesResult] = await Promise.all([
    supabase.from("notification_categories").select("code,label,description,sort_order").eq("active", true).order("sort_order"),
    supabase.from("notification_events").select("code,label,description,category_code,sort_order").eq("active", true).order("sort_order"),
    supabase.from("notification_rules").select("id,event_code,recipient_role,channel,enabled,delay_minutes").order("recipient_role").order("channel"),
    supabase.from("notification_channel_settings").select("channel,enabled,provider,sender_label,sender_value").order("channel"),
    supabase.from("notification_deliveries").select("id,event_code,channel,status,recipient_email,recipient_phone,error_message,created_at,sent_at").order("created_at", { ascending: false }).limit(25),
    supabase.from("notification_templates").select("id,event_code,channel,name,subject,body_text,body_html,active,updated_at").order("event_code").order("channel"),
    supabase.from("notification_sms_suppressions").select("phone_key,customer_id,phone_raw,keyword,suppressed_at").order("suppressed_at", { ascending: false }).limit(25),
    supabase.from("notification_schedules").select("id,event_code,name,enabled,anchor_type,offset_minutes,catchup_minutes,requires_balance_due,updated_at").order("event_code"),
  ]);

  for (const result of [categoriesResult, eventsResult, rulesResult, channelsResult, deliveriesResult, templatesResult, smsSuppressionsResult, schedulesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const categories = categoriesResult.data || [];
  const events = eventsResult.data || [];
  const rules = rulesResult.data || [];
  const channels = channelsResult.data || [];
  const deliveries = deliveriesResult.data || [];
  const templates = templatesResult.data || [];
  const smsSuppressions = smsSuppressionsResult.data || [];
  const schedules = schedulesResult.data || [];
  const categoryMap = new Map(categories.map((item) => [item.code, item]));

  return (
    <main className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a7a49]">Notifications & Messaging</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1f1e1b] sm:text-4xl">Notification center</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">One place for customer/staff rules, Email, SMS, in-app delivery, preferences and audit history.</p>
        </div>
        <form action={processNotificationQueueAction}>
          <button className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold shadow-sm">Process queued notifications</button>
        </form>
      </div>

      {params.saved ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{params.saved === "processed" ? `Queue processed: ${params.processed || 0}; sent ${params.sent || 0}; failed ${params.failed || 0}.` : params.saved === "scheduler" ? `Scheduler ran: enqueued ${params.enqueued || 0}; processed ${params.processed || 0}; sent/delivered ${params.sent || 0}; failed ${params.failed || 0}.` : "Notification settings saved."}</div> : null}

      <section className="mt-7 grid gap-4 lg:grid-cols-3">
        {channels.map((item) => {
          const status = providerStatus(item.channel);
          const title = item.channel === "email" ? "Email" : item.channel === "sms" ? "SMS" : "In-app";
          return (
            <form key={item.channel} action={updateNotificationChannelAction} className="rounded-[28px] border border-black/8 bg-white p-6 shadow-[0_16px_50px_rgba(0,0,0,.04)]">
              <input type="hidden" name="channel" value={item.channel} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{title}</div>
                  <div className="mt-1 text-xs text-black/45">Provider: {item.provider || "—"}</div>
                </div>
                <span className={["rounded-full px-3 py-1 text-xs font-semibold", status.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"].join(" ")}>{status.label}</span>
              </div>
              <label className="mt-5 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" name="enabled" defaultChecked={item.enabled} /> Enable channel</label>
              <label className="mt-4 block text-xs font-semibold uppercase tracking-[.12em] text-black/45">Sender name<input name="senderLabel" defaultValue={item.sender_label || ""} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <label className="mt-3 block text-xs font-semibold uppercase tracking-[.12em] text-black/45">From email / phone<input name="senderValue" defaultValue={item.sender_value || ""} placeholder={item.channel === "email" ? "hello@bouncepartyla.com" : item.channel === "sms" ? "+1…" : ""} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <button className="mt-5 rounded-full bg-[#1d1d1b] px-4 py-2 text-xs font-semibold text-white">Save channel</button>
            </form>
          );
        })}
      </section>

      <section className="mt-7 rounded-[30px] border border-black/8 bg-white p-6 shadow-[0_16px_50px_rgba(0,0,0,.04)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">Scheduled reminders</div>
            <p className="mt-1 max-w-3xl text-sm text-black/50">Configure when reminders are queued. All schedules are disabled by default. Running the scheduler only enqueues due events into the same notification queue; it never changes bookings.</p>
          </div>
          <form action={runNotificationSchedulerAction}>
            <button className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold shadow-sm">Run scheduler now</button>
          </form>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {schedules.map((schedule: any) => {
            const event = events.find((item) => item.code === schedule.event_code);
            const minutes = Number(schedule.offset_minutes || 0);
            const unit = minutes > 0 && minutes % 1440 === 0 ? "days" : minutes > 0 && minutes % 60 === 0 ? "hours" : "minutes";
            const divisor = unit === "days" ? 1440 : unit === "hours" ? 60 : 1;
            const anchorLabel = schedule.anchor_type === "event_start" ? "event start" : schedule.anchor_type === "delivery_start" ? "delivery start" : "pickup start";
            return (
              <form key={schedule.id} action={updateNotificationScheduleAction} className="rounded-2xl bg-[#f8f5f0] p-4">
                <input type="hidden" name="scheduleId" value={schedule.id} />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{event?.label || schedule.name}</div>
                    <div className="mt-1 text-xs text-black/45">Before {anchorLabel}{schedule.requires_balance_due ? " · only when balance is due" : ""}</div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" name="enabled" defaultChecked={schedule.enabled} /> Enabled</label>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_130px] gap-2">
                  <label className="text-xs font-semibold uppercase tracking-[.1em] text-black/45">Send before<input name="offsetValue" type="number" min="0" defaultValue={Math.round(minutes / divisor)} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm normal-case tracking-normal" /></label>
                  <label className="text-xs font-semibold uppercase tracking-[.1em] text-black/45">Unit<select name="offsetUnit" defaultValue={unit} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm normal-case tracking-normal"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label>
                </div>
                <label className="mt-3 block text-xs font-semibold uppercase tracking-[.1em] text-black/45">Catch-up window (minutes)<input name="catchupMinutes" type="number" min="5" defaultValue={schedule.catchup_minutes || 180} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <div className="mt-4 flex justify-end"><button className="rounded-full bg-[#1d1d1b] px-4 py-2 text-xs font-semibold text-white">Save schedule</button></div>
              </form>
            );
          })}
          {!schedules.length ? <div className="text-sm text-black/40">No schedules found. Apply migration 071.</div> : null}
        </div>
        <div className="mt-4 rounded-2xl bg-[#fff8e8] p-4 text-xs leading-6 text-[#70562d]">For automatic production delivery call <code>/api/notifications/scheduler</code> from a cron service using <code>NOTIFICATION_SCHEDULER_SECRET</code>. During local development you can use “Run scheduler now”.</div>
      </section>

      <section className="mt-7 rounded-[30px] border border-black/8 bg-white p-6 shadow-[0_16px_50px_rgba(0,0,0,.04)]">
        <div className="mb-5">
          <div className="text-xl font-semibold">Rules by event & role</div>
          <p className="mt-1 text-sm text-black/50">This is the control plane. Booking confirmed, payments/deposits, contract ready and contract signed now use this engine. Other legacy events will be migrated incrementally.</p>
        </div>
        <div className="space-y-7">
          {categories.map((category) => {
            const categoryEvents = events.filter((event) => event.category_code === category.code);
            if (!categoryEvents.length) return null;
            return (
              <div key={category.code}>
                <div className="mb-3 border-b border-black/6 pb-2"><div className="font-semibold">{category.label}</div><div className="text-xs text-black/45">{category.description}</div></div>
                <div className="space-y-3">
                  {categoryEvents.map((event) => {
                    const eventRules = rules.filter((rule) => rule.event_code === event.code);
                    return (
                      <div key={event.code} className="rounded-2xl bg-[#f8f5f0] p-4">
                        <div className="font-semibold">{event.label}</div>
                        <div className="mt-1 text-xs text-black/45">{event.description}</div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {eventRules.map((rule) => (
                            <form key={rule.id} action={updateNotificationRuleAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-black/8 bg-white px-3 py-2 text-xs">
                              <input type="hidden" name="ruleId" value={rule.id} />
                              <span className="min-w-20 font-semibold capitalize">{rule.recipient_role}</span>
                              <span className="rounded-full bg-black/[.05] px-2 py-1 font-semibold uppercase">{rule.channel}</span>
                              <label className="ml-auto flex items-center gap-1"><input type="checkbox" name="enabled" defaultChecked={rule.enabled} /> On</label>
                              <input name="delayMinutes" type="number" min="0" defaultValue={rule.delay_minutes || 0} className="w-16 rounded-lg border border-black/10 px-2 py-1" title="Delay minutes" />
                              <button className="rounded-lg border border-black/10 px-2 py-1 font-semibold">Save</button>
                            </form>
                          ))}
                          {!eventRules.length ? <div className="text-xs text-black/40">No rules yet.</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-7 rounded-[30px] border border-black/8 bg-white p-6 shadow-[0_16px_50px_rgba(0,0,0,.04)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Templates</div>
            <p className="mt-1 text-sm text-black/50">Edit the existing Email, SMS and in-app templates. Only the variables listed below are accepted.</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-[#f8f5f0] p-4 text-xs leading-6 text-black/55">
          Available variables: <code>{"{{customer_first_name}}"}</code>, <code>{"{{booking_number}}"}</code>, <code>{"{{event_date}}"}</code>, <code>{"{{total}}"}</code>, <code>{"{{deposit_amount}}"}</code>, <code>{"{{amount_paid}}"}</code>, <code>{"{{balance_due}}"}</code>, <code>{"{{payment_amount}}"}</code>, <code>{"{{tip_amount}}"}</code>, <code>{"{{booking_url}}"}</code>, <code>{"{{action_url}}"}</code>, <code>{"{{expires_at}}"}</code>, <code>{"{{preferences_url}}"}</code>.
        </div>
        <div className="mt-5 space-y-3">
          {templates.map((template: any) => {
            const event = events.find((item) => item.code === template.event_code);
            return (
              <details key={template.id} className="rounded-2xl border border-black/8 bg-[#fbf9f6]">
                <summary className="cursor-pointer list-none px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold">{event?.label || template.event_code}</span>
                    <span className="rounded-full bg-black/[.05] px-2 py-1 text-[11px] font-semibold uppercase">{template.channel}</span>
                    <span className={template.active ? "ml-auto text-xs font-semibold text-emerald-700" : "ml-auto text-xs font-semibold text-black/35"}>{template.active ? "Active" : "Disabled"}</span>
                  </div>
                </summary>
                <form action={updateNotificationTemplateAction} className="border-t border-black/6 p-5">
                  <input type="hidden" name="templateId" value={template.id} />
                  <input type="hidden" name="channel" value={template.channel} />
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="text-xs font-semibold uppercase tracking-[.1em] text-black/45">Name<input name="name" defaultValue={template.name || ""} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm normal-case tracking-normal" /></label>
                    {template.channel !== "sms" ? <label className="text-xs font-semibold uppercase tracking-[.1em] text-black/45">Subject<input name="subject" defaultValue={template.subject || ""} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm normal-case tracking-normal" /></label> : null}
                  </div>
                  <label className="mt-4 block text-xs font-semibold uppercase tracking-[.1em] text-black/45">{template.channel === "sms" ? "SMS text" : "Plain text"}<textarea name="bodyText" defaultValue={template.body_text || ""} rows={template.channel === "sms" ? 4 : 8} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-mono text-xs normal-case tracking-normal" /></label>
                  {template.channel === "email" ? <label className="mt-4 block text-xs font-semibold uppercase tracking-[.1em] text-black/45">Optional email HTML<textarea name="bodyHtml" defaultValue={template.body_html || ""} rows={10} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-mono text-xs normal-case tracking-normal" /></label> : <input type="hidden" name="bodyHtml" value={template.body_html || ""} />}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="active" defaultChecked={template.active} /> Active</label>
                    <button className="ml-auto rounded-full bg-[#1d1d1b] px-4 py-2 text-xs font-semibold text-white">Save template</button>
                  </div>
                </form>
              </details>
            );
          })}
        </div>
      </section>

      <section className="mt-7 rounded-[30px] border border-black/8 bg-white p-6 shadow-[0_16px_50px_rgba(0,0,0,.04)]">
        <div className="text-xl font-semibold">SMS opt-outs</div>
        <p className="mt-1 text-sm text-black/50">Numbers that replied STOP are globally suppressed before Twilio delivery. Reply START removes the suppression; category preferences remain separate.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[.1em] text-black/40"><tr><th className="pb-3">Phone</th><th>Keyword</th><th>Customer</th><th>Stopped</th></tr></thead>
            <tbody>
              {smsSuppressions.map((item: any) => <tr key={item.phone_key} className="border-t border-black/6"><td className="py-3 font-semibold">{item.phone_raw || item.phone_key}</td><td>{item.keyword || "STOP"}</td><td>{item.customer_id || "—"}</td><td>{new Date(item.suppressed_at).toLocaleString("en-US")}</td></tr>)}
              {!smsSuppressions.length ? <tr><td colSpan={4} className="py-7 text-center text-black/40">No SMS opt-outs.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-2xl bg-[#f8f5f0] p-4 text-xs leading-6 text-black/55">Twilio inbound webhook: <code>/api/twilio/inbound</code>. For production set <code>TWILIO_INBOUND_WEBHOOK_URL</code> to the exact public webhook URL used in Twilio.</div>
      </section>

      <section className="mt-7 rounded-[30px] border border-black/8 bg-white p-6 shadow-[0_16px_50px_rgba(0,0,0,.04)]">
        <div className="text-xl font-semibold">Delivery log</div>
        <p className="mt-1 text-sm text-black/50">Last 25 notification deliveries. This will become the troubleshooting history for “I did not receive it”.</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[.1em] text-black/40"><tr><th className="pb-3">Event</th><th>Channel</th><th>Status</th><th>Recipient</th><th>Created</th><th>Error</th></tr></thead>
            <tbody>
              {deliveries.map((item) => <tr key={item.id} className="border-t border-black/6"><td className="py-3 font-semibold">{item.event_code}</td><td className="uppercase">{item.channel}</td><td>{item.status}</td><td>{item.recipient_email || item.recipient_phone || "—"}</td><td>{new Date(item.created_at).toLocaleString("en-US")}</td><td className="max-w-[280px] truncate text-red-600">{item.error_message || ""}</td></tr>)}
              {!deliveries.length ? <tr><td colSpan={6} className="py-8 text-center text-black/40">No notification deliveries yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

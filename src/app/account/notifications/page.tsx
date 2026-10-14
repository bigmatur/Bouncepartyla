import CustomerShell from "@/components/account/CustomerShell";
import { requireCustomerAccess } from "@/lib/auth/require-customer";
import {
  markAllCustomerNotificationsReadAction,
  openCustomerNotificationAction,
} from "./actions";

export const dynamic = "force-dynamic";

type DeliveryRow = {
  id: string;
  event_code: string;
  subject: string | null;
  rendered_body: string | null;
  booking_id: string | null;
  status: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
};

type NotificationEventRow = {
  code: string;
  label: string | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function prettyEventCode(value: string | null | undefined) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function AccountNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ read?: string; error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  const customerResult = await supabase
    .from("customers")
    .select("id,email,phone")
    .eq("auth_user_id", access.user?.id || "")
    .limit(1)
    .maybeSingle();
  if (customerResult.error) throw new Error(customerResult.error.message);

  const [inAppResult, eventsResult] = await Promise.all([
    customerResult.data?.id
      ? supabase.from("notification_deliveries").select("id,event_code,subject,rendered_body,booking_id,status,created_at,delivered_at,read_at").eq("customer_id", customerResult.data.id).eq("channel", "in_app").in("status", ["sent","delivered"]).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("notification_events").select("code,label").eq("active", true),
  ]);

  if (inAppResult.error) throw new Error(inAppResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);

  const deliveries = (inAppResult.data || []) as DeliveryRow[];
  const unreadCount = deliveries.filter((item) => !item.read_at).length;
  const eventLabelByCode = new Map(
    ((eventsResult.data || []) as NotificationEventRow[]).map((item) => [String(item.code), String(item.label || "")]),
  );
  const canMutateInbox = access.role === "customer" && !canPreviewCustomer;

  return (
    <CustomerShell
      displayName={access.displayName}
      userEmail={access.user?.email || null}
      role={access.role}
      defaultInterface={access.defaultInterface}
      availableInterfaces={access.availableInterfaces}
      grantedPermissions={access.grantedPermissions}
      previewMode={canPreviewCustomer}
    >
      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-5 sm:py-10">
        <section className="rounded-[22px] border border-black/10 bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,.05)] sm:rounded-[30px] sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-black/40">Notifications</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] sm:mt-3 sm:text-4xl">Inbox</h1>
          <p className="mt-2 text-sm leading-5 text-black/55 sm:mt-3 sm:max-w-3xl sm:leading-6 sm:text-black/60">Personal in-app alerts for your account. Open any item to view details and mark it as read.</p>

          {params.read === "all" ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">All notifications marked as read.</div> : null}
          {params.error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{params.error}</div> : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-black/8 bg-[#fbf9f6] px-4 py-3 sm:mt-6 sm:rounded-2xl sm:px-5">
            <div>
              <div className="text-sm font-semibold text-black/80">Unread</div>
              <div className="text-2xl font-semibold tracking-tight">{unreadCount}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/account/notifications/settings"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold text-[#3a342d] transition hover:bg-[#f5efe6]"
              >
                Notification settings
              </a>
              <form action={markAllCustomerNotificationsReadAction}>
                <button
                  type="submit"
                  disabled={!canMutateInbox || unreadCount === 0}
                  className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#1d1d1b] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Mark all as read
                </button>
              </form>
            </div>
          </div>

          {canPreviewCustomer ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Preview mode is read-only. Notifications cannot be marked as read.
            </div>
          ) : null}

          <div className="mt-6 space-y-3 sm:mt-8">
            {deliveries.map((item) => {
              const isUnread = !item.read_at;
              const eventLabel =
                eventLabelByCode.get(String(item.event_code || "")) ||
                prettyEventCode(item.event_code);
              const title = String(item.subject || "").trim() || eventLabel;
              const sentAt = formatDateTime(item.delivered_at || item.created_at);

              return (
                <form key={item.id} action={openCustomerNotificationAction}>
                  <input type="hidden" name="deliveryId" value={item.id} />
                  <button
                    type="submit"
                    disabled={!canMutateInbox}
                    className={[
                      "block w-full rounded-[18px] border p-3 text-left transition sm:rounded-2xl sm:p-4",
                      isUnread
                        ? "border-[#d8c39b] bg-[#fff8eb] hover:bg-[#fff3dc]"
                        : "border-black/8 bg-[#fbf9f6] hover:bg-[#f7f3ed]",
                      !canMutateInbox ? "cursor-not-allowed opacity-70" : "",
                    ].join(" ")}
                    aria-label={`Open notification: ${title}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={isUnread ? "h-2 w-2 shrink-0 rounded-full bg-[#c9964f]" : "h-2 w-2 shrink-0 rounded-full bg-black/15"} />
                          <div className={isUnread ? "truncate font-semibold text-[#1f1e1b]" : "truncate font-medium text-black/75"}>{title}</div>
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.08em] text-black/40">{eventLabel}</div>
                      </div>
                      <div className="text-xs text-black/40">{sentAt}</div>
                    </div>
                    {item.rendered_body ? (
                      <div className={isUnread ? "mt-2 text-sm leading-6 text-black/75" : "mt-2 text-sm leading-6 text-black/55"}>{item.rendered_body}</div>
                    ) : null}
                  </button>
                </form>
              );
            })}

            {deliveries.length === 0 ? (
              <div className="rounded-2xl bg-[#f7f4ef] p-5 text-sm text-black/45">No notifications yet.</div>
            ) : null}
          </div>
        </section>
      </main>
    </CustomerShell>
  );
}

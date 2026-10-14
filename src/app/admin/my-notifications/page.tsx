import { requireAdminUser } from "@/lib/auth/require-admin";
import {
  markAllOwnAdminNotificationsReadAction,
  openOwnAdminNotificationAction,
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

export default async function AdminMyNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ read?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, access } = await requireAdminUser();
  const authUserId = String(access.user?.id || "").trim();

  const [deliveriesResult, eventsResult] = await Promise.all([
    supabase
      .from("notification_deliveries")
      .select("id,event_code,subject,rendered_body,booking_id,status,created_at,delivered_at,read_at")
      .eq("auth_user_id", authUserId)
      .eq("channel", "in_app")
      .in("status", ["sent", "delivered"])
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("notification_events")
      .select("code,label")
      .eq("active", true),
  ]);

  if (deliveriesResult.error) {
    throw new Error(deliveriesResult.error.message);
  }

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  const deliveries = (deliveriesResult.data || []) as DeliveryRow[];
  const unreadCount = deliveries.filter((item) => !item.read_at).length;
  const eventLabelByCode = new Map(
    ((eventsResult.data || []) as NotificationEventRow[]).map((item) => [String(item.code), String(item.label || "")]),
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-5 sm:py-10">
      <section className="rounded-[22px] border border-black/10 bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,.05)] sm:rounded-[30px] sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-black/40">Notifications</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] sm:mt-3 sm:text-4xl">
          My notifications
        </h1>
        <p className="mt-2 text-sm leading-5 text-black/55 sm:mt-3 sm:max-w-3xl sm:leading-6 sm:text-black/60">
          Personal in-app alerts assigned to your staff account.
        </p>

        {params.read === "all" ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">All notifications marked as read.</div> : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-black/8 bg-[#fbf9f6] px-4 py-3 sm:rounded-2xl sm:px-5">
          <div>
            <div className="text-sm font-semibold text-black/80">Unread</div>
            <div className="text-2xl font-semibold tracking-tight">{unreadCount}</div>
          </div>
          <form action={markAllOwnAdminNotificationsReadAction}>
            <button
              type="submit"
              disabled={unreadCount === 0}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#1d1d1b] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              Mark all as read
            </button>
          </form>
        </div>

        <div className="mt-6 space-y-3 sm:mt-8">
          {deliveries.map((item) => {
            const eventLabel =
              eventLabelByCode.get(String(item.event_code || "")) ||
              prettyEventCode(item.event_code);
            const title = String(item.subject || "").trim() || eventLabel;
            const sentAt = formatDateTime(item.delivered_at || item.created_at);
            const isUnread = !item.read_at;

            return (
              <form key={item.id} action={openOwnAdminNotificationAction}>
                <input type="hidden" name="deliveryId" value={item.id} />
                <button
                  type="submit"
                  className={[
                    "block w-full rounded-[16px] border p-3 text-left transition sm:rounded-2xl sm:p-4",
                    isUnread
                      ? "border-[#d8c39b] bg-[#fff8eb] hover:bg-[#fff3dc]"
                      : "border-black/8 bg-[#fbf9f6] hover:bg-[#f7f3ed]",
                  ].join(" ")}
                  aria-label={`Open notification: ${title}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={isUnread ? "h-2 w-2 shrink-0 rounded-full bg-[#c9964f]" : "h-2 w-2 shrink-0 rounded-full bg-black/15"} />
                        <div className={isUnread ? "truncate font-semibold" : "truncate font-medium text-black/75"}>{title}</div>
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.08em] text-black/40">{eventLabel}</div>
                    </div>
                    <div className="text-xs text-black/40">{sentAt}</div>
                  </div>
                  {item.rendered_body ? (
                    <div className={isUnread ? "mt-1 text-sm text-black/75" : "mt-1 text-sm text-black/55"}>{item.rendered_body}</div>
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
  );
}

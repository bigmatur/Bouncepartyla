import Link from "next/link";

import { requireAdminUser } from "@/lib/auth/require-admin";

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

export default async function AdminMyNotificationsPage() {
  const { supabase, access } = await requireAdminUser();
  const authUserId = String(access.user?.id || "").trim();

  const [deliveriesResult, eventsResult] = await Promise.all([
    supabase
      .from("notification_deliveries")
      .select("id,event_code,subject,rendered_body,booking_id,status,created_at,delivered_at")
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
  const eventLabelByCode = new Map(
    (eventsResult.data || []).map((item: any) => [String(item.code), String(item.label || "")]),
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

        <div className="mt-6 space-y-3 sm:mt-8">
          {deliveries.map((item) => {
            const eventLabel =
              eventLabelByCode.get(String(item.event_code || "")) ||
              prettyEventCode(item.event_code);
            const title = String(item.subject || "").trim() || eventLabel;
            const destination = item.booking_id
              ? `/admin/bookings/${item.booking_id}`
              : "/admin";
            const sentAt = formatDateTime(item.delivered_at || item.created_at);

            return (
              <Link
                key={item.id}
                href={destination}
                className="block rounded-[16px] border border-black/8 bg-[#fbf9f6] p-3 transition hover:bg-[#f7f3ed] sm:rounded-2xl sm:p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{title}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.08em] text-black/40">{eventLabel}</div>
                  </div>
                  <div className="text-xs text-black/40">{sentAt}</div>
                </div>
                {item.rendered_body ? (
                  <div className="mt-1 text-sm text-black/55">{item.rendered_body}</div>
                ) : null}
              </Link>
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

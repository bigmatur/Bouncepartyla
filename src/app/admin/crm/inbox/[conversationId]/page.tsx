import Link from "next/link";
import { notFound } from "next/navigation";

import ActionButton from "@/components/ui/ActionButton";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  createCrmAttachmentSignedUrls,
  parseCrmAttachments,
} from "@/lib/communication/attachments";

import {
  replyToCrmConversationAction,
  setCrmConversationClosedAction,
} from "../actions";
import CrmReplyForm from "./CrmReplyForm";

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function channelLabel(channel: string) {
  const normalized = String(channel || "").trim().toLowerCase();
  if (normalized === "sms") return "SMS";
  if (normalized === "email") return "Email";
  if (normalized === "instagram") return "Instagram";
  if (normalized === "whatsapp") return "WhatsApp";
  return normalized || "CRM";
}

export default async function CrmConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { supabase } = await requireAdminPermission("customers.view");

  const conversation = await supabase
    .from("crm_conversations")
    .select(`
      id, subject, status, priority, needs_reply, customer_id, lead_id, booking_id, last_channel,
      customers (id, full_name, phone, email),
      bookings (id, booking_number, event_date)
    `)
    .eq("id", conversationId)
    .maybeSingle();

  if (conversation.error) throw new Error(conversation.error.message);
  if (!conversation.data) notFound();

  const messages = await supabase
    .from("crm_messages")
    .select("id, direction, channel, sender_identity, recipient_identity, body_text, status, sent_at, delivered_at, failed_at, created_at, metadata")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (messages.error) throw new Error(messages.error.message);

  let lead: any = null;
  if (conversation.data.lead_id) {
    const result = await supabase
      .from("booking_leads")
      .select("id, customer_name, customer_email, customer_phone, instagram_username, event_date, event_city, status, requested_product")
      .eq("id", conversation.data.lead_id)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    lead = result.data;
  }

  const customer: any = Array.isArray(conversation.data.customers)
    ? conversation.data.customers[0]
    : conversation.data.customers;
  const booking: any = Array.isArray(conversation.data.bookings)
    ? conversation.data.bookings[0]
    : conversation.data.bookings;

  const personName =
    customer?.full_name ||
    lead?.customer_name ||
    conversation.data.subject ||
    "Conversation";

  const rawMessages: any[] = messages.data || [];

  const allMessages = await Promise.all(
    rawMessages.map(async (message) => {
      const metadata =
        message.metadata && typeof message.metadata === "object"
          ? (message.metadata as Record<string, unknown>)
          : {};
      const attachments = parseCrmAttachments((metadata as any).attachments);

      let resolvedAttachments: any[] = [];
      if (attachments.length > 0) {
        try {
          resolvedAttachments = await createCrmAttachmentSignedUrls({
            conversationId,
            attachments,
            expiresInSeconds: 60 * 60,
          });
        } catch {
          resolvedAttachments = attachments.map((item) => ({ ...item, url: "" }));
        }
      }

      return { ...message, resolvedAttachments };
    }),
  );

  const latestInbound = [...allMessages]
    .reverse()
    .find(
      (item) =>
        item.direction === "inbound" &&
        ["sms", "email", "instagram", "whatsapp"].includes(
          String(item.channel || "").trim().toLowerCase(),
        ),
    );

  const replyChannel = String(
    latestInbound?.channel || conversation.data.last_channel || "",
  )
    .trim()
    .toLowerCase();

  const canReply = ["sms", "email", "instagram", "whatsapp"].includes(replyChannel);
  const isClosed = conversation.data.status === "closed";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/crm/inbox"
            className="text-sm font-semibold text-[#9a723e] transition hover:opacity-70 active:scale-[0.98]"
          >
            ← Inbox
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-[#1f1e1b]">{personName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#6c6258]">
            <span>{conversation.data.subject || "CRM conversation"}</span>
            {replyChannel && (
              <span className="rounded-full bg-[#f5f1eb] px-2.5 py-1 text-xs font-semibold">
                Reply via {channelLabel(replyChannel)}
              </span>
            )}
            {conversation.data.needs_reply && (
              <span className="rounded-full bg-[#fff1d8] px-2.5 py-1 text-xs font-semibold text-[#9b6100]">
                Needs reply
              </span>
            )}
          </div>
        </div>

        <form action={setCrmConversationClosedAction}>
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="closed" value={isClosed ? "0" : "1"} />
          <ActionButton
            variant="secondary"
            pendingText={isClosed ? "Reopening…" : "Closing…"}
          >
            {isClosed ? "Reopen" : "Close conversation"}
          </ActionButton>
        </form>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-[30px] border border-black/5 bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
          <div className="space-y-4">
            {allMessages.map((message: any) => {
              const outbound = message.direction === "outbound";
              const attachments = message.resolvedAttachments || [];

              return (
                <div
                  key={message.id}
                  className={`flex ${outbound ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={[
                      "max-w-[82%] rounded-3xl px-4 py-3",
                      outbound
                        ? "bg-[#23313f] text-white"
                        : "bg-[#f5f1eb] text-[#1f1e1b]",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                        outbound ? "text-white/65" : "text-[#9a723e]",
                      ].join(" ")}
                    >
                      {channelLabel(message.channel)} · {outbound ? "You" : message.sender_identity || "Customer"}
                    </div>

                    {message.body_text && (
                      <div className="whitespace-pre-wrap text-sm leading-6">
                        {message.body_text}
                      </div>
                    )}

                    {attachments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {attachments.map((attachment: any, index: number) => {
                          const url = String(attachment.url || "");

                          if (attachment.type === "image" && url) {
                            return (
                              <a
                                key={`${attachment.storagePath}-${index}`}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="block"
                              >
                                <img
                                  src={url}
                                  alt={attachment.name || "Attachment"}
                                  className="max-h-[360px] max-w-full rounded-2xl object-cover"
                                />
                              </a>
                            );
                          }

                          return (
                            <a
                              key={`${attachment.storagePath}-${index}`}
                              href={url || undefined}
                              target={url ? "_blank" : undefined}
                              rel={url ? "noreferrer" : undefined}
                              className={[
                                "block rounded-2xl px-3 py-2 text-xs font-semibold",
                                url ? "underline" : "opacity-60",
                                outbound
                                  ? "bg-white/10 text-white"
                                  : "bg-white text-[#23313f]",
                              ].join(" ")}
                            >
                              📎 {attachment.name || "Attachment"}
                            </a>
                          );
                        })}
                      </div>
                    )}

                    {!message.body_text && attachments.length === 0 && (
                      <div className="text-sm">(empty message)</div>
                    )}

                    <div
                      className={[
                        "mt-2 flex flex-wrap items-center gap-2 text-[11px]",
                        outbound ? "text-white/55" : "text-[#8b8177]",
                      ].join(" ")}
                    >
                      <span>{formatDate(message.sent_at || message.created_at)}</span>
                      {outbound && (
                        <span>· {String(message.status || "sent").replaceAll("_", " ")}</span>
                      )}
                      {message.delivered_at && <span>Delivered</span>}
                      {message.failed_at && (
                        <span className="font-semibold text-red-500">Failed</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {allMessages.length === 0 && (
              <div className="py-12 text-center text-sm text-[#8b8177]">
                No messages yet.
              </div>
            )}
          </div>

          {!isClosed && canReply && (
            <CrmReplyForm
              conversationId={conversationId}
              replyChannel={replyChannel}
              action={replyToCrmConversationAction}
            />
          )}

          {!isClosed && !canReply && (
            <div className="mt-6 rounded-2xl bg-[#f7f3ed] px-4 py-3 text-sm text-[#6c6258]">
              This conversation does not have a supported reply channel yet.
            </div>
          )}

          {isClosed && (
            <div className="mt-6 rounded-2xl bg-[#f7f3ed] px-4 py-3 text-sm text-[#6c6258]">
              Conversation is closed. Reopen it to send another reply.
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-[26px] border border-black/5 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
              Contact
            </div>
            <div className="mt-3 font-semibold text-[#1f1e1b]">{personName}</div>
            <div className="mt-2 space-y-1 text-sm text-[#6c6258]">
              {lead?.instagram_username && (
                <div>
                  Instagram @{String(lead.instagram_username).replace(/^@+/, "")}
                </div>
              )}
              <div>{customer?.email || lead?.customer_email || "No email"}</div>
              <div>{customer?.phone || lead?.customer_phone || "No phone"}</div>
            </div>
          </section>

          {(lead || booking) && (
            <section className="rounded-[26px] border border-black/5 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Event
              </div>
              <div className="mt-3 text-sm text-[#1f1e1b]">
                {booking?.booking_number || lead?.requested_product || "Lead"}
              </div>
              <div className="mt-1 text-sm text-[#6c6258]">
                {booking?.event_date || lead?.event_date || "No date yet"}
              </div>
              {lead?.event_city && (
                <div className="mt-1 text-sm text-[#6c6258]">{lead.event_city}</div>
              )}
              {lead?.status && (
                <div className="mt-3 inline-flex rounded-full bg-[#f5f1eb] px-3 py-1 text-xs font-semibold uppercase">
                  {lead.status.replaceAll("_", " ")}
                </div>
              )}
              {lead?.id && (
                <Link
                  href={`/admin/crm/events/${lead.id}`}
                  className="mt-4 block rounded-full bg-[#23313f] px-4 py-2 text-center text-xs font-semibold text-white transition hover:bg-[#192833] active:scale-[0.98]"
                >
                  Open Event Center
                </Link>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

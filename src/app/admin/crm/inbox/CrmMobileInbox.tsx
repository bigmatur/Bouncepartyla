"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import CrmReplyForm from "./[conversationId]/CrmReplyForm";
import MarkConversationRead from "./MarkConversationRead";

type Action = (formData: FormData) => Promise<void>;

type Props = {
  conversations: any[];
  leadsById: Record<string, any>;
  customersById: Record<string, any>;
  lastMessagesById: Record<string, any>;
  selectedConversation: any;
  selectedLead: any;
  selectedCustomer: any;
  selectedMessages: any[];
  contextCustomer: any;
  contextBooking: any;
  activeFilter: string;
  searchQuery: string;
  selectedConversationId: string;
  replyChannel: string;
  canReply: boolean;
  replyAction: Action;
  closeAction: Action;
  updateLeadNotesAction: (formData: FormData) => void | Promise<void>;
  updateLeadFollowUpAction: (formData: FormData) => void | Promise<void>;
  createTaskAction: (formData: FormData) => void | Promise<void>;
  openTasks: any[];
  completeTaskAction: (formData: FormData) => void | Promise<void>;
  updateLeadStatusAction: (formData: FormData) => void | Promise<void>;
  pipelineHistory: any[];
  resendContractAction: (formData: FormData) => void | Promise<void>;
};

function personName(conversation: any, lead: any, customer: any) {
  return (
    customer?.full_name ||
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim() ||
    lead?.customer_name ||
    conversation?.subject ||
    "CRM contact"
  );
}

function channelLabel(value: unknown) {
  const channel = String(value || "CRM").toLowerCase();
  if (channel === "instagram") return "Instagram";
  if (channel === "whatsapp") return "WhatsApp";
  return channel.toUpperCase();
}

function workingStatus(conversation: any) {
  if (conversation?.status === "closed") return "Closed";
  return conversation?.needs_reply ? "Waiting for us" : "Waiting for customer";
}

function timeLabel(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const minutes = Math.max(0, Math.round((now - date.getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function hrefFor(params: { status?: string; q?: string; conversation?: string }) {
  const query = new URLSearchParams();
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.conversation) query.set("conversation", params.conversation);
  const value = query.toString();
  return value ? `/admin/crm/inbox?${value}` : "/admin/crm/inbox";
}

function MessageBubble({ message }: { message: any }) {
  const outbound = message.direction === "outbound";
  const attachments = message.resolvedAttachments || [];

  const statusText = message.failed_at
    ? "Failed"
    : message.delivered_at
      ? "Delivered"
      : outbound
        ? String(message.status || "sent").replaceAll("_", " ")
        : "";

  return (
    <div
      className={[
        "flex w-full",
        outbound ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div
        className={[
          "max-w-[82%] px-3 py-2 shadow-sm",
          outbound
            ? "rounded-[18px] rounded-br-[5px] bg-[#dcebd7] text-[#20251f]"
            : "rounded-[18px] rounded-bl-[5px] bg-white text-[#292622]",
        ].join(" ")}
      >
        {!outbound && (
          <div className="mb-0.5 text-[10px] font-semibold text-[#9a723e]">
            {message.sender_identity || channelLabel(message.channel)}
          </div>
        )}

        {message.body_text && (
          <div className="whitespace-pre-wrap break-words text-[14px] leading-[19px]">
            {message.body_text}
          </div>
        )}

        {attachments.length > 0 && (
          <div className={message.body_text ? "mt-2 space-y-2" : "space-y-2"}>
            {attachments.map(
              (attachment: any, index: number) => {
                const url = String(attachment.url || "");

                return (
                  <a
                    key={`${attachment.storagePath}-${index}`}
                    href={url || undefined}
                    target={url ? "_blank" : undefined}
                    rel={url ? "noreferrer" : undefined}
                    className="block max-w-full overflow-hidden rounded-xl bg-black/5 text-xs font-semibold"
                  >
                    {attachment.type === "image" && url ? (
                      <img
                        src={url}
                        alt={attachment.name || "Attachment"}
                        className="max-h-64 w-full object-cover"
                      />
                    ) : (
                      <div className="break-words px-3 py-2">
                        📎 {attachment.name || "Attachment"}
                      </div>
                    )}
                  </a>
                );
              },
            )}
          </div>
        )}

        {!message.body_text &&
          attachments.length === 0 && (
            <div className="text-sm text-[#7c746c]">
              (empty message)
            </div>
          )}

        <div className="mt-1 flex items-center justify-end gap-1 text-[9px] leading-none text-[#837b73]">
          <span>
            {timeLabel(
              message.sent_at ||
                message.created_at,
            )}
          </span>

          {outbound && statusText && (
            <>
              <span>·</span>
              <span
                className={
                  message.failed_at
                    ? "font-semibold text-red-500"
                    : ""
                }
              >
                {statusText}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export default function CrmMobileInbox(props: Props) {
  const [contextOpen, setContextOpen] = useState(false);

  const messagesScrollRef =
  useRef<HTMLDivElement>(null);

const shouldAutoScrollRef =
  useRef(true);

const [showScrollToBottom, setShowScrollToBottom] =
  useState(false);

function scrollMessagesToBottom(
  behavior: ScrollBehavior = "smooth",
) {
  const container =
    messagesScrollRef.current;

  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior,
  });

  shouldAutoScrollRef.current = true;
  setShowScrollToBottom(false);
}

function handleMessagesScroll() {
  const container =
    messagesScrollRef.current;

  if (!container) return;

  const distanceFromBottom =
    container.scrollHeight -
    container.scrollTop -
    container.clientHeight;

  const nearBottom =
    distanceFromBottom < 120;

  shouldAutoScrollRef.current =
    nearBottom;

  setShowScrollToBottom(
    !nearBottom,
  );
}

useEffect(() => {
  const frame =
    window.requestAnimationFrame(() => {
      scrollMessagesToBottom("auto");
    });

  return () => {
    window.cancelAnimationFrame(frame);
  };
}, [props.selectedConversation?.id]);

useEffect(() => {
  if (
    shouldAutoScrollRef.current
  ) {
    const frame =
      window.requestAnimationFrame(() => {
        scrollMessagesToBottom(
          "smooth",
        );
      });

    return () => {
      window.cancelAnimationFrame(
        frame,
      );
    };
  }

  setShowScrollToBottom(true);
}, [props.selectedMessages.length]);

  const selected = props.selectedConversation;
  const selectedName = selected ? personName(selected, props.selectedLead, props.selectedCustomer) : "";
  const customer = props.contextCustomer || props.selectedCustomer;
  const booking = props.contextBooking;
  const bookings = Array.isArray(customer?.bookings) ? customer.bookings : [];
  const lifetime = bookings.reduce((sum: number, item: any) => sum + Number(item.total_amount || 0), 0);

  if (!selected) {
    return (
      <section className="lg:hidden">
        
        <div className="rounded-[24px] border border-[#ded7cd] bg-white p-3 shadow-sm">
          <form action="/admin/crm/inbox" method="GET" className="flex gap-2">
            <input name="q" defaultValue={props.searchQuery} placeholder="Search conversations" className="min-h-11 min-w-0 flex-1 rounded-full border border-[#ddd5cb] bg-[#faf9f7] px-4 text-sm outline-none focus:border-[#243442]" />
            <button type="submit" className="min-h-11 rounded-full bg-[#23313f] px-4 text-sm font-semibold text-white">Search</button>
          </form>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {[['all', 'All'], ['needs_reply', 'Needs reply'], ['unread', 'Unread'], ['open', 'Open'], ['closed', 'Closed']].map(([value, label]) => (
              <Link key={value} href={hrefFor({ status: value, q: props.searchQuery })} className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold ${props.activeFilter === value || (value === 'all' && props.activeFilter === 'all') ? 'border-[#23313f] bg-[#23313f] text-white' : 'border-[#ddd5cb] bg-white text-[#554f48]'}`}>{label}</Link>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-[24px] border border-[#ded7cd] bg-white">
          {props.conversations.map((conversation) => {
            const lead = props.leadsById[String(conversation.lead_id)];
            const customerRow = props.customersById[String(conversation.customer_id)];
            const name = personName(conversation, lead, customerRow);
            const unread = Number(conversation.unread_count || 0);
            const last = props.lastMessagesById[String(conversation.id)];
            return (
              <Link key={conversation.id} href={hrefFor({ status: props.activeFilter, q: props.searchQuery, conversation: String(conversation.id) })} className={`block border-b border-[#eee5dc] px-4 py-4 last:border-0 ${unread > 0 ? 'bg-[#fff8ec]' : 'bg-white'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#23313f] text-sm font-bold text-white">{name.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3"><div className={`truncate text-sm ${unread ? 'font-bold' : 'font-semibold'}`}>{name}</div><span className="shrink-0 text-[11px] text-[#91887f]">{timeLabel(conversation.last_message_at || last?.created_at)}</span></div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[9px] font-bold text-[#315ea8]">{channelLabel(conversation.last_channel)}</span>{conversation.status !== "closed" && (
  <span
    className={[
      "rounded-full px-2 py-0.5 text-[9px] font-bold",
      conversation.needs_reply
        ? "bg-[#fff0d5] text-[#9b6100]"
        : "bg-[#edf6ef] text-[#477253]",
    ].join(" ")}
  >
    {conversation.needs_reply
      ? "WAITING FOR US"
      : "WAITING FOR CUSTOMER"}
  </span>
)}</div>
                    <div className="mt-1.5 truncate text-xs text-[#6c6258]">{last?.body_text || lead?.requested_product || 'No messages yet'}</div>
                    {(lead?.event_date || lead?.event_city) && (
  <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[#8a6740]">
    <span className="shrink-0 text-[#c9964f]">◇</span>
    <span className="truncate">
      {lead?.event_date || ""}
      {lead?.event_city
        ? ` · ${lead.event_city}`
        : ""}
    </span>
  </div>
)}
                  </div>
                  {unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#23313f] px-1.5 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
                </div>
              </Link>
            );
          })}
          {props.conversations.length === 0 && <div className="px-6 py-16 text-center text-sm text-[#8b8177]">No conversations</div>}
        </div>
      </section>
    );
  }

  return (
    <section className="fixed inset-x-0 top-[72px] bottom-0 z-[55] flex min-h-0 flex-col overflow-hidden bg-[#f3eee7] lg:hidden">
      <MarkConversationRead
        conversationId={selected.id}
        unreadCount={Number(selected.unread_count || 0)}
      />

      <header className="relative z-30 shrink-0 border-b border-[#ddd5cb] bg-[#f5efe6]/98 px-2.5 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={hrefFor({
              status: props.activeFilter,
              q: props.searchQuery,
            })}
            aria-label="Back to Inbox"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[24px] font-semibold leading-none text-[#23313f] shadow-sm ring-1 ring-black/5"
          >
            &lsaquo;
          </Link>

          <button
            type="button"
            onClick={() => setContextOpen(true)}
            className="min-w-0 flex-1 text-left"
          >
            <div className="truncate text-[15px] font-bold leading-5 text-[#1f1e1b]">
              {selectedName}
            </div>
            <div className="truncate text-[11px] leading-4 text-[#8b8177]">
              {channelLabel(
                props.replyChannel ||
                  selected.last_channel,
              )}
              {" · "}
              {workingStatus(selected)}
            </div>
          </button>

          <form
            action={props.closeAction}
            className="shrink-0"
          >
            <input
              type="hidden"
              name="conversationId"
              value={selected.id}
            />
            <input
              type="hidden"
              name="closed"
              value={
                selected.status === "closed"
                  ? "0"
                  : "1"
              }
            />
            <button
              type="submit"
              className="flex h-9 items-center justify-center rounded-full border border-[#d8cec0] bg-white px-3 text-[11px] font-bold text-[#23313f]"
            >
              {selected.status === "closed"
                ? "Reopen"
                : "Close"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setContextOpen(true)}
            aria-label="Open customer and event context"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#23313f] text-sm font-bold text-white"
          >
            i
          </button>
        </div>
      </header>

      <div
  
  ref={messagesScrollRef}
  onScroll={handleMessagesScroll}
  className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f8f5f0] px-2.5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
>
        <div className="space-y-2.5 pb-2">
          {props.selectedMessages.map(
            (message) => (
              <MessageBubble
                key={message.id}
                message={message}
              />
            ),
          )}

          {props.selectedMessages.length === 0 && (
            <div className="flex min-h-[50vh] items-center justify-center text-center text-sm text-[#8b8177]">
              No messages yet.
            </div>
          )}
        </div>
      </div>

        {showScrollToBottom && (

          <button

            type="button"

            onClick={() =>

              scrollMessagesToBottom(

                "smooth",

              )

            }

            aria-label="Scroll to latest message"

            className="absolute bottom-[88px] right-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-white text-xl font-semibold text-[#23313f] shadow-lg"

          >

            ↓

          </button>

        )}
      <footer className="relative z-30 shrink-0 border-t border-[#ddd5cb] bg-[#f5efe6]/98 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur">
        {selected.status !== "closed" &&
          props.canReply && (
            <CrmReplyForm
              conversationId={selected.id}
              replyChannel={props.replyChannel}
              action={props.replyAction}
            />
          )}

        {selected.status !== "closed" &&
          !props.canReply && (
            <div className="my-2 rounded-2xl bg-white px-3 py-2.5 text-xs text-[#6c6258]">
              This conversation does not have a supported reply channel yet.
            </div>
          )}

        {selected.status === "closed" && (
          <div className="my-2 rounded-2xl bg-white px-3 py-2.5 text-xs text-[#6c6258]">
            Conversation is closed. Reopen it to reply.
          </div>
        )}
      </footer>

      {contextOpen && <div className="fixed inset-0 z-[65] lg:hidden"><button type="button" aria-label="Close customer and event context" onClick={() => setContextOpen(false)} className="absolute inset-0 bg-black/40" /><aside className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[28px] bg-[#faf8f5] p-5 shadow-2xl"><div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d7cec2]" /><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Customer / Event</div><h2 className="mt-1 text-xl font-semibold text-[#1f1e1b]">{selectedName}</h2></div><button type="button" onClick={() => setContextOpen(false)} aria-label="Close context" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg text-[#23313f]">×</button></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white p-3"><div className="text-xs text-[#8b8177]">Bookings</div><div className="mt-1 text-xl font-semibold">{bookings.length || '—'}</div></div><div className="rounded-2xl bg-white p-3"><div className="text-xs text-[#8b8177]">Lifetime</div><div className="mt-1 text-xl font-semibold">${lifetime.toLocaleString('en-US')}</div></div></div><div className="mt-4 space-y-1 text-sm text-[#6c6258]"><div>{customer?.phone || props.selectedLead?.customer_phone || 'No phone'}</div><div>{customer?.email || props.selectedLead?.customer_email || 'No email'}</div>{props.selectedLead?.instagram_username && <div>Instagram @{props.selectedLead.instagram_username}</div>}</div>{(booking || props.selectedLead) && <div className="mt-4 rounded-2xl bg-white p-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Next event</div><div className="mt-2 font-semibold text-[#1f1e1b]">{booking?.booking_number || props.selectedLead?.requested_product || 'Event'}</div><div className="mt-1 text-sm text-[#6c6258]">{booking?.event_date || props.selectedLead?.event_date || 'No date'}{booking?.setup_city || props.selectedLead?.event_city ? ` · ${booking?.setup_city || props.selectedLead?.event_city}` : ''}</div><div className="mt-1 text-sm text-[#6c6258]">{booking?.total_amount ? `$${Number(booking.total_amount).toLocaleString('en-US')}` : props.selectedLead?.quoted_total ? `$${Number(props.selectedLead.quoted_total).toLocaleString('en-US')}` : 'No total yet'}</div><div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-[#f4ede2] px-3 py-1">Deposit {booking?.deposit_amount ?? props.selectedLead?.deposit_requested ?? '—'}</span><span className="rounded-full bg-[#f4ede2] px-3 py-1">Contract {booking?.contract_status || '—'}</span></div></div>}{booking?.id && <div className="mt-4 rounded-2xl bg-white p-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Payment / Contract</div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#f7f3ed] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">Total</div><div className="mt-1 text-sm font-semibold text-[#2d2925]">{booking?.total_amount !== null && booking?.total_amount !== undefined ? `$${Number(booking.total_amount).toLocaleString("en-US")}` : "—"}</div></div><div className="rounded-xl bg-[#edf6ef] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[#718876]">Paid</div><div className="mt-1 text-sm font-semibold text-[#355b3e]">{booking?.amount_paid !== null && booking?.amount_paid !== undefined ? `$${Number(booking.amount_paid).toLocaleString("en-US")}` : "—"}</div></div><div className="rounded-xl bg-[#fff0d5] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[#9b761f]">Balance</div><div className="mt-1 text-sm font-semibold text-[#8a5a00]">{booking?.balance_due !== null && booking?.balance_due !== undefined ? `$${Number(booking.balance_due).toLocaleString("en-US")}` : "—"}</div></div><div className="rounded-xl bg-[#f7f3ed] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">Deposit</div><div className="mt-1 text-sm font-semibold text-[#2d2925]">{booking?.deposit_amount !== null && booking?.deposit_amount !== undefined ? `$${Number(booking.deposit_amount).toLocaleString("en-US")}` : "—"}</div></div></div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10px] font-bold uppercase text-[#315ea8]">Payment {String(booking?.payment_status || "—").replaceAll("_", " ")}</span><span className="rounded-full bg-[#f4ede2] px-2.5 py-1 text-[10px] font-bold uppercase text-[#745934]">Contract {String(booking?.contract_status || "—").replaceAll("_", " ")}</span></div><Link href={`/admin/bookings/${booking.id}`} className="mt-3 block rounded-full border border-[#d8cec0] bg-white px-4 py-3 text-center text-sm font-semibold text-[#2b2a28]">Open Booking</Link></div>}{booking?.id && <div className="mt-4 rounded-2xl bg-white p-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Payment actions</div><div className="mt-3 grid grid-cols-2 gap-2"><Link href={`/admin/bookings/${booking.id}`} className="min-h-[46px] rounded-full bg-[#23313f] px-4 py-3 text-center text-sm font-semibold text-white">Take payment</Link><form action={props.resendContractAction}><input type="hidden" name="bookingId" value={booking.id} /><button type="submit" className="min-h-[46px] w-full rounded-full border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#2b2a28]">Resend contract</button></form></div></div>}{bookings.length > 1 && <div className="mt-4 rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Previous events</div><div className="text-[11px] font-semibold text-[#8b8177]">{bookings.length} total</div></div><div className="mt-3 divide-y divide-[#eee7de]">{[...bookings].sort((a: any, b: any) => { const aTime = a?.event_date ? new Date(`${a.event_date}T12:00:00`).getTime() : 0; const bTime = b?.event_date ? new Date(`${b.event_date}T12:00:00`).getTime() : 0; return bTime - aTime; }).filter((item: any) => !booking?.id || String(item?.id || "") !== String(booking.id)).slice(0, 3).map((item: any) => <Link key={String(item.id)} href={`/admin/bookings/${item.id}`} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#2d2925]">{item.booking_number || "Booking"}</div><div className="mt-0.5 truncate text-xs text-[#847a71]">{item.event_date || "No date"}{item.setup_city ? ` / ${item.setup_city}` : ""}</div></div><div className="shrink-0 text-right text-xs font-semibold text-[#2d2925]">{item.total_amount !== null && item.total_amount !== undefined ? `$${Number(item.total_amount).toLocaleString("en-US")}` : "—"}</div></Link>)}</div></div>}{(customer?.phone || props.selectedLead?.customer_phone || customer?.email || props.selectedLead?.customer_email || props.selectedLead?.instagram_username) && <div className="mt-4 rounded-2xl bg-white p-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Quick contact</div><div className="mt-3 grid grid-cols-2 gap-2">{(customer?.phone || props.selectedLead?.customer_phone) && <a href={`tel:${String(customer?.phone || props.selectedLead?.customer_phone).replace(/[^0-9+]/g, "")}`} className="rounded-full border border-[#d8cec0] bg-white px-3 py-3 text-center text-sm font-semibold text-[#2b2a28]">Call</a>}{(customer?.phone || props.selectedLead?.customer_phone) && <a href={`sms:${String(customer?.phone || props.selectedLead?.customer_phone).replace(/[^0-9+]/g, "")}`} className="rounded-full border border-[#d8cec0] bg-white px-3 py-3 text-center text-sm font-semibold text-[#2b2a28]">SMS</a>}{(customer?.email || props.selectedLead?.customer_email) && <a href={`mailto:${String(customer?.email || props.selectedLead?.customer_email).trim()}`} className="rounded-full border border-[#d8cec0] bg-white px-3 py-3 text-center text-sm font-semibold text-[#2b2a28]">Email</a>}{props.selectedLead?.instagram_username && <a href={`https://www.instagram.com/${String(props.selectedLead.instagram_username).replace(/^@+/, "")}/`} target="_blank" rel="noreferrer" className="rounded-full border border-[#d8cec0] bg-white px-3 py-3 text-center text-sm font-semibold text-[#2b2a28]">Instagram</a>}</div></div>}{props.selectedLead?.id && <div className="mt-4 rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Lead notes</div><div className="text-[10px] text-[#9a9188]">Internal</div></div><form action={props.updateLeadNotesAction} className="mt-3"><input type="hidden" name="leadId" value={props.selectedLead.id} /><textarea name="notes" defaultValue={String(props.selectedLead?.notes || "").trim()} rows={4} placeholder="Add notes about this customer or event..." className="w-full resize-y rounded-2xl border border-[#ded7cd] bg-[#faf8f5] px-3 py-3 text-sm leading-6 text-[#3f3934] outline-none focus:border-[#c9964f]" /><button type="submit" className="mt-2 min-h-[44px] w-full rounded-full bg-[#23313f] px-4 py-3 text-sm font-semibold text-white">Save notes</button></form></div>}<div className="mt-4 rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Communication summary</div><span className={["rounded-full px-2.5 py-1 text-[10px] font-bold", props.selectedConversation?.needs_reply ? "bg-[#fff0d5] text-[#9b6100]" : "bg-[#edf6ef] text-[#477253]"].join(" ")}>{props.selectedConversation?.needs_reply ? "NEEDS REPLY" : "UP TO DATE"}</span></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#f7f3ed] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">Channel</div><div className="mt-1 truncate text-xs font-semibold capitalize text-[#2d2925]">{String(props.selectedConversation?.last_channel || "unknown").replaceAll("_", " ")}</div></div><div className="rounded-xl bg-[#f7f3ed] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">Unread</div><div className="mt-1 text-xs font-semibold text-[#2d2925]">{Number(props.selectedConversation?.unread_count || 0)}</div></div><div className="rounded-xl bg-[#f7f3ed] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">Last inbound</div><div className="mt-1 text-xs font-semibold text-[#2d2925]">{props.selectedConversation?.last_inbound_at ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(props.selectedConversation.last_inbound_at)) : "—"}</div></div><div className="rounded-xl bg-[#f7f3ed] p-3"><div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">Last outbound</div><div className="mt-1 text-xs font-semibold text-[#2d2925]">{props.selectedConversation?.last_outbound_at ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(props.selectedConversation.last_outbound_at)) : "—"}</div></div></div>{props.selectedLead?.last_contacted_at && <div className="mt-2 rounded-xl bg-[#eef4ff] px-3 py-2 text-xs text-[#315ea8]">Last contacted <span className="font-semibold">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(props.selectedLead.last_contacted_at))}</span></div>}</div>{props.pipelineHistory.length > 0 && <div className="mt-4 rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Pipeline history</div>{props.selectedLead?.id && <Link href={`/admin/crm/events/${props.selectedLead.id}`} className="text-[11px] font-semibold text-[#6f665e] underline underline-offset-2">Full timeline</Link>}</div><div className="mt-3 space-y-3">{props.pipelineHistory.slice(0, 4).map((item: any) => <div key={String(item.id)} className="relative pl-5"><span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[#c9964f]" /><div className="text-xs font-semibold text-[#2d2925]">{String(item.from_status || "new").replaceAll("_", " ")}{" → "}{String(item.to_status || "").replaceAll("_", " ")}</div><div className="mt-0.5 text-[10px] text-[#8b8177]">{item.changed_at ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.changed_at)) : ""}</div>{item.reason && <div className="mt-1 text-xs leading-5 text-[#766d65]">{item.reason}</div>}</div>)}</div></div>}{props.selectedLead?.id && <div className="mt-4 rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Pipeline</div><div className="rounded-full bg-[#f4ede2] px-2.5 py-1 text-[10px] font-bold uppercase text-[#745934]">{String(props.selectedLead.status || "new").replaceAll("_", " ")}</div></div><form action={props.updateLeadStatusAction} className="mt-3 space-y-3"><input type="hidden" name="leadId" value={props.selectedLead.id} /><select name="status" defaultValue={props.selectedLead.status || "new"} className="min-h-[46px] w-full rounded-full border border-[#ded7cd] bg-[#faf8f5] px-4 text-sm font-semibold text-[#3f3934] outline-none focus:border-[#c9964f]"><option value="new">New</option><option value="quote_sent">Quote sent</option><option value="follow_up">Follow-up</option><option value="deposit_pending">Deposit pending</option><option value="booked">Booked</option><option value="lost">Lost</option><option value="cancelled">Cancelled</option></select><input name="reason" placeholder="Reason / note (optional)" className="min-h-[46px] w-full rounded-full border border-[#ded7cd] bg-[#faf8f5] px-4 text-sm text-[#4c4540] outline-none focus:border-[#c9964f]" /><button type="submit" className="min-h-[46px] w-full rounded-full bg-[#23313f] px-4 py-3 text-sm font-semibold text-white">Update stage</button></form></div>}{props.selectedLead?.id && <div className="mt-4 rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Follow-up</div>{props.selectedLead?.next_follow_up_at && <div className="text-[10px] font-semibold text-[#8b8177]">Scheduled</div>}</div><form action={props.updateLeadFollowUpAction} className="mt-3"><input type="hidden" name="leadId" value={props.selectedLead.id} /><input type="date" name="followUpDate" defaultValue={props.selectedLead?.next_follow_up_at ? String(props.selectedLead.next_follow_up_at).slice(0, 10) : ""} className="min-h-[46px] w-full rounded-full border border-[#ded7cd] bg-[#faf8f5] px-4 text-sm text-[#3f3934] outline-none focus:border-[#c9964f]" /><div className="mt-2 grid grid-cols-2 gap-2"><button type="submit" className="min-h-[44px] rounded-full bg-[#23313f] px-4 py-3 text-sm font-semibold text-white">Save date</button><button type="submit" name="followUpDate" value="" className="min-h-[44px] rounded-full border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#2b2a28]">Clear</button></div></form></div>}{props.openTasks.length > 0 && <div className="mt-4 rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Open tasks</div><div className="rounded-full bg-[#fff0d5] px-2.5 py-1 text-[10px] font-bold text-[#925c00]">{props.openTasks.length}</div></div><div className="mt-3 divide-y divide-[#eee7de]">{props.openTasks.slice(0, 4).map((task: any) => <div key={String(task.id)} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-[#2d2925]">{task.title}</div><div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-[#8b8177]"><span className="rounded-full bg-[#f4f0ea] px-2 py-0.5">{String(task.task_type || "follow_up").replaceAll("_", " ")}</span>{task.due_at && <span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(task.due_at))}</span>}</div>{task.description && <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-[#766d65]">{task.description}</div>}</div><form action={props.completeTaskAction} className="shrink-0"><input type="hidden" name="taskId" value={task.id} /><button type="submit" className="min-h-[38px] rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold text-[#477253]">Complete</button></form></div></div>)}</div>{props.openTasks.length > 4 && <Link href="/admin/tasks" className="mt-3 block text-center text-xs font-semibold text-[#6f665e] underline underline-offset-2">View all tasks</Link>}</div>}{props.selectedLead?.id && <div className="mt-4 rounded-2xl bg-white p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Create task</div><Link href="/admin/tasks" className="text-[11px] font-semibold text-[#6f665e] underline underline-offset-2">All tasks</Link></div><form action={props.createTaskAction} className="mt-3 space-y-3"><input type="hidden" name="customerId" value={customer?.id || ""} /><input type="hidden" name="bookingId" value={booking?.id || ""} /><input name="title" required placeholder="Follow up about deposit" className="min-h-[46px] w-full rounded-full border border-[#ded7cd] bg-[#faf8f5] px-4 text-sm text-[#3f3934] outline-none focus:border-[#c9964f]" /><div className="grid grid-cols-2 gap-2"><select name="taskType" defaultValue="follow_up" className="min-h-[46px] rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-xs font-semibold text-[#4c4540] outline-none"><option value="follow_up">Follow-up</option><option value="deposit">Deposit</option><option value="contract">Contract</option><option value="coi">COI / Insurance</option><option value="route">Route</option><option value="inventory">Inventory</option><option value="cleaning">Cleaning</option><option value="review">Review request</option></select><input type="date" name="dueDate" defaultValue={props.selectedLead?.next_follow_up_at ? String(props.selectedLead.next_follow_up_at).slice(0, 10) : ""} className="min-h-[46px] min-w-0 rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-xs text-[#4c4540] outline-none" /></div><div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2"><input type="time" name="dueTime" defaultValue="09:00" className="min-h-[46px] min-w-0 rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-xs text-[#4c4540] outline-none" /><input name="description" placeholder="Notes for the team..." className="min-h-[46px] min-w-0 rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-xs text-[#4c4540] outline-none" /></div><button type="submit" className="min-h-[46px] w-full rounded-full bg-[#c9964f] px-4 py-3 text-sm font-semibold text-white">Add task</button></form></div>}<div className="mt-4 grid gap-2">{props.selectedLead?.id && <Link href={`/admin/crm/events/${props.selectedLead.id}`} className="rounded-full bg-[#23313f] px-4 py-3 text-center text-sm font-semibold text-white">Open Event Center</Link>}{customer?.id && <Link href={`/admin/customers/${customer.id}`} className="rounded-full border border-[#d8cec0] bg-white px-4 py-3 text-center text-sm font-semibold text-[#2b2a28]">Open Customer</Link>}{booking?.id && <Link href={`/admin/bookings/${booking.id}`} className="rounded-full border border-[#d8cec0] bg-white px-4 py-3 text-center text-sm font-semibold text-[#2b2a28]">Open Booking</Link>}{!booking?.id && <Link href={props.selectedLead?.id ? `/admin/bookings/new?leadId=${props.selectedLead.id}` : "/admin/bookings/new"} className="rounded-full bg-[#c9964f] px-4 py-3 text-center text-sm font-semibold text-white">Create Booking</Link>}{customer?.id && <Link href={`/admin/tasks?customerId=${customer.id}`} className="rounded-full border border-[#d8cec0] bg-white px-4 py-3 text-center text-sm font-semibold text-[#2b2a28]">Create Task</Link>}</div></aside></div>}
    </section>
  );
}

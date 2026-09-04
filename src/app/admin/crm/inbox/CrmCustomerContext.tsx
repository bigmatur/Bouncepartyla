import Link from "next/link";

type Props = {
  selectedConversation: any;
  selectedLead: any;
  contextCustomer: any;
  contextBooking: any;
  updateLeadNotesAction: (formData: FormData) => void | Promise<void>;
  updateLeadFollowUpAction: (formData: FormData) => void | Promise<void>;
  createTaskAction: (formData: FormData) => void | Promise<void>;
  openTasks: any[];
  completeTaskAction: (formData: FormData) => void | Promise<void>;
  updateLeadStatusAction: (formData: FormData) => void | Promise<void>;
  pipelineHistory: any[];
  resendContractAction: (formData: FormData) => void | Promise<void>;
};

function personName({
  selectedConversation,
  selectedLead,
  contextCustomer,
}: {
  selectedConversation: any;
  selectedLead: any;
  contextCustomer: any;
}) {
  const customerName = contextCustomer
    ? [
        contextCustomer.first_name,
        contextCustomer.last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .trim()
    : "";

  return (
    customerName ||
    String(contextCustomer?.full_name || "").trim() ||
    String(selectedLead?.customer_name || "").trim() ||
    String(selectedConversation?.subject || "").trim() ||
    "CRM contact"
  );
}

export default function CrmCustomerContext({
  selectedConversation,
  selectedLead,
  contextCustomer,
  contextBooking,
  updateLeadNotesAction,
  updateLeadFollowUpAction,
  createTaskAction,
  openTasks,
  completeTaskAction,
  updateLeadStatusAction,
  pipelineHistory,
  resendContractAction,
}: Props) {
  if (!selectedConversation) {
    return (
      <aside className="min-h-0 overflow-y-auto border-l border-[#e1d9cf] bg-[#faf8f5] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
          Customer / Event
        </div>

        <div className="mt-8 text-sm text-[#8b8177]">
          Select a conversation to view context.
        </div>
      </aside>
    );
  }

  const bookings = Array.isArray(contextCustomer?.bookings)
    ? contextCustomer.bookings
    : [];

  const lifetime = bookings.reduce(
    (sum: number, item: any) =>
      sum + Number(item.total_amount || 0),
    0,
  );

  const bookingCount = bookings.length;

  const repeatCustomer = bookingCount > 1;

  const sortedBookings = [...bookings].sort(
    (a: any, b: any) => {
      const aTime = a?.event_date
        ? new Date(`${a.event_date}T12:00:00`).getTime()
        : 0;
      const bTime = b?.event_date
        ? new Date(`${b.event_date}T12:00:00`).getTime()
        : 0;

      return bTime - aTime;
    },
  );

  const previousBookings = sortedBookings
    .filter(
      (item: any) =>
        !contextBooking?.id ||
        String(item?.id || "") !== String(contextBooking.id),
    )
    .slice(0, 4);

  const phone =
    contextCustomer?.phone ||
    selectedLead?.customer_phone ||
    "";

  const email =
    contextCustomer?.email ||
    selectedLead?.customer_email ||
    "";

  const instagram =
    String(
      selectedLead?.instagram_username || "",
    ).replace(/^@+/, "");

  const normalizedPhone =
    String(phone || "").replace(/[^0-9+]/g, "");

  const normalizedEmail =
    String(email || "").trim();

  const normalizedInstagram =
    String(instagram || "").trim();

  const leadNotes =
    String(selectedLead?.notes || "").trim();

  const eventDate =
    contextBooking?.event_date ||
    selectedLead?.event_date ||
    "";

  const city =
    contextBooking?.setup_city ||
    selectedLead?.event_city ||
    "";

  const eventTitle =
    contextBooking?.booking_number ||
    selectedLead?.requested_product ||
    "Event";

  const total =
    contextBooking?.total_amount ??
    selectedLead?.quoted_total ??
    null;

  const deposit =
    contextBooking?.deposit_amount ??
    selectedLead?.deposit_requested ??
    null;

  const contractStatus =
    contextBooking?.contract_status || "";

  const paymentStatus =
    contextBooking?.payment_status || "";

  const amountPaid =
    contextBooking?.amount_paid ?? null;

  const balanceDue =
    contextBooking?.balance_due ?? null;

  const bookingTotal =
    contextBooking?.total_amount ?? total;

  const normalizedPaymentStatus =
    String(paymentStatus || "")
      .trim()
      .replaceAll("_", " ");

  const normalizedContractStatus =
    String(contractStatus || "")
      .trim()
      .replaceAll("_", " ");

  const communicationChannel =
    String(
      selectedConversation?.last_channel ||
        "unknown",
    )
      .trim()
      .replaceAll("_", " ");

  const lastInboundAt =
    selectedConversation?.last_inbound_at ||
    null;

  const lastOutboundAt =
    selectedConversation?.last_outbound_at ||
    null;

  const lastContactedAt =
    selectedLead?.last_contacted_at ||
    null;

  const unreadCount = Number(
    selectedConversation?.unread_count || 0,
  );

  const needsReply =
    Boolean(
      selectedConversation?.needs_reply,
    );

  const formatCommunicationTime = (
    value: string | null | undefined,
  ) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    return new Intl.DateTimeFormat(
      "en-US",
      {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      },
    ).format(date);
  };

  return (
    <aside className="min-h-0 overflow-y-auto border-l border-[#e1d9cf] bg-[#faf8f5] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
        Customer / Event
      </div>

      <div className="mt-4 space-y-4">
        <section className="rounded-[22px] border border-black/5 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#23313f] text-sm font-bold text-white">
              {personName({
                selectedConversation,
                selectedLead,
                contextCustomer,
              })
                .slice(0, 2)
                .toUpperCase()}
            </div>

            <div className="min-w-0">
              <div className="truncate font-semibold text-[#1f1e1b]">
                {personName({
                  selectedConversation,
                  selectedLead,
                  contextCustomer,
                })}
              </div>

              <div className="mt-1 text-xs text-[#8b8177]">
                {selectedConversation.needs_reply
                  ? "Waiting for us"
                  : "Waiting for customer"}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-[#6c6258]">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[#9a9188]">Phone</span>
              <span className="break-all text-right">
                {phone || "—"}
              </span>
            </div>

            <div className="flex items-start justify-between gap-3">
              <span className="text-[#9a9188]">Email</span>
              <span className="break-all text-right">
                {email || "—"}
              </span>
            </div>

            <div className="flex items-start justify-between gap-3">
              <span className="text-[#9a9188]">
                Instagram
              </span>
              <span className="text-right">
                {instagram ? `@${instagram}` : "—"}
              </span>
            </div>
          </div>

          {repeatCustomer && (
            <div className="mt-4 inline-flex rounded-full bg-[#eaf2f9] px-2.5 py-1 text-[11px] font-semibold text-[#355879]">
              Repeat customer
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-[18px] border border-black/5 bg-white p-3">
            <div className="text-[11px] text-[#8b8177]">
              Bookings
            </div>

            <div className="mt-1 text-xl font-semibold text-[#1f1e1b]">
              {bookingCount || "—"}
            </div>
          </div>

          <div className="rounded-[18px] border border-black/5 bg-white p-3">
            <div className="text-[11px] text-[#8b8177]">
              Lifetime
            </div>

            <div className="mt-1 text-xl font-semibold text-[#1f1e1b]">
              {bookingCount
                ? `$${lifetime.toLocaleString("en-US")}`
                : "—"}
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-black/5 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
            Current event
          </div>

          <div className="mt-2 font-semibold text-[#1f1e1b]">
            {eventTitle}
          </div>

          <div className="mt-2 space-y-1 text-sm text-[#6c6258]">
            <div>
              {eventDate || "No date"}
              {city ? ` · ${city}` : ""}
            </div>

            <div>
              {total !== null && total !== undefined
                ? `$${Number(total).toLocaleString("en-US")}`
                : "No total yet"}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#f7f3ed] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">
                Deposit
              </div>

              <div className="mt-1 text-xs font-semibold text-[#3e3934]">
                {deposit !== null && deposit !== undefined
                  ? `$${Number(deposit).toLocaleString("en-US")}`
                  : "—"}
              </div>
            </div>

                        <div className="rounded-xl bg-[#f7f3ed] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">
                Contract
              </div>

              <div className="mt-1 text-xs font-semibold text-[#3e3934]">
                {contractStatus || "—"}
              </div>
            </div>

            <div className="rounded-xl bg-[#f7f3ed] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">
                Payment
              </div>

              <div className="mt-1 text-xs font-semibold text-[#3e3934]">
                {paymentStatus || "—"}
              </div>
            </div>

            <div className="rounded-xl bg-[#f7f3ed] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">
                City
              </div>

              <div className="mt-1 truncate text-xs font-semibold text-[#3e3934]">
                {city || "—"}
              </div>
            </div>
          </div>
        </section>

        
        {contextBooking?.id && (
          <section className="rounded-[22px] border border-black/5 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
              Payment / Contract
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#f7f3ed] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">
                  Total
                </div>
                <div className="mt-1 text-sm font-semibold text-[#2d2925]">
                  {bookingTotal !== null &&
                  bookingTotal !== undefined
                    ? `$${Number(bookingTotal).toLocaleString("en-US")}`
                    : "—"}
                </div>
              </div>

              <div className="rounded-xl bg-[#edf6ef] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#718876]">
                  Paid
                </div>
                <div className="mt-1 text-sm font-semibold text-[#355b3e]">
                  {amountPaid !== null &&
                  amountPaid !== undefined
                    ? `$${Number(amountPaid).toLocaleString("en-US")}`
                    : "—"}
                </div>
              </div>

              <div className="rounded-xl bg-[#fff0d5] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#9b761f]">
                  Balance
                </div>
                <div className="mt-1 text-sm font-semibold text-[#8a5a00]">
                  {balanceDue !== null &&
                  balanceDue !== undefined
                    ? `$${Number(balanceDue).toLocaleString("en-US")}`
                    : "—"}
                </div>
              </div>

              <div className="rounded-xl bg-[#f7f3ed] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">
                  Deposit
                </div>
                <div className="mt-1 text-sm font-semibold text-[#2d2925]">
                  {deposit !== null &&
                  deposit !== undefined
                    ? `$${Number(deposit).toLocaleString("en-US")}`
                    : "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10px] font-bold uppercase text-[#315ea8]">
                Payment {normalizedPaymentStatus || "—"}
              </span>

              <span className="rounded-full bg-[#f4ede2] px-2.5 py-1 text-[10px] font-bold uppercase text-[#745934]">
                Contract {normalizedContractStatus || "—"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href={`/admin/bookings/${contextBooking.id}`}
                className="rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28]"
              >
                Open Booking
              </Link>

              <Link
                href="/admin/settings"
                className="rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28]"
              >
                Payments / Contracts
              </Link>
            </div>
          </section>
          )}
        {contextBooking?.id && (
          <section className="rounded-[22px] border border-black/5 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
              Payment actions
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href={`/admin/bookings/${contextBooking.id}`}
                className="rounded-full bg-[#23313f] px-3 py-2.5 text-center text-xs font-semibold text-white"
              >
                Take payment
              </Link>

              <form action={resendContractAction}>
                <input
                  type="hidden"
                  name="bookingId"
                  value={contextBooking.id}
                />
                <button
                  type="submit"
                  className="min-h-[38px] w-full rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-xs font-semibold text-[#2b2a28]"
                >
                  Resend contract
                </button>
              </form>
            </div>

            <div className="mt-2 text-[10px] leading-4 text-[#8b8177]">
              Payment opens the existing Booking POS. Contract resend uses the existing booking action.
            </div>
          </section>
        )}

{previousBookings.length > 0 && (
          <section className="rounded-[22px] border border-black/5 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Previous events
              </div>
              <div className="text-[11px] font-semibold text-[#8b8177]">
                {bookingCount} total
              </div>
            </div>

            <div className="mt-3 divide-y divide-[#eee7de]">
              {previousBookings.map((item: any) => (
                <Link
                  key={String(item.id)}
                  href={`/admin/bookings/${item.id}`}
                  className="block py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#2d2925]">
                        {item.booking_number || "Booking"}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[#847a71]">
                        {item.event_date || "No date"}
                        {item.setup_city ? ` / ${item.setup_city}` : ""}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-xs font-semibold text-[#2d2925]">
                        {item.total_amount !== null &&
                        item.total_amount !== undefined
                          ? `$${Number(item.total_amount).toLocaleString("en-US")}`
                          : "—"}
                      </div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-[0.05em] text-[#9a9188]">
                        {String(item.status || "").replaceAll("_", " ") || "booking"}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}



        {selectedLead?.id && (
          <section className="rounded-[22px] border border-black/5 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Lead notes
              </div>
              <div className="text-[10px] text-[#9a9188]">
                Internal
              </div>
            </div>

            <form
              action={updateLeadNotesAction}
              className="mt-3"
            >
              <input
                type="hidden"
                name="leadId"
                value={selectedLead.id}
              />

              <textarea
                name="notes"
                defaultValue={leadNotes}
                rows={4}
                placeholder="Add notes about this customer or event..."
                className="w-full resize-y rounded-2xl border border-[#ded7cd] bg-[#faf8f5] px-3 py-2.5 text-sm leading-6 text-[#3f3934] outline-none transition focus:border-[#c9964f]"
              />

              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#192833]"
                >
                  Save notes
                </button>
              </div>
            </form>
          </section>
        )}

        {(normalizedPhone ||
          normalizedEmail ||
          normalizedInstagram) && (
          <section className="rounded-[22px] border border-black/5 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
              Quick contact
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {normalizedPhone && (
                <a
                  href={`tel:${normalizedPhone}`}
                  className="rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28]"
                >
                  Call
                </a>
              )}

              {normalizedPhone && (
                <a
                  href={`sms:${normalizedPhone}`}
                  className="rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28]"
                >
                  SMS
                </a>
              )}

              {normalizedEmail && (
                <a
                  href={`mailto:${normalizedEmail}`}
                  className="rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28]"
                >
                  Email
                </a>
              )}

              {normalizedInstagram && (
                <a
                  href={`https://www.instagram.com/${normalizedInstagram}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28]"
                >
                  Instagram
                </a>
              )}
            </div>
          </section>
        )}


        {selectedLead?.id && (
          <section className="rounded-[22px] border border-black/5 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Pipeline
              </div>

              <div className="rounded-full bg-[#f4ede2] px-2.5 py-1 text-[10px] font-bold uppercase text-[#745934]">
                {String(
                  selectedLead.status || "new",
                ).replaceAll("_", " ")}
              </div>
            </div>

            <form
              action={updateLeadStatusAction}
              className="mt-3 space-y-2.5"
            >
              <input
                type="hidden"
                name="leadId"
                value={selectedLead.id}
              />

              <select
                name="status"
                defaultValue={
                  selectedLead.status || "new"
                }
                className="min-h-[42px] w-full rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-sm font-semibold text-[#3f3934] outline-none focus:border-[#c9964f]"
              >
                <option value="new">New</option>
                <option value="quote_sent">Quote sent</option>
                <option value="follow_up">Follow-up</option>
                <option value="deposit_pending">Deposit pending</option>
                <option value="booked">Booked</option>
                <option value="lost">Lost</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <input
                name="reason"
                placeholder="Reason / note (optional)"
                className="min-h-[42px] w-full rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-xs text-[#4c4540] outline-none focus:border-[#c9964f]"
              />

              <button
                type="submit"
                className="min-h-[42px] w-full rounded-full bg-[#23313f] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#192833]"
              >
                Update stage
              </button>
            </form>
          </section>
          )}
        
        <section className="rounded-[22px] border border-black/5 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
              Communication summary
            </div>

            <span
              className={[
                "rounded-full px-2.5 py-1 text-[10px] font-bold",
                needsReply
                  ? "bg-[#fff0d5] text-[#9b6100]"
                  : "bg-[#edf6ef] text-[#477253]",
              ].join(" ")}
            >
              {needsReply
                ? "NEEDS REPLY"
                : "UP TO DATE"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#f7f3ed] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">
                Channel
              </div>
              <div className="mt-1 truncate text-xs font-semibold capitalize text-[#2d2925]">
                {communicationChannel}
              </div>
            </div>

            <div className="rounded-xl bg-[#f7f3ed] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">
                Unread
              </div>
              <div className="mt-1 text-xs font-semibold text-[#2d2925]">
                {unreadCount}
              </div>
            </div>

            <div className="rounded-xl bg-[#f7f3ed] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">
                Last inbound
              </div>
              <div className="mt-1 text-xs font-semibold text-[#2d2925]">
                {formatCommunicationTime(lastInboundAt)}
              </div>
            </div>

            <div className="rounded-xl bg-[#f7f3ed] px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#9a9188]">
                Last outbound
              </div>
              <div className="mt-1 text-xs font-semibold text-[#2d2925]">
                {formatCommunicationTime(lastOutboundAt)}
              </div>
            </div>
          </div>

          {lastContactedAt && (
            <div className="mt-2 rounded-xl bg-[#eef4ff] px-3 py-2 text-xs text-[#315ea8]">
              Last contacted{" "}
              <span className="font-semibold">
                {formatCommunicationTime(lastContactedAt)}
              </span>
            </div>
          )}
        </section>

{pipelineHistory.length > 0 && (
          <section className="rounded-[22px] border border-black/5 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Pipeline history
              </div>
              {selectedLead?.id && (
                <Link
                  href={`/admin/crm/events/${selectedLead.id}`}
                  className="text-[10px] font-semibold text-[#6f665e] underline underline-offset-2"
                >
                  Full timeline
                </Link>
              )}
            </div>

            <div className="mt-3 space-y-3">
              {pipelineHistory.slice(0, 5).map((item: any) => (
                <div key={String(item.id)} className="relative pl-5">
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[#c9964f]" />
                  <div className="text-xs font-semibold text-[#2d2925]">
                    {String(item.from_status || "new").replaceAll("_", " ")}
                    {" → "}
                    {String(item.to_status || "").replaceAll("_", " ")}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#8b8177]">
                    {item.changed_at
                      ? new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(item.changed_at))
                      : ""}
                  </div>
                  {item.reason && (
                    <div className="mt-1 text-xs leading-5 text-[#766d65]">
                      {item.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {selectedLead?.id && (
          <section className="rounded-[22px] border border-black/5 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Follow-up
              </div>

              {selectedLead?.next_follow_up_at && (
                <div className="text-[10px] font-semibold text-[#8b8177]">
                  Scheduled
                </div>
              )}
            </div>

            <form
              action={updateLeadFollowUpAction}
              className="mt-3"
            >
              <input
                type="hidden"
                name="leadId"
                value={selectedLead.id}
              />

              <input
                type="date"
                name="followUpDate"
                defaultValue={
                  selectedLead?.next_follow_up_at
                    ? String(
                        selectedLead.next_follow_up_at,
                      ).slice(0, 10)
                    : ""
                }
                className="min-h-[42px] w-full rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-sm text-[#3f3934] outline-none focus:border-[#c9964f]"
              />

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="submit"
                  className="rounded-full bg-[#23313f] px-3 py-2.5 text-xs font-semibold text-white"
                >
                  Save date
                </button>

                <button
                  type="submit"
                  name="followUpDate"
                  value=""
                  className="rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-xs font-semibold text-[#2b2a28]"
                >
                  Clear
                </button>
              </div>
            </form>
          </section>
        )}


        {openTasks.length > 0 && (
          <section className="rounded-[22px] border border-black/5 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Open tasks
              </div>
              <div className="rounded-full bg-[#fff0d5] px-2.5 py-1 text-[10px] font-bold text-[#925c00]">
                {openTasks.length}
              </div>
            </div>

            <div className="mt-3 divide-y divide-[#eee7de]">
              {openTasks.slice(0, 5).map((task: any) => (
                <div key={String(task.id)} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[#2d2925]">
                        {task.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-[#8b8177]">
                        <span className="rounded-full bg-[#f4f0ea] px-2 py-0.5">
                          {String(task.task_type || "follow_up").replaceAll("_", " ")}
                        </span>
                        {task.due_at && (
                          <span>
                            {new Intl.DateTimeFormat("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(task.due_at))}
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-[#766d65]">
                          {task.description}
                        </div>
                      )}
                    </div>
                    <form action={completeTaskAction} className="shrink-0">
                      <input type="hidden" name="taskId" value={task.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-[#d8cec0] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#477253] transition hover:bg-[#edf6ef]"
                      >
                        Complete
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>

            {openTasks.length > 5 && (
              <Link
                href="/admin/tasks"
                className="mt-3 block text-center text-[11px] font-semibold text-[#6f665e] underline underline-offset-2"
              >
                View all {openTasks.length} tasks
              </Link>
            )}
          </section>
        )}

        {selectedLead?.id && (
          <section className="rounded-[22px] border border-black/5 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Create task
              </div>
              <Link
                href="/admin/tasks"
                className="text-[10px] font-semibold text-[#6f665e] underline underline-offset-2"
              >
                All tasks
              </Link>
            </div>

            <form
              action={createTaskAction}
              className="mt-3 space-y-2.5"
            >
              <input
                type="hidden"
                name="customerId"
                value={contextCustomer?.id || ""}
              />

              <input
                type="hidden"
                name="bookingId"
                value={contextBooking?.id || ""}
              />

              <input
                name="title"
                required
                placeholder="Follow up about deposit"
                className="min-h-[42px] w-full rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-sm text-[#3f3934] outline-none focus:border-[#c9964f]"
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  name="taskType"
                  defaultValue="follow_up"
                  className="min-h-[42px] rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-xs font-semibold text-[#4c4540] outline-none focus:border-[#c9964f]"
                >
                  <option value="follow_up">Follow-up</option>
                  <option value="deposit">Deposit</option>
                  <option value="contract">Contract</option>
                  <option value="coi">COI / Insurance</option>
                  <option value="route">Route</option>
                  <option value="inventory">Inventory</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="review">Review request</option>
                </select>

                <input
                  type="date"
                  name="dueDate"
                  defaultValue={
                    selectedLead?.next_follow_up_at
                      ? String(
                          selectedLead.next_follow_up_at,
                        ).slice(0, 10)
                      : ""
                  }
                  className="min-h-[42px] min-w-0 rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-xs text-[#4c4540] outline-none focus:border-[#c9964f]"
                />
              </div>

              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                <input
                  type="time"
                  name="dueTime"
                  defaultValue="09:00"
                  className="min-h-[42px] min-w-0 rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-xs text-[#4c4540] outline-none focus:border-[#c9964f]"
                />

                <input
                  name="description"
                  placeholder="Notes for the team..."
                  className="min-h-[42px] min-w-0 rounded-full border border-[#ded7cd] bg-[#faf8f5] px-3 text-xs text-[#4c4540] outline-none focus:border-[#c9964f]"
                />
              </div>

              <button
                type="submit"
                className="min-h-[42px] w-full rounded-full bg-[#c9964f] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#b78744]"
              >
                Add task
              </button>
            </form>
          </section>
        )}

        <div className="grid gap-2">
          {selectedLead?.id && (
            <Link
              href={`/admin/crm/events/${selectedLead.id}`}
              className="rounded-full bg-[#23313f] px-3 py-2.5 text-center text-xs font-semibold text-white"
            >
              Open Event Center
            </Link>
          )}

          {contextCustomer?.id && (
            <Link
              href={`/admin/customers/${contextCustomer.id}`}
              className="rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28]"
            >
              Open Customer
            </Link>
          )}

          {contextBooking?.id && (
            <Link
              href={`/admin/bookings/${contextBooking.id}`}
              className="rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28]"
            >
              Open Booking
            </Link>
          )}

          {!contextBooking?.id && (
            <Link
              href={selectedLead?.id ? `/admin/bookings/new?leadId=${selectedLead.id}` : "/admin/bookings/new"}
              className="rounded-full bg-[#c9964f] px-3 py-2.5 text-center text-xs font-semibold text-white"
            >
              Create Booking
            </Link>
          )}

          {contextCustomer?.id && (
            <Link
              href={`/admin/tasks?customerId=${contextCustomer.id}`}
              className="rounded-full border border-[#d8cec0] bg-white px-3 py-2.5 text-center text-xs font-semibold text-[#2b2a28]"
            >
              Create Task
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
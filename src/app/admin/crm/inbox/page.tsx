import Link from "next/link";

import ActionButton from "@/components/ui/ActionButton";
import {
  createCrmAttachmentSignedUrls,
  parseCrmAttachments,
  } from "@/lib/communication/attachments";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getCrmGmailConfiguration } from "@/lib/crm/gmail";
import { getResolvedMetaIntegration } from "@/lib/crm/instagram";
import { resendUpdatedContractManualAction } from "@/app/admin/bookings/[id]/actions";
import { createTaskAction,
  completeTaskAction } from "@/app/admin/tasks/actions";

import CrmReplyForm from "./[conversationId]/CrmReplyForm";
import MarkConversationRead from "./MarkConversationRead";
import CrmCustomerContext from "./CrmCustomerContext";
import CrmMobileInbox from "./CrmMobileInbox";

import {
  replyToCrmConversationAction,
  setCrmConversationClosedAction,
  simulateCrmInstagramInboundAction,
  syncCrmEmailInboxAction,
  updateCrmLeadNotesAction,
  updateCrmLeadFollowUpAction,
  updateCrmLeadStatusAction,
} from "./actions";

type SearchParams = Promise<{
  status?: string;
  q?: string;
  conversation?: string;
}>;

function formatConversationTime(
  value: string | null | undefined,
) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMessageTime(
  value: string | null | undefined,
) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function channelLabel(
  channel: string | null | undefined,
) {
  const normalized = String(channel || "")
    .trim()
    .toLowerCase();

  if (normalized === "instagram") return "INSTAGRAM";
  if (normalized === "sms") return "SMS";
  if (normalized === "email") return "EMAIL";
  if (normalized === "whatsapp") return "WHATSAPP";

  return normalized
    ? normalized.toUpperCase()
    : "CRM";
}

function leadStatusLabel(
  status: string | null | undefined,
) {
  const value = String(status || "")
    .trim()
    .replaceAll("_", " ");

  return value
    ? value.toUpperCase()
    : "";
}

function normalizeSearchValue(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function conversationPersonName(params: {
  conversation: any;
  lead: any;
  customer: any;
}) {
  const {
    conversation,
    lead,
    customer,
  } = params;

  const customerName = customer
    ? [
        customer.first_name,
        customer.last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .trim()
    : "";

  return (
    customerName ||
    String(customer?.full_name || "").trim() ||
    String(lead?.customer_name || "").trim() ||
    String(conversation.subject || "").trim() ||
    "CRM contact"
  );
}

function conversationSubtitle(params: {
  conversation: any;
  lead: any;
  customer: any;
}) {
  const {
    conversation,
    lead,
    customer,
  } = params;

  const instagramUsername = String(
    lead?.instagram_username || "",
  ).trim();

  if (instagramUsername) {
    return `@${instagramUsername.replace(/^@+/, "")}`;
  }

  return (
    String(customer?.email || "").trim() ||
    String(lead?.customer_email || "").trim() ||
    String(customer?.phone || "").trim() ||
    String(lead?.customer_phone || "").trim() ||
    channelLabel(conversation.last_channel)
  );
}

function buildInboxHref(params: {
  status?: string;
  q?: string;
  conversation?: string;
}) {
  const query = new URLSearchParams();

  if (
    params.status &&
    params.status !== "all"
  ) {
    query.set("status", params.status);
  }

  if (params.q) {
    query.set("q", params.q);
  }

  if (params.conversation) {
    query.set(
      "conversation",
      params.conversation,
    );
  }

  const serialized = query.toString();

  return serialized
    ? `/admin/crm/inbox?${serialized}`
    : "/admin/crm/inbox";
}

export default async function CrmInboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { supabase } =
    await requireAdminPermission(
      "customers.view",
    );

  const params = await searchParams;

  const activeFilter = String(
    params.status || "all",
  )
    .trim()
    .toLowerCase();

  const searchQuery = String(
    params.q || "",
  ).trim();

  const selectedConversationId = String(
    params.conversation || "",
  ).trim();

  const gmail =
    getCrmGmailConfiguration();

  const instagram =
    await getResolvedMetaIntegration();

  let query = supabase
    .from("crm_conversations")
    .select(`
      id,
      subject,
      status,
      priority,
      needs_reply,
      unread_count,
      last_read_at,
      last_channel,
      last_message_at,
      last_inbound_at,
      last_outbound_at,
      lead_id,
      customer_id,
      booking_id,
      created_at
    `)
    .order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    })
    .order("created_at", {
      ascending: false,
    });

  if (activeFilter === "needs_reply") {
    query = query.eq(
      "needs_reply",
      true,
    );
  }

  if (activeFilter === "unread") {
    query = query.gt(
      "unread_count",
      0,
    );
  }

  if (activeFilter === "open") {
    query = query.eq(
      "status",
      "open",
    );
  }

  if (activeFilter === "closed") {
    query = query.eq(
      "status",
      "closed",
    );
  }

  const conversationsResult =
    await query.limit(250);

  if (conversationsResult.error) {
    throw new Error(
      conversationsResult.error.message,
    );
  }

  let conversations =
    conversationsResult.data || [];

  const leadIds = Array.from(
    new Set(
      conversations
        .map((row: any) =>
          String(row.lead_id || "").trim(),
        )
        .filter(Boolean),
    ),
  );

  const customerIds = Array.from(
    new Set(
      conversations
        .map((row: any) =>
          String(
            row.customer_id || "",
          ).trim(),
        )
        .filter(Boolean),
    ),
  );

  const conversationIds =
    conversations.map(
      (row: any) =>
        String(row.id),
    );

  const leadsById =
    new Map<string, any>();

  const customersById =
    new Map<string, any>();

  const lastMessageByConversation =
    new Map<string, any>();

  if (leadIds.length > 0) {
    const result = await supabase
      .from("booking_leads")
      .select(`
        id,
        customer_name,
        customer_email,
        customer_phone,
        instagram_username,
        event_date,
        event_city,
        status,
        requested_product,
        next_follow_up_at,
        notes
      `)
      .in("id", leadIds);

    if (result.error) {
      throw new Error(
        result.error.message,
      );
    }

    for (
      const lead of
      result.data || []
    ) {
      leadsById.set(
        String(lead.id),
        lead,
      );
    }
  }

  if (customerIds.length > 0) {
    const result = await supabase
      .from("customers")
      .select(`
        id,
        first_name,
        last_name,
        full_name,
        email,
        phone
      `)
      .in("id", customerIds);

    if (result.error) {
      throw new Error(
        result.error.message,
      );
    }

    for (
      const customer of
      result.data || []
    ) {
      customersById.set(
        String(customer.id),
        customer,
      );
    }
  }

  if (conversationIds.length > 0) {
    const result = await supabase
      .from("crm_messages")
      .select(`
        id,
        conversation_id,
        direction,
        channel,
        body_text,
        sent_at,
        created_at
      `)
      .in(
        "conversation_id",
        conversationIds,
      )
      .order("sent_at", {
        ascending: false,
        nullsFirst: false,
      })
      .order("created_at", {
        ascending: false,
      })
      .limit(1500);

    if (result.error) {
      throw new Error(
        result.error.message,
      );
    }

    for (
      const message of
      result.data || []
    ) {
      const key = String(
        message.conversation_id || "",
      );

      if (
        key &&
        !lastMessageByConversation.has(
          key,
        )
      ) {
        lastMessageByConversation.set(
          key,
          message,
        );
      }
    }
  }

  if (searchQuery) {
    const wanted =
      normalizeSearchValue(
        searchQuery,
      );

    conversations =
      conversations.filter(
        (conversation: any) => {
          const lead =
            conversation.lead_id
              ? leadsById.get(
                  String(
                    conversation.lead_id,
                  ),
                )
              : null;

          const customer =
            conversation.customer_id
              ? customersById.get(
                  String(
                    conversation.customer_id,
                  ),
                )
              : null;

          const lastMessage =
            lastMessageByConversation.get(
              String(
                conversation.id,
              ),
            );

          const haystack = [
            conversation.subject,
            conversation.last_channel,
            customer?.first_name,
            customer?.last_name,
            customer?.full_name,
            customer?.email,
            customer?.phone,
            lead?.customer_name,
            lead?.customer_email,
            lead?.customer_phone,
            lead?.instagram_username,
            lead?.status,
            lead?.requested_product,
            lastMessage?.body_text,
          ]
            .map(
              normalizeSearchValue,
            )
            .join(" ");

          return haystack.includes(
            wanted,
          );
        },
      );
  }

  let selectedConversation: any =
    null;

  let selectedLead: any = null;
  let selectedCustomer: any = null;
  let selectedMessages: any[] = [];

  if (selectedConversationId) {
    selectedConversation =
      conversationsResult.data?.find(
        (row: any) =>
          String(row.id) ===
          selectedConversationId,
      ) || null;

    if (!selectedConversation) {
      const result = await supabase
        .from("crm_conversations")
        .select(`
          id,
          subject,
          status,
          priority,
          needs_reply,
          unread_count,
          last_read_at,
          last_channel,
          last_message_at,
          last_inbound_at,
          last_outbound_at,
          lead_id,
          customer_id,
          booking_id,
          created_at
        `)
        .eq(
          "id",
          selectedConversationId,
        )
        .maybeSingle();

      if (result.error) {
        throw new Error(
          result.error.message,
        );
      }

      selectedConversation =
        result.data;
    }
  }

  if (selectedConversation) {
    if (
      selectedConversation.lead_id
    ) {
      selectedLead =
        leadsById.get(
          String(
            selectedConversation.lead_id,
          ),
        ) || null;

      if (!selectedLead) {
        const result =
          await supabase
            .from("booking_leads")
            .select(`
              id,
              customer_name,
              customer_email,
              customer_phone,
              instagram_username,
              event_date,
              event_city,
              status,
              requested_product,
              next_follow_up_at,
              notes
            `)
            .eq(
              "id",
              selectedConversation.lead_id,
            )
            .maybeSingle();

        if (result.error) {
          throw new Error(
            result.error.message,
          );
        }

        selectedLead =
          result.data;
      }
    }
    if (
      selectedConversation.customer_id
    ) {
      selectedCustomer =
        customersById.get(
          String(
            selectedConversation.customer_id,
          ),
        ) || null;

      if (!selectedCustomer) {
        const result =
          await supabase
            .from("customers")
            .select(`
              id,
              first_name,
              last_name,
              full_name,
              email,
              phone
            `)
            .eq(
              "id",
              selectedConversation.customer_id,
            )
            .maybeSingle();

        if (result.error) {
          throw new Error(
            result.error.message,
          );
        }

        selectedCustomer =
          result.data;
      }
    }

    const messagesResult =
      await supabase
        .from("crm_messages")
        .select(`
          id,
          direction,
          channel,
          sender_identity,
          recipient_identity,
          body_text,
          status,
          sent_at,
          delivered_at,
          failed_at,
          created_at,
          metadata
        `)
        .eq(
          "conversation_id",
          selectedConversation.id,
        )
        .order("sent_at", {
          ascending: true,
          nullsFirst: false,
        })
        .order("created_at", {
          ascending: true,
        });

    if (messagesResult.error) {
      throw new Error(
        messagesResult.error.message,
      );
    }

    selectedMessages =
      await Promise.all(
        (
          messagesResult.data ||
          []
        ).map(
          async (
            message: any,
          ) => {
            const metadata =
              message.metadata &&
              typeof message.metadata ===
                "object"
                ? (
                    message.metadata as Record<
                      string,
                      unknown
                    >
                  )
                : {};

            const attachments =
              parseCrmAttachments(
                (
                  metadata as any
                ).attachments,
              );

            let resolvedAttachments:
              any[] = [];

            if (
              attachments.length > 0
            ) {
              try {
                resolvedAttachments =
                  await createCrmAttachmentSignedUrls(
                    {
                      conversationId:
                        selectedConversation.id,

                      attachments,

                      expiresInSeconds:
                        60 * 60,
                    },
                  );
              } catch {
                resolvedAttachments =
                  attachments.map(
                    (item) => ({
                      ...item,
                      url: "",
                    }),
                  );
              }
            }

            return {
              ...message,
              resolvedAttachments,
            };
          },
        ),
      );
  }

  const contextCustomerResult =
    selectedConversation?.customer_id
      ? await supabase
          .from("customers")
          .select(
            "id, full_name, first_name, last_name, phone, email, bookings(id, booking_number, event_date, total_amount, balance_due, deposit_amount, status, payment_status, contract_status, setup_city)",
          )
          .eq(
            "id",
            selectedConversation.customer_id,
          )
          .maybeSingle()
      : null;

  if (contextCustomerResult?.error) {
    throw new Error(
      contextCustomerResult.error.message,
    );
  }

  const contextBookingResult =
    selectedConversation?.booking_id
      ? await supabase
          .from("bookings")
          .select(
            "id, booking_number, event_date, setup_city, total_amount, amount_paid, balance_due, deposit_amount, payment_status, contract_status, status",
          )
          .eq(
            "id",
            selectedConversation.booking_id,
          )
          .maybeSingle()
      : null;

  if (contextBookingResult?.error) {
    throw new Error(
      contextBookingResult.error.message,
    );
  }

  const contextCustomer =
    contextCustomerResult?.data ||
    selectedCustomer;

  const contextBooking =
    contextBookingResult?.data ||
    null;

  let crmPipelineHistory: any[] = [];

  if (selectedLead?.id) {
    const pipelineResult = await supabase
      .from("crm_pipeline_history")
      .select(`
        id,
        from_status,
        to_status,
        reason,
        changed_at,
        metadata
      `)
      .eq("lead_id", selectedLead.id)
      .order("changed_at", { ascending: false })
      .limit(20);

    if (pipelineResult.error) {
      throw new Error(pipelineResult.error.message);
    }

    crmPipelineHistory = pipelineResult.data || [];
  }

  let crmOpenTasks: any[] = [];

  if (contextCustomer?.id) {
    const tasksResult = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        task_type,
        due_at,
        status,
        booking_id,
        customer_id,
        created_at
      `)
      .eq("customer_id", contextCustomer.id)
      .neq("status", "completed")
      .order("due_at", {
        ascending: true,
        nullsFirst: false,
      })
      .limit(20);

    if (tasksResult.error) {
      throw new Error(tasksResult.error.message);
    }

    crmOpenTasks = tasksResult.data || [];
  } else if (contextBooking?.id) {
    const tasksResult = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        task_type,
        due_at,
        status,
        booking_id,
        customer_id,
        created_at
      `)
      .eq("booking_id", contextBooking.id)
      .neq("status", "completed")
      .order("due_at", {
        ascending: true,
        nullsFirst: false,
      })
      .limit(20);

    if (tasksResult.error) {
      throw new Error(tasksResult.error.message);
    }

    crmOpenTasks = tasksResult.data || [];
  }

  const mobileLeadsById = Object.fromEntries(
    Array.from(leadsById.entries()),
  );

  const mobileCustomersById = Object.fromEntries(
    Array.from(customersById.entries()),
  );

  const mobileLastMessagesById = Object.fromEntries(
    Array.from(lastMessageByConversation.entries()),
  );

  const latestInbound =
    [...selectedMessages]
      .reverse()
      .find(
        (item: any) =>
          item.direction ===
            "inbound" &&
          [
            "sms",
            "email",
            "instagram",
              "whatsapp",
          ].includes(
            String(
              item.channel || "",
            )
              .trim()
              .toLowerCase(),
          ),
      );

  const replyChannel =
    String(
      latestInbound?.channel ||
        selectedConversation?.last_channel ||
        "",
    )
      .trim()
      .toLowerCase();

  const canReply = [
    "sms",
    "email",
    "instagram",
    "whatsapp",
  ].includes(
    replyChannel,
  );

  const unreadTotal =
    conversations.reduce(
      (
        sum: number,
        row: any,
      ) =>
        sum +
        Math.max(
          0,
          Number(
            row.unread_count || 0,
          ),
        ),
      0,
    );

  return (
    <div className="space-y-4">
      <section
  className={[
    "rounded-[28px] border border-[#e7dfd4] bg-white p-5 shadow-sm",
    selectedConversation ? "hidden lg:block" : "",
  ].join(" ")}
>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
              CRM
            </div>

            <h1 className="mt-1 text-3xl font-semibold text-[#191919]">
              Inbox
            </h1>

            <p className="mt-1 text-sm text-[#68635d]">
              Email, SMS and Instagram in one workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {unreadTotal > 0 && (
              <div className="rounded-full bg-[#23313f] px-3 py-2 text-xs font-bold text-white">
                {unreadTotal} unread
              </div>
            )}

            <Link
              href="/admin/crm"
              className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-[#d8d1c7] bg-white px-4 py-2 text-sm font-semibold text-[#243442] transition hover:bg-[#f8f4ee]"
            >
              CRM overview
            </Link>
          </div>
        </div>

        {!gmail.configured && (
          <div className="mt-4 rounded-2xl bg-[#f8f3ec] px-4 py-2.5 text-xs text-[#6f6255]">
            Gmail CRM adapter is not configured yet. Email can stay disconnected while SMS/Instagram are tested.
          </div>
        )}

        {gmail.configured && (
          <form
            action={
              syncCrmEmailInboxAction
            }
            className="mt-4"
          >
            <ActionButton
              pendingText="Syncing email…"
              variant="secondary"
            >
              Sync email now
            </ActionButton>
          </form>
        )}
      </section>

      {instagram.simulatorEnabled && (
        <details
  className={[
    "rounded-[22px] border border-dashed border-[#dfd4c5] bg-[#fffdf9]",
    selectedConversation ? "hidden lg:block" : "",
  ].join(" ")}
>
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
            Local Instagram simulator
          </summary>

          <form
            action={
              simulateCrmInstagramInboundAction
            }
            className="grid gap-3 border-t border-[#eee5da] p-4 lg:grid-cols-[0.8fr_0.8fr_1.6fr_auto]"
          >
            <input
              name="senderId"
              placeholder="Sender ID (optional)"
              className="min-h-[42px] rounded-full border border-[#ddd5cb] bg-white px-4 text-sm outline-none focus:border-[#243442]"
            />

            <input
              name="username"
              placeholder="username"
              required
              className="min-h-[42px] rounded-full border border-[#ddd5cb] bg-white px-4 text-sm outline-none focus:border-[#243442]"
            />

            <input
              name="body"
              placeholder="Instagram test message"
              required
              className="min-h-[42px] rounded-full border border-[#ddd5cb] bg-white px-4 text-sm outline-none focus:border-[#243442]"
            />

            <ActionButton pendingText="Sending DM…">
              Simulate DM
            </ActionButton>
          </form>
        </details>
      )}

      <section className="hidden overflow-hidden rounded-[28px] border border-[#ded7cd] bg-white shadow-[0_10px_35px_rgba(0,0,0,0.035)] lg:block">
        <div className="grid h-[clamp(620px,72vh,840px)] min-h-0 xl:grid-cols-[360px_minmax(0,1fr)_330px]">
          <aside className="flex min-h-0 flex-col border-b border-[#e7dfd4] bg-[#faf8f5] xl:border-b-0 xl:border-r">
            <div className="shrink-0 border-b border-[#e7dfd4] bg-white p-3">
              <form
                action="/admin/crm/inbox"
                method="GET"
                className="flex gap-2"
              >
                {activeFilter !==
                  "all" && (
                  <input
                    type="hidden"
                    name="status"
                    value={
                      activeFilter
                    }
                  />
                )}

                <input
                  name="q"
                  defaultValue={
                    searchQuery
                  }
                  placeholder="Search conversations"
                  className="min-h-[42px] min-w-0 flex-1 rounded-full border border-[#ddd5cb] bg-[#faf9f7] px-4 text-sm outline-none focus:border-[#243442]"
                />

                <button
                  type="submit"
                  className="min-h-[42px] rounded-full bg-[#23313f] px-4 text-sm font-semibold text-white"
                >
                  Search
                </button>
              </form>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {[
                  ["all", "All"],
                  [
                    "unread",
                    "Unread",
                  ],
                  [
                    "needs_reply",
                    "Needs reply",
                  ],
                  ["open", "Open"],
                  [
                    "closed",
                    "Closed",
                  ],
                ].map(
                  ([
                    value,
                    label,
                  ]) => {
                    const active =
                      activeFilter ===
                        value ||
                      (
                        value ===
                          "all" &&
                        ![
                          "unread",
                          "needs_reply",
                          "open",
                          "closed",
                        ].includes(
                          activeFilter,
                        )
                      );

                    return (
                      <Link
                        key={
                          value
                        }
                        href={buildInboxHref(
                          {
                            status:
                              value,
                            q:
                              searchQuery,
                          },
                        )}
                        className={[
                          "whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition",
                          active
                            ? "border-[#23313f] bg-[#23313f] text-white"
                            : "border-[#ddd5cb] bg-white text-[#554f48] hover:bg-[#f4f0ea]",
                        ].join(
                          " ",
                        )}
                      >
                        {label}
                      </Link>
                    );
                  },
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {conversations.length ===
              0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="font-semibold text-[#292725]">
                    No conversations
                  </div>

                  <div className="mt-2 text-xs leading-5 text-[#8b8177]">
                    Try another filter or search.
                  </div>
                </div>
              ) : (
                conversations.map(
                  (
                    conversation: any,
                  ) => {
                    const lead =
                      conversation.lead_id
                        ? leadsById.get(
                            String(
                              conversation.lead_id,
                            ),
                          )
                        : null;

                    const customer =
                      conversation.customer_id
                        ? customersById.get(
                            String(
                              conversation.customer_id,
                            ),
                          )
                        : null;

                    const lastMessage =
                      lastMessageByConversation.get(
                        String(
                          conversation.id,
                        ),
                      );

                    const unread =
                      Math.max(
                        0,
                        Number(
                          conversation.unread_count ||
                            0,
                        ),
                      );

                    const selected =
                      selectedConversationId ===
                      String(
                        conversation.id,
                      );

                    const personName =
                      conversationPersonName(
                        {
                          conversation,
                          lead,
                          customer,
                        },
                      );

                    const subtitle =
                      conversationSubtitle(
                        {
                          conversation,
                          lead,
                          customer,
                        },
                      );

                    const lastText =
                      String(
                        lastMessage?.body_text ||
                          "",
                      ).trim();

                    return (
                      <Link
                        key={
                          conversation.id
                        }
                        href={buildInboxHref(
                          {
                            status:
                              activeFilter,
                            q:
                              searchQuery,
                            conversation:
                              String(
                                conversation.id,
                              ),
                          },
                        )}
                        className={[
                          "block border-b border-[#ebe4db] px-4 py-3 transition",
                          selected
                            ? "bg-[#eee9e1]"
                            : unread >
                                0
                              ? "bg-[#fff8ec] hover:bg-[#fbf1df]"
                              : "bg-white hover:bg-[#f6f3ee]",
                        ].join(
                          " ",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#23313f] text-sm font-bold text-white">
                            {personName
                              .slice(
                                0,
                                2,
                              )
                              .toUpperCase()}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div
                                className={[
                                  "truncate text-sm text-[#211f1d]",
                                  unread >
                                  0
                                    ? "font-bold"
                                    : "font-semibold",
                                ].join(
                                  " ",
                                )}
                              >
                                {
                                  personName
                                }
                              </div>

                              <div
                                className={[
                                  "shrink-0 text-[11px]",
                                  unread >
                                  0
                                    ? "font-bold text-[#9a723e]"
                                    : "text-[#91887f]",
                                ].join(
                                  " ",
                                )}
                              >
                                {formatConversationTime(
                                  conversation.last_message_at ||
                                    lastMessage?.sent_at ||
                                    lastMessage?.created_at,
                                )}
                              </div>
                            </div>

                            <div className="mt-1 flex min-w-0 items-center gap-1.5">
                              <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[9px] font-bold text-[#315ea8]">
                                {channelLabel(
                                  conversation.last_channel,
                                )}
                              </span>

                              {lead?.status && (
                                <span className="max-w-[130px] truncate rounded-full bg-[#f1ede7] px-2 py-0.5 text-[9px] font-bold text-[#70665c]">
                                  {leadStatusLabel(
                                    lead.status,
                                  )}
                                </span>
                              )}

                              {conversation.needs_reply && (
                                <span className="rounded-full bg-[#fff0d5] px-2 py-0.5 text-[9px] font-bold text-[#9b6100]">
                                  NEEDS REPLY
                                </span>
                              )}
                            </div>

                            <div className="mt-1.5 flex items-center gap-2">
                              <div
                                className={[
                                  "min-w-0 flex-1 truncate text-xs",
                                  unread >
                                  0
                                    ? "font-semibold text-[#332f2a]"
                                    : "text-[#7d746c]",
                                ].join(
                                  " ",
                                )}
                              >
                                {lastText ||
                                  subtitle}
                              </div>

                              {unread >
                                0 && (
                                <div className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#23313f] px-1.5 text-[10px] font-bold text-white">
                                  {unread >
                                  99
                                    ? "99+"
                                    : unread}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  },
                )
              )}
           </div>
</aside>

<main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#f8f5f0]">
  {!selectedConversation ? (
              <div className="flex h-full min-h-0 items-center justify-center px-8 text-center">
                <div>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl shadow-sm">
                    ✉
                  </div>

                  <h2 className="mt-5 text-xl font-semibold text-[#282522]">
                    Select a conversation
                  </h2>

                  <p className="mt-2 max-w-md text-sm leading-6 text-[#82786f]">
                    Choose a customer on the left to open the conversation without leaving the Inbox.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <MarkConversationRead
                  conversationId={
                    selectedConversation.id
                  }
                  unreadCount={Number(
                    selectedConversation.unread_count ||
                      0,
                  )}
                />
<header className="shrink-0 border-b border-[#e1d9cf] bg-white px-5 py-4">
  <div className="flex items-start justify-between gap-4">
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#23313f] text-sm font-bold text-white">
        {conversationPersonName({
          conversation: selectedConversation,
          lead: selectedLead,
          customer: selectedCustomer,
        })
          .slice(0, 2)
          .toUpperCase()}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="max-w-[320px] truncate text-lg font-bold text-[#25221f]">
            {conversationPersonName({
              conversation: selectedConversation,
              lead: selectedLead,
              customer: selectedCustomer,
            })}
          </h2>

          <span className="rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10px] font-bold text-[#315ea8]">
            {channelLabel(
              selectedConversation.last_channel,
            )}
          </span>

          {selectedLead?.status && (
            <span className="rounded-full bg-[#f1ede7] px-2.5 py-1 text-[10px] font-bold text-[#70665c]">
              {leadStatusLabel(
                selectedLead.status,
              )}
            </span>
          )}

          <span
            className={[
              "rounded-full px-2.5 py-1 text-[10px] font-bold",
              selectedConversation.status === "closed"
                ? "bg-neutral-100 text-neutral-600"
                : selectedConversation.needs_reply
                  ? "bg-[#fff0d5] text-[#9b6100]"
                  : "bg-[#edf6ef] text-[#477253]",
            ].join(" ")}
          >
            {selectedConversation.status === "closed"
              ? "CLOSED"
              : selectedConversation.needs_reply
                ? "WAITING FOR US"
                : "WAITING FOR CUSTOMER"}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#81776f]">
          <span className="truncate">
            {conversationSubtitle({
              conversation: selectedConversation,
              lead: selectedLead,
              customer: selectedCustomer,
            })}
          </span>

          {selectedLead?.event_date && (
            <span>
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(
                new Date(
                  `${selectedLead.event_date}T12:00:00`,
                ),
              )}
            </span>
          )}

          {selectedLead?.event_city && (
            <span>
              📍 {selectedLead.event_city}
            </span>
          )}

          {selectedLead?.requested_product && (
            <span className="max-w-[260px] truncate">
              {selectedLead.requested_product}
            </span>
          )}
        </div>
      </div>
    </div>

    <div className="flex shrink-0 items-center gap-2">
      <form action={setCrmConversationClosedAction}>
        <input
          type="hidden"
          name="conversationId"
          value={selectedConversation.id}
        />

        <input
          type="hidden"
          name="closed"
          value={
            selectedConversation.status === "closed"
              ? "0"
              : "1"
          }
        />

        <button
          type="submit"
          className="rounded-full bg-[#23313f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#192833]"
        >
          {selectedConversation.status === "closed"
            ? "Reopen"
            : "Close"}
        </button>
      </form>

        {selectedLead?.id && (
          <Link
            href={`/admin/crm/events/${selectedLead.id}`}
            className="rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold text-[#443d37] transition hover:bg-[#f7f3ed]"
          >
            Event Center
          </Link>
        )}

        <Link
          href={`/admin/crm/inbox/${selectedConversation.id}`}
          className="rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold text-[#443d37] transition hover:bg-[#f7f3ed]"
        >
          Full page
        </Link>
      </div>
    </div>
  </header>

 
<div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
                  <div className="mx-auto max-w-4xl space-y-3">
                    {selectedMessages.map(
                      (
                        message: any,
                      ) => {
                        const outbound =
                          message.direction ===
                          "outbound";

                        const attachments =
                          message.resolvedAttachments ||
                          [];

                        return (
                          <div
                            key={
                              message.id
                            }
                            className={`flex ${
                              outbound
                                ? "justify-end"
                                : "justify-start"
                            }`}
                          >
                            <div
                              className={[
                                "max-w-[78%] rounded-[18px] px-3.5 py-2.5 shadow-sm",
                                outbound
                                  ? "rounded-br-md bg-[#dcebd7] text-[#20251f]"
                                  : "rounded-bl-md bg-white text-[#292622]",
                              ].join(
                                " ",
                              )}
                            >
                              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#9a723e]">
                                {channelLabel(
                                  message.channel,
                                )}
                                <span>
                                  ·
                                </span>
                                <span>
                                  {outbound
                                    ? "You"
                                    : message.sender_identity ||
                                      "Customer"}
                                </span>
                              </div>

                              {message.body_text && (
                                <div className="whitespace-pre-wrap text-sm leading-5">
                                  {
                                    message.body_text
                                  }
                                </div>
                              )}

                              {attachments.length >
                                0 && (
                                <div className="mt-2 space-y-2">
                                  {attachments.map(
                                    (
                                      attachment: any,
                                      index: number,
                                    ) => {
                                      const url =
                                        String(
                                          attachment.url ||
                                            "",
                                        );

                                      if (
                                        attachment.type ===
                                          "image" &&
                                        url
                                      ) {
                                        return (
                                          <a
                                            key={`${attachment.storagePath}-${index}`}
                                            href={
                                              url
                                            }
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block"
                                          >
                                            <img
                                              src={
                                                url
                                              }
                                              alt={
                                                attachment.name ||
                                                "Attachment"
                                              }
                                              className="max-h-[340px] max-w-full rounded-xl object-cover"
                                            />
                                          </a>
                                        );
                                      }

                                      return (
                                        <a
                                          key={`${attachment.storagePath}-${index}`}
                                          href={
                                            url ||
                                            undefined
                                          }
                                          target={
                                            url
                                              ? "_blank"
                                              : undefined
                                          }
                                          rel={
                                            url
                                              ? "noreferrer"
                                              : undefined
                                          }
                                          className="block rounded-xl bg-black/5 px-3 py-2 text-xs font-semibold underline"
                                        >
                                          📎{" "}
                                          {attachment.name ||
                                            "Attachment"}
                                        </a>
                                      );
                                    },
                                  )}
                                </div>
                              )}

                              {!message.body_text &&
                                attachments.length ===
                                  0 && (
                                  <div className="text-sm text-[#7c746c]">
                                    (empty message)
                                  </div>
                                )}

                              <div className="mt-1.5 flex justify-end gap-1 text-[10px] text-[#837b73]">
                                <span>
                                  {formatMessageTime(
                                    message.sent_at ||
                                      message.created_at,
                                  )}
                                </span>

                                {outbound && (
                                  <span>
                                    ·{" "}
                                    {String(
                                      message.status ||
                                        "sent",
                                    ).replaceAll(
                                      "_",
                                      " ",
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      },
                    )}

                    {selectedMessages.length === 0 && (

                      <div className="py-20 text-center text-sm text-[#8b8177]">

                        No messages yet.

                      </div>

                    )}

                  </div>

                </div>

                <footer className="relative z-20 shrink-0 border-t border-[#e1d9cf] bg-white px-5 pb-4 pt-2 shadow-[0_-6px_18px_rgba(0,0,0,0.025)]">
  <div className="mx-auto w-full max-w-4xl">
    {selectedConversation.status !== "closed" &&
      canReply && (
        <CrmReplyForm
          conversationId={
            selectedConversation.id
          }
          replyChannel={
            replyChannel
          }
          action={
            replyToCrmConversationAction
          }
        />
      )}

    {selectedConversation.status !== "closed" &&
      !canReply && (
        <div className="my-3 rounded-2xl bg-[#f7f3ed] px-4 py-3 text-sm text-[#6c6258]">
          This conversation does not have a supported reply channel yet.
        </div>
      )}

    {selectedConversation.status === "closed" && (
      <div className="my-3 flex items-center justify-between gap-3 rounded-2xl bg-[#f7f3ed] px-4 py-3">
        <div className="text-sm text-[#6c6258]">
          Conversation is closed.
        </div>

        <form action={setCrmConversationClosedAction}>
          <input
            type="hidden"
            name="conversationId"
            value={selectedConversation.id}
          />

          <input
            type="hidden"
            name="closed"
            value="0"
          />

          <button
            type="submit"
            className="shrink-0 rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white"
          >
            Reopen
          </button>
        </form>
      </div>
    )}
  </div>
</footer>
              </div>
            )}
          </main>
           <CrmCustomerContext
            selectedConversation={selectedConversation}
            selectedLead={selectedLead}
            contextCustomer={contextCustomer}
            contextBooking={contextBooking}
          updateLeadNotesAction={updateCrmLeadNotesAction}
          updateLeadFollowUpAction={updateCrmLeadFollowUpAction}
          createTaskAction={createTaskAction}
          openTasks={crmOpenTasks}
          completeTaskAction={completeTaskAction}
          updateLeadStatusAction={updateCrmLeadStatusAction}
          pipelineHistory={crmPipelineHistory}
          resendContractAction={resendUpdatedContractManualAction}
          />
       </div>
      </section>

      <CrmMobileInbox
        conversations={conversations}
        leadsById={mobileLeadsById}
        customersById={mobileCustomersById}
        lastMessagesById={mobileLastMessagesById}
        selectedConversation={selectedConversation}
        selectedLead={selectedLead}
        selectedCustomer={selectedCustomer}
        selectedMessages={selectedMessages}
        contextCustomer={contextCustomer}
        contextBooking={contextBooking}
        activeFilter={activeFilter}
        searchQuery={searchQuery}
        selectedConversationId={selectedConversationId}
        replyChannel={replyChannel}
        canReply={canReply}
        replyAction={replyToCrmConversationAction}
        closeAction={setCrmConversationClosedAction}
      updateLeadNotesAction={updateCrmLeadNotesAction}
      updateLeadFollowUpAction={updateCrmLeadFollowUpAction}
      createTaskAction={createTaskAction}
      openTasks={crmOpenTasks}
      completeTaskAction={completeTaskAction}
      updateLeadStatusAction={updateCrmLeadStatusAction}
      pipelineHistory={crmPipelineHistory}
      resendContractAction={resendUpdatedContractManualAction}
      />
    </div>
  );
}

import CustomerShell from "@/components/account/CustomerShell";
import {
  createCrmAttachmentSignedUrls,
  parseCrmAttachments,
} from "@/lib/communication/attachments";
import { requireCustomerAccess } from "@/lib/auth/require-customer";

import CustomerMessageComposer from "./CustomerMessageComposer";
import MarkInternalConversationRead from "./MarkInternalConversationRead";
import MessagesAutoRefresh from "./MessagesAutoRefresh";
import { sendMyInternalMessageAction } from "./actions";

export const dynamic = "force-dynamic";

function isInternalMessengerRpcMissing(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();
  if (!text.includes("could not find the function public.")) {
    return false;
  }

  return (
    text.includes("get_my_internal_conversation") ||
    text.includes("get_my_internal_messages") ||
    text.includes("get_my_internal_unread_count")
  );
}

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
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function AccountMessagesPage() {
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  if (canPreviewCustomer || access.role !== "customer") {
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
          <section className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 sm:rounded-[30px] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-700">
              Messages
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] text-amber-900 sm:text-4xl">
              Internal messaging is customer-only
            </h1>
            <p className="mt-3 text-sm text-amber-800">
              This page is unavailable in preview mode.
            </p>
          </section>
        </main>
      </CustomerShell>
    );
  }

  const [conversationResult, messagesResult, unreadResult] = await Promise.all([
    supabase.rpc("get_my_internal_conversation"),
    supabase.rpc("get_my_internal_messages", {
      p_limit: 100,
      p_before: null,
    }),
    supabase.rpc("get_my_internal_unread_count"),
  ]);

  if (conversationResult.error) {
    if (isInternalMessengerRpcMissing(conversationResult.error.message)) {
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
            <section className="rounded-[22px] border border-red-200 bg-red-50 p-4 sm:rounded-[30px] sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-red-700">
                Messages
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] text-red-900 sm:text-4xl">
                Internal messaging is temporarily unavailable
              </h1>
              <p className="mt-3 text-sm text-red-800">
                Required internal messenger database functions are missing from the API schema cache.
              </p>
            </section>
          </main>
        </CustomerShell>
      );
    }

    throw new Error(conversationResult.error.message);
  }

  if (messagesResult.error) {
    if (isInternalMessengerRpcMissing(messagesResult.error.message)) {
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
            <section className="rounded-[22px] border border-red-200 bg-red-50 p-4 sm:rounded-[30px] sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-red-700">
                Messages
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] text-red-900 sm:text-4xl">
                Internal messaging is temporarily unavailable
              </h1>
              <p className="mt-3 text-sm text-red-800">
                Required internal messenger database functions are missing from the API schema cache.
              </p>
            </section>
          </main>
        </CustomerShell>
      );
    }

    throw new Error(messagesResult.error.message);
  }

  if (unreadResult.error) {
    if (isInternalMessengerRpcMissing(unreadResult.error.message)) {
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
            <section className="rounded-[22px] border border-red-200 bg-red-50 p-4 sm:rounded-[30px] sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-red-700">
                Messages
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] text-red-900 sm:text-4xl">
                Internal messaging is temporarily unavailable
              </h1>
              <p className="mt-3 text-sm text-red-800">
                Required internal messenger database functions are missing from the API schema cache.
              </p>
            </section>
          </main>
        </CustomerShell>
      );
    }

    throw new Error(unreadResult.error.message);
  }

  const conversation = Array.isArray(conversationResult.data)
    ? conversationResult.data[0] || null
    : null;

  const unreadCount = Math.max(0, Number(unreadResult.data || 0));

  const newestFirstMessages = Array.isArray(messagesResult.data)
    ? messagesResult.data
    : [];

  const chronologicalMessages = [...newestFirstMessages].reverse();

  const resolvedMessages = await Promise.all(
    chronologicalMessages.map(async (message: any) => {
      const metadata =
        message.metadata && typeof message.metadata === "object"
          ? (message.metadata as Record<string, unknown>)
          : {};

      const attachments = parseCrmAttachments((metadata as any).attachments);

      let resolvedAttachments: any[] = [];
      if (attachments.length > 0 && conversation?.id) {
        try {
          resolvedAttachments = await createCrmAttachmentSignedUrls({
            conversationId: String(conversation.id),
            attachments,
            expiresInSeconds: 60 * 20,
          });
        } catch {
          resolvedAttachments = attachments.map((item) => ({ ...item, url: "" }));
        }
      }

      return {
        ...message,
        resolvedAttachments,
      };
    }),
  );

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
      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-5 sm:py-8">
        <section className="overflow-hidden rounded-[22px] border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,.05)] sm:rounded-[30px]">
          <header className="border-b border-black/8 bg-[#faf6ef] px-4 py-4 sm:px-6 sm:py-5">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#9a7a49]">Messages</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-[-.04em] text-[#1f1e1b] sm:text-3xl">
                Internal Support Chat
              </h1>
              {unreadCount > 0 ? (
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#2f6b8a] px-2 text-xs font-bold text-white">
                  {unreadCount > 99 ? "99+" : String(unreadCount)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-black/60">
              Chat with Bounce Party LA support directly from your account.
            </p>
          </header>

          <div className="grid min-h-[68vh] grid-rows-[1fr_auto]">
            <div className="bg-[linear-gradient(180deg,#f7f3ec_0%,#f3efe7_100%)] px-3 py-4 sm:px-6 sm:py-6">
              {resolvedMessages.length === 0 ? (
                <div className="flex h-full min-h-[260px] items-center justify-center">
                  <div className="max-w-md rounded-3xl border border-dashed border-black/15 bg-white/80 px-6 py-8 text-center">
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#9a7a49]">
                      No messages yet
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/60">
                      Start the conversation to request changes, ask questions, or share documents.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {resolvedMessages.map((message: any) => {
                    const outbound = message.direction === "outbound";
                    const attachments = message.resolvedAttachments || [];

                    return (
                      <div
                        key={String(message.id)}
                        className={[
                          "flex w-full",
                          outbound ? "justify-start" : "justify-end",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "max-w-[88%] rounded-3xl px-4 py-3 shadow-sm sm:max-w-[76%]",
                            outbound
                              ? "rounded-bl-md bg-[#ffffff] text-[#1f1e1b]"
                              : "rounded-br-md bg-[#23313f] text-white",
                          ].join(" ")}
                        >
                          <div
                            className={[
                              "mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
                              outbound ? "text-[#9a723e]" : "text-white/65",
                            ].join(" ")}
                          >
                            {outbound ? "Bounce Party LA" : "You"}
                          </div>

                          {message.body_text ? (
                            <div className="whitespace-pre-wrap break-words text-sm leading-6">
                              {message.body_text}
                            </div>
                          ) : null}

                          {attachments.length > 0 ? (
                            <div className={message.body_text ? "mt-3 space-y-2" : "space-y-2"}>
                              {attachments.map((attachment: any, index: number) => {
                                const url = String(attachment.url || "");

                                return (
                                  <a
                                    key={`${attachment.storagePath}-${index}`}
                                    href={url || undefined}
                                    target={url ? "_blank" : undefined}
                                    rel={url ? "noreferrer" : undefined}
                                    className={[
                                      "block overflow-hidden rounded-2xl text-xs font-semibold",
                                      outbound ? "bg-[#f5f1eb] text-[#1f1e1b]" : "bg-white/15 text-white",
                                    ].join(" ")}
                                  >
                                    {attachment.type === "image" && url ? (
                                      <img
                                        src={url}
                                        alt={attachment.name || "Attachment"}
                                        className="max-h-72 w-full object-cover"
                                      />
                                    ) : (
                                      <div className="px-3 py-2.5">📎 {attachment.name || "Attachment"}</div>
                                    )}
                                  </a>
                                );
                              })}
                            </div>
                          ) : null}

                          <div
                            className={[
                              "mt-2 text-[10px]",
                              outbound ? "text-[#7a7063]" : "text-white/70",
                            ].join(" ")}
                          >
                            {formatDateTime(message.sent_at || message.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-black/8 bg-[#fffdfa] px-3 py-3 sm:px-6 sm:py-4">
              <CustomerMessageComposer
                conversationId={conversation?.id ? String(conversation.id) : null}
                action={sendMyInternalMessageAction}
              />
            </div>
          </div>
        </section>
      </main>

      {conversation?.id ? (
        <MarkInternalConversationRead
          conversationId={String(conversation.id)}
          unreadCount={unreadCount}
        />
      ) : null}

      <MessagesAutoRefresh />
    </CustomerShell>
  );
}

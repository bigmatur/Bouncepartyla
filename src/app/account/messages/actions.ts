"use server";

import { revalidatePath } from "next/cache";

import { requireCustomerAccess } from "@/lib/auth/require-customer";
import {
  parseCrmAttachments,
} from "@/lib/communication/attachments";

const DEFAULT_LIMIT = 30;

function isInternalMessengerRpcMissing(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();

  if (!text.includes("could not find the function public.")) {
    return false;
  }

  return (
    text.includes("get_my_internal_conversation") ||
    text.includes("get_my_internal_messages") ||
    text.includes("get_my_internal_unread_count") ||
    text.includes("send_my_internal_message") ||
    text.includes("mark_my_internal_conversation_read")
  );
}

function trimBody(value: unknown) {
  return String(value || "").trim();
}

export async function sendMyInternalMessageAction(formData: FormData) {
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  if (canPreviewCustomer || access.role !== "customer") {
    throw new Error("Messages are unavailable in preview mode.");
  }

  const body = trimBody(formData.get("body"));
  const attachmentsJson = String(formData.get("attachmentsJson") || "[]");
  const clientMessageId = trimBody(formData.get("clientMessageId"));

  let rawAttachments: unknown = [];
  try {
    rawAttachments = JSON.parse(attachmentsJson);
  } catch {
    throw new Error("Attachment metadata is invalid.");
  }

  const attachments = parseCrmAttachments(rawAttachments);

  if (!body && attachments.length === 0) {
    throw new Error("Write a message or attach a file.");
  }

  if (!clientMessageId) {
    throw new Error("Missing client message id.");
  }

  const sendResult = await supabase.rpc("send_my_internal_message", {
    p_client_message_id: clientMessageId,
    p_body: body,
    p_attachments: attachments,
  });

  if (sendResult.error) {
    if (isInternalMessengerRpcMissing(sendResult.error.message)) {
      throw new Error(
        "Internal messaging is temporarily unavailable. Required database functions are missing from the API schema cache.",
      );
    }
    throw new Error(sendResult.error.message);
  }

  revalidatePath("/account/messages");
}

export async function markMyInternalConversationReadAction(conversationId: string) {
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  if (canPreviewCustomer || access.role !== "customer") {
    return;
  }

  const safeConversationId = String(conversationId || "").trim();
  if (!safeConversationId) {
    return;
  }

  const readResult = await supabase.rpc("mark_my_internal_conversation_read", {
    p_conversation_id: safeConversationId,
  });

  if (readResult.error) {
    if (isInternalMessengerRpcMissing(readResult.error.message)) {
      return;
    }
    throw new Error(readResult.error.message);
  }

  revalidatePath("/account/messages");
}

export async function loadMyInternalMessagesAction(params?: {
  limit?: number;
  before?: string | null;
}) {
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  if (canPreviewCustomer || access.role !== "customer") {
    return {
      conversation: null,
      messages: [],
      unreadCount: 0,
    };
  }

  const conversationResult = await supabase.rpc("get_my_internal_conversation");
  if (conversationResult.error) {
    if (isInternalMessengerRpcMissing(conversationResult.error.message)) {
      return {
        conversation: null,
        messages: [],
        unreadCount: 0,
      };
    }
    throw new Error(conversationResult.error.message);
  }

  const conversation = Array.isArray(conversationResult.data)
    ? conversationResult.data[0] || null
    : null;

  if (!conversation?.id) {
    return {
      conversation: null,
      messages: [],
      unreadCount: 0,
    };
  }

  const limit = Math.max(1, Math.min(Number(params?.limit || DEFAULT_LIMIT), 100));
  const before = String(params?.before || "").trim();

  const messagesResult = await supabase.rpc("get_my_internal_messages", {
    p_limit: limit,
    p_before: before || null,
  });

  if (messagesResult.error) {
    if (isInternalMessengerRpcMissing(messagesResult.error.message)) {
      return {
        conversation,
        messages: [],
        unreadCount: 0,
      };
    }
    throw new Error(messagesResult.error.message);
  }

  const unreadResult = await supabase.rpc("get_my_internal_unread_count");
  if (unreadResult.error) {
    if (isInternalMessengerRpcMissing(unreadResult.error.message)) {
      return {
        conversation,
        messages: Array.isArray(messagesResult.data) ? messagesResult.data : [],
        unreadCount: 0,
      };
    }
    throw new Error(unreadResult.error.message);
  }

  return {
    conversation,
    messages: Array.isArray(messagesResult.data) ? messagesResult.data : [],
    unreadCount: Math.max(0, Number(unreadResult.data || 0)),
  };
}

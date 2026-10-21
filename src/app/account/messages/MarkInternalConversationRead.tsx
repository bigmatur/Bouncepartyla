"use client";

import { useEffect } from "react";

import { markMyInternalConversationReadAction } from "./actions";

export default function MarkInternalConversationRead({
  conversationId,
  unreadCount,
}: {
  conversationId: string;
  unreadCount: number;
}) {
  useEffect(() => {
    if (!conversationId || unreadCount <= 0) {
      return;
    }

    void markMyInternalConversationReadAction(conversationId)
      .then(() => {
        window.dispatchEvent(new Event("account-messages-read"));
      })
      .catch((error: unknown) => {
        console.error("Failed to mark internal messages as read", error);
      });
  }, [conversationId, unreadCount]);

  return null;
}

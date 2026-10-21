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

    void markMyInternalConversationReadAction(conversationId);
  }, [conversationId, unreadCount]);

  return null;
}

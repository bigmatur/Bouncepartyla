"use client";

import { useEffect } from "react";
import { markCrmConversationReadAction } from "./actions";

export default function MarkConversationRead({
  conversationId,
  unreadCount,
}: {
  conversationId: string;
  unreadCount: number;
}) {
  useEffect(() => {
    if (!conversationId || unreadCount <= 0) return;
    void markCrmConversationReadAction(conversationId);
  }, [conversationId, unreadCount]);

  return null;
}

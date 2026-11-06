"use client";

import { useEffect } from "react";

export function CrmConversationAutoScroll({
  messageKey,
}: {
  messageKey: string;
}) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>(
        "[data-crm-conversation-scroll]",
      );

      container?.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messageKey]);

  return null;
}

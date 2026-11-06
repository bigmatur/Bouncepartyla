"use client";

import { useLayoutEffect } from "react";

export function CrmConversationAutoScroll({
  messageKey,
}: {
  messageKey: string;
}) {
  useLayoutEffect(() => {
    let secondFrame: number | null = null;

    const scrollToLatest = () => {
      const container = document.querySelector<HTMLElement>(
        "[data-crm-conversation-scroll]",
      );

      container?.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    };

    // The page receives server-rendered messages. A second animation frame
    // waits for the conversation pane to receive its final layout height.
    const firstFrame = window.requestAnimationFrame(() => {
      scrollToLatest();
      secondFrame = window.requestAnimationFrame(scrollToLatest);
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
  }, [messageKey]);

  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;

type LiveResponse = { revision?: string; unreadCount?: number };

export function CrmInboxLiveRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const revisionRef = useRef<string | null>(null);
  const unreadCountRef = useRef(0);
  const refreshingRef = useRef(false);
  const dismissTimeoutRef = useRef<number | null>(null);
  const [newMessageCount, setNewMessageCount] = useState(0);

  useEffect(() => {
    let active = true;

    const checkForChanges = async () => {
      if (!active || refreshingRef.current || document.visibilityState !== "visible") {
        return;
      }

      try {
        const response = await fetch("/api/admin/crm/inbox/live", { cache: "no-store" });
        if (!response.ok) return;

        const { revision = "", unreadCount = 0 } =
          (await response.json()) as LiveResponse;
        if (revisionRef.current === null) {
          revisionRef.current = revision;
          unreadCountRef.current = unreadCount;
          return;
        }

        if (revisionRef.current === revision) return;

        const incomingMessageCount = Math.max(0, unreadCount - unreadCountRef.current);
        revisionRef.current = revision;
        unreadCountRef.current = unreadCount;

        if (incomingMessageCount > 0 && !pathname.startsWith("/admin/crm/inbox")) {
          setNewMessageCount(incomingMessageCount);
          if (dismissTimeoutRef.current !== null) {
            window.clearTimeout(dismissTimeoutRef.current);
          }
          dismissTimeoutRef.current = window.setTimeout(() => {
            setNewMessageCount(0);
            dismissTimeoutRef.current = null;
          }, 8000);
        }

        refreshingRef.current = true;
        router.refresh();
        window.setTimeout(() => {
          refreshingRef.current = false;
        }, 500);
      } catch {
        // The next scheduled check retries transient network failures.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForChanges();
    };

    void checkForChanges();
    const interval = window.setInterval(checkForChanges, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (dismissTimeoutRef.current !== null) {
        window.clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, [pathname, router]);

  if (newMessageCount === 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setNewMessageCount(0);
        router.push("/admin/crm/inbox?status=unread");
      }}
      className="fixed bottom-5 right-5 z-[90] max-w-[min(24rem,calc(100vw-2.5rem))] rounded-2xl bg-[#23313f] px-5 py-4 text-left text-white shadow-[0_16px_42px_rgba(35,49,63,0.35)] transition hover:bg-[#172534]"
      aria-live="polite"
    >
      <span className="block text-sm font-bold">
        {newMessageCount === 1 ? "New CRM message" : `${newMessageCount} new CRM messages`}
      </span>
      <span className="mt-1 block text-xs font-semibold text-white/75">
        Open Inbox
      </span>
    </button>
  );
}

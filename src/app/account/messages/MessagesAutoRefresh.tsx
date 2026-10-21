"use client";

import { useEffect } from "react";

export default function MessagesAutoRefresh() {
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      window.location.reload();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return null;
}

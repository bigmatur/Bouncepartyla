"use client";

import { useEffect } from "react";

export default function ResetCreateItemForm({
  formId,
  resetKey,
}: {
  formId: string;
  resetKey: string;
}) {
  useEffect(() => {
    if (!resetKey) return;

    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const reset = () => form.reset();

    reset();

    const raf = requestAnimationFrame(reset);
    const timer = window.setTimeout(reset, 80);
    const interval = window.setInterval(reset, 140);
    const stopInterval = window.setTimeout(() => {
      window.clearInterval(interval);
    }, 1200);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.clearTimeout(stopInterval);
      window.clearInterval(interval);
    };
  }, [resetKey, formId]);

  return null;
}

"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export default function CrmContextFloatingPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold text-[#443d37] transition hover:bg-[#f7f3ed]"
      >
        Customer / Event
      </button>

      {open ? (
        <div className="fixed inset-0 z-[95]">
          <button
            type="button"
            aria-label="Close customer context"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
          />

          <aside className="absolute inset-y-0 right-0 w-[min(94vw,390px)] overflow-y-auto border-l border-[#e1d9cf] bg-[#faf8f5] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e7dfd4] bg-[#faf8f5]/95 px-4 py-3 backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                Customer / Event
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[#d8cec0] bg-white px-3 py-1 text-xs font-semibold text-[#443d37] transition hover:bg-[#f7f3ed]"
              >
                Close
              </button>
            </div>

            {children}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
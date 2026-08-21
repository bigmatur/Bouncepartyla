"use client";

import type { ReactNode } from "react";

type SectionCardProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export default function SectionCard({
  children,
  className = "",
  contentClassName = "",
  title,
  subtitle,
  actions,
}: SectionCardProps) {
  return (
    <section
      className={[
        "min-w-0 overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.04)] sm:rounded-[28px] sm:shadow-[0_12px_35px_rgba(0,0,0,0.04)]",
        className,
      ].join(" ")}
    >
      {title || subtitle || actions ? (
        <header className="flex min-w-0 flex-col gap-3 border-b border-[#eee5d9] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
          <div className="min-w-0">
            {title ? (
              <div className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-lg">
                {title}
              </div>
            ) : null}

            {subtitle ? (
              <div className="mt-1 text-xs leading-5 text-[#6c6258] sm:text-sm">
                {subtitle}
              </div>
            ) : null}
          </div>

          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}

      <div className={["p-4 sm:p-5", contentClassName].join(" ")}>
        {children}
      </div>
    </section>
  );
}

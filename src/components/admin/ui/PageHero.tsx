"use client";

import type { ReactNode } from "react";

type PageHeroProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  stats?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

export default function PageHero({
  eyebrow,
  title,
  description,
  actions,
  stats,
  aside,
  className = "",
}: PageHeroProps) {
  return (
    <section
      className={[
        "min-w-0 overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.04)] sm:rounded-[30px] sm:shadow-[0_12px_38px_rgba(0,0,0,0.045)]",
        className,
      ].join(" ")}
    >
      <div
        className={[
          "grid min-w-0",
          aside ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "",
        ].join(" ")}
      >
        <div className="min-w-0 p-4 sm:p-6">
          {eyebrow ? (
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a723e] sm:text-xs sm:tracking-[0.18em]">
              {eyebrow}
            </div>
          ) : null}

          <div className="mt-1 min-w-0 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl">
            {title}
          </div>

          {description ? (
            <div className="mt-1.5 max-w-4xl text-xs leading-5 text-[#6c6258] sm:mt-2 sm:text-sm sm:leading-6">
              {description}
            </div>
          ) : null}

          {actions ? <div className="mt-4">{actions}</div> : null}

          {stats ? (
            <div className="mt-4 border-t border-[#eee5d9] pt-4">
              {stats}
            </div>
          ) : null}
        </div>

        {aside ? (
          <aside className="border-t border-[#eee5d9] bg-[#23313f] p-4 text-white lg:border-l lg:border-t-0 sm:p-6">
            {aside}
          </aside>
        ) : null}
      </div>
    </section>
  );
}

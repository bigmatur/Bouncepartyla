"use client";

import type { ReactNode } from "react";

type StatTone = "plain" | "gold" | "green" | "red" | "blue";

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
};

const toneClasses: Record<StatTone, string> = {
  plain: "border-[#eadfd1] bg-white",
  gold: "border-[#efd18a] bg-[#fff8e7]",
  green: "border-[#bfe9d5] bg-[#eefaf5]",
  red: "border-[#f1c6c2] bg-[#fff4f2]",
  blue: "border-[#cfdfed] bg-[#f2f7fc]",
};

export default function StatCard({
  label,
  value,
  hint,
  tone = "plain",
  className = "",
}: StatCardProps) {
  return (
    <div
      className={[
        "min-w-0 rounded-[18px] border p-3.5 shadow-[0_6px_18px_rgba(0,0,0,0.025)] sm:rounded-[22px] sm:p-4",
        toneClasses[tone],
        className,
      ].join(" ")}
    >
      <div className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a7b6c] sm:text-[11px] sm:tracking-[0.14em]">
        {label}
      </div>

      <div className="mt-1.5 truncate text-xl font-bold tracking-tight text-[#25211e] sm:mt-2 sm:text-2xl">
        {value}
      </div>

      {hint ? (
        <div className="mt-1 truncate text-[10px] text-[#81766c] sm:text-[11px]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

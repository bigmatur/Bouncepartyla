"use client";

import { useMemo, useState } from "react";

type TimeFormat = "12h" | "24h";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatOptionLabel(value: string, timeFormat: TimeFormat) {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw || 0);
  const minute = Number(minuteRaw || 0);

  if (timeFormat === "24h") {
    return `${pad(hour)}:${pad(minute)}`;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  return `${hour12}:${pad(minute)} ${period}`;
}

function buildTimeOptions() {
  const options: string[] = [];

  for (let hour = 0; hour < 24; hour += 1) {
    options.push(`${pad(hour)}:00`);
    options.push(`${pad(hour)}:30`);
  }

  return options;
}

export default function TimeSelect({
  name,
  defaultValue,
  timeFormat = "12h",
  required,
}: {
  name: string;
  defaultValue?: string | null;
  timeFormat?: TimeFormat;
  required?: boolean;
}) {
  const cleanDefaultValue = defaultValue ? String(defaultValue).slice(0, 5) : "";
  const [selectedTime, setSelectedTime] = useState(cleanDefaultValue);
  const [open, setOpen] = useState(false);

  const options = useMemo(() => buildTimeOptions(), []);

  const selectedLabel = selectedTime
    ? formatOptionLabel(selectedTime, timeFormat)
    : "Choose time";

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selectedTime} required={required} />

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={[
          "flex w-full items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-left text-sm font-semibold outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
          selectedTime ? "text-[#1f1e1b]" : "text-[#8b8177]",
        ].join(" ")}
      >
        <span>{selectedLabel}</span>
        <span className="text-xs text-[#9a7a49]">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[360px] max-w-[calc(100vw-40px)] rounded-[24px] border border-[#eadfce] bg-white p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              Select time
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold text-[#6c6258] hover:bg-[#eadfce]"
            >
              Close
            </button>
          </div>

          <div className="grid max-h-[310px] grid-cols-4 gap-2 overflow-y-auto pr-1">
            {options.map((option) => {
              const active = selectedTime === option;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSelectedTime(option);
                    setOpen(false);
                  }}
                  className={[
                    "rounded-2xl px-3 py-3 text-sm font-semibold transition",
                    active
                      ? "bg-[#23313f] text-white"
                      : "bg-[#f7f1e8] text-[#1f1e1b] ring-1 ring-[#eadfce] hover:bg-[#eadfce]",
                  ].join(" ")}
                >
                  {formatOptionLabel(option, timeFormat)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
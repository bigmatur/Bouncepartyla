import type { StaffTimeHistoryRow } from "@/lib/staff-time/dashboard";

function formatDate(value: string) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;

  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

export default function StaffTimeHistory({
  rows,
}: {
  rows: StaffTimeHistoryRow[];
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
      <div className="border-b border-[#eee5da] px-6 py-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
          Recent shifts
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-[#1f1e1b]">
          My work history
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f7f2eb] text-xs uppercase tracking-[0.1em] text-[#756a60]">
            <tr>
              <th className="px-5 py-4">Date</th>
              <th className="px-5 py-4">Start</th>
              <th className="px-5 py-4">Finish</th>
              <th className="px-5 py-4">Break</th>
              <th className="px-5 py-4">Paid</th>
              <th className="px-5 py-4">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eee5da]">
            {rows.map((row) => {
              const grossMinutes = row.clock_out_at
                ? Math.max(
                    0,
                    (new Date(row.clock_out_at).getTime() -
                      new Date(row.clock_in_at).getTime()) /
                      60000,
                  )
                : 0;
              const breakMinutes = Number(row.break_minutes || 0);
              const paidMinutes = Math.max(0, grossMinutes - breakMinutes);

              return (
                <tr key={row.id}>
                  <td className="px-5 py-4 font-semibold">
                    {formatDate(row.work_date)}
                  </td>
                  <td className="px-5 py-4">{formatTime(row.clock_in_at)}</td>
                  <td className="px-5 py-4">{formatTime(row.clock_out_at)}</td>
                  <td className="px-5 py-4">
                    {formatDuration(breakMinutes)}
                  </td>
                  <td className="px-5 py-4 font-semibold">
                    {formatDuration(paidMinutes)}
                  </td>
                  <td className="px-5 py-4">
                    {String(row.source || "manual").replace(/_/g, " ")}
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-10 text-center text-[#7b7168]"
                >
                  Finished shifts will appear here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import {
  finishWorkAction,
  resumeWorkAction,
  startBreakAction,
  startWorkAction,
} from "@/app/time-clock/actions";

type BreakRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  break_type: string;
};

type EntryRow = {
  id: string;
  work_date?: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  source: string;
  staff_time_breaks?: BreakRow[] | null;
};


function isStaleOpenShift(entry: EntryRow | null) {
  if (!entry || entry.clock_out_at) return false;

  const startedAt = new Date(entry.clock_in_at);
  const elapsedHours = (Date.now() - startedAt.getTime()) / 3_600_000;
  const losAngelesDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return Boolean(
    (entry.work_date && entry.work_date !== losAngelesDate) ||
    elapsedHours >= 16,
  );
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function StaffTimeClockCard({
  entry,
  source = "manual",
  compact = false,
  title = "My time",
  errorMessage = null,
}: {
  entry: EntryRow | null;
  source?: "manual" | "driver_route" | "cleaning";
  compact?: boolean;
  title?: string;
  errorMessage?: string | null;
}) {
  const breaks = entry?.staff_time_breaks || [];
  const openBreak = breaks.find((item) => !item.ended_at) || null;
  const staleOpenShift = isStaleOpenShift(entry);

  return (
    <section className={`rounded-[26px] border border-black/5 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.04)] ${compact ? "p-4" : "p-6"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            {title}
          </div>
          <h2 className={`${compact ? "text-xl" : "text-2xl"} mt-1 font-semibold text-[#1f1e1b]`}>
            {!entry ? "Not working" : openBreak ? "On break" : "Working"}
          </h2>
          <p className="mt-1 text-sm text-[#70665d]">
            {!entry
              ? "Start when your work begins."
              : `Started ${formatTime(entry.clock_in_at)}${openBreak ? ` · Break since ${formatTime(openBreak.started_at)}` : ""}`}
          </p>

          {errorMessage && (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-100">
              {errorMessage}
            </p>
          )}

          {staleOpenShift && (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-900 ring-1 ring-amber-200">
              <div className="font-semibold">This shift may have been left open.</div>
              <div className="mt-1 text-xs">
                Review the start time before finishing. If the time is incorrect, an administrator can correct the shift with a reason in Adjustment History.
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!entry ? (
            <form action={startWorkAction}>
              <input type="hidden" name="source" value={source} />
              <button className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white hover:bg-[#17212b]">
                {source === "driver_route" ? "Start route & work" : "Start work"}
              </button>
            </form>
          ) : openBreak ? (
            <form action={resumeWorkAction}>
              <button className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800">
                Resume work
              </button>
            </form>
          ) : (
            <form action={startBreakAction}>
              <button className="rounded-full border border-[#d8ccbd] bg-white px-5 py-3 text-sm font-semibold text-[#2d2925] hover:bg-[#faf6f0]">
                Start break
              </button>
            </form>
          )}

          {entry ? (
            <form action={finishWorkAction}>
              <button className="rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800">
                Finish work
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}

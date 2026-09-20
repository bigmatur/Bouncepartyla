
import { adminUpdateShiftAction } from "@/app/admin/staff/time/actions";

export type UnlinkedDriverShiftReviewRow = {
  id: string;
  driverName: string;
  dateLabel: string;
  startLabel: string;
  clockInLocal: string;
  clockOutLocal: string;
};

export default function UnlinkedDriverShiftReview({
  shifts,
}: {
  shifts: UnlinkedDriverShiftReviewRow[];
}) {
  if (shifts.length === 0) return null;

  return (
    <section className="space-y-3 rounded-[26px] border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
          Needs review
        </div>
        <h2 className="mt-1 text-lg font-semibold text-[#211f1c] sm:text-xl">
          Driver shifts needing review
        </h2>
        <p className="mt-1 text-sm text-[#786e65]">
          Correct the actual finish time before the driver starts a new shift.
        </p>
      </div>

      {shifts.map((shift) => (
        <div key={shift.id} className="rounded-2xl border border-amber-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-[#211f1c]">{shift.driverName}</div>
              <div className="mt-1 text-xs text-[#786e65]">
                {shift.dateLabel} · {shift.startLabel} → Open
              </div>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-900">
              Needs review
            </span>
          </div>

          <form action={adminUpdateShiftAction} className="mt-4 grid gap-2 md:grid-cols-4">
            <input type="hidden" name="time_entry_id" value={shift.id} />
            <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
              Start
              <input className="h-11 rounded-xl border border-[#d8ccbd] bg-white px-3" type="datetime-local" name="clock_in_local" defaultValue={shift.clockInLocal} required />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
              Finish
              <input className="h-11 rounded-xl border border-[#d8ccbd] bg-white px-3" type="datetime-local" name="clock_out_local" defaultValue={shift.clockOutLocal} required />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
              Reason
              <input className="h-11 rounded-xl border border-[#d8ccbd] bg-white px-3" type="text" name="reason" minLength={3} placeholder="Correct stale driver shift" required />
            </label>
            <div className="flex items-end">
              <button className="h-11 w-full rounded-xl bg-[#23313f] px-4 text-sm font-semibold text-white">
                Save correction
              </button>
            </div>
          </form>
        </div>
      ))}
    </section>
  );
}

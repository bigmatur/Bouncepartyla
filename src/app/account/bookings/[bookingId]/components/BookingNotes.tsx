type BookingNotesProps = {
  notes: string | null;
};

export default function BookingNotes({
  notes,
}: BookingNotesProps) {
  const normalizedNotes = notes?.trim();

  if (!normalizedNotes) {
    return null;
  }

  return (
    <section className="rounded-[26px] border border-black/10 bg-white p-6">
      <div className="flex items-start gap-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f7f4ef] text-lg"
          aria-hidden="true"
        >
          ✎
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
            Special instructions
          </p>

          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
            Notes for your booking
          </h2>
        </div>
      </div>

      <div className="mt-5 rounded-[20px] border border-black/[0.06] bg-black/[0.025] px-5 py-5">
        <p className="whitespace-pre-wrap text-sm leading-7 text-black/65">
          {normalizedNotes}
        </p>
      </div>

      <p className="mt-4 text-xs leading-5 text-black/40">
        These notes are attached to your reservation and are visible to our team.
      </p>
    </section>
  );
}

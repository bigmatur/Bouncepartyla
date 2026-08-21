function SkeletonBlock({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-[18px] bg-black/[0.06] ${className}`}
    />
  );
}

function SkeletonCard({
  rows = 3,
}: {
  rows?: number;
}) {
  return (
    <section className="rounded-[26px] border border-black/10 bg-white p-6">
      <SkeletonBlock className="h-3 w-28" />
      <SkeletonBlock className="mt-3 h-7 w-48" />

      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map(
          (_, index) => (
            <SkeletonBlock
              key={index}
              className="h-20 w-full"
            />
          ),
        )}
      </div>
    </section>
  );
}

export default function LoadingBookingDetails() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:py-10">
      <SkeletonBlock className="h-5 w-40" />

      <section className="mt-6 overflow-hidden rounded-[30px] border border-black/10 bg-white p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <SkeletonBlock className="h-3 w-36" />
            <SkeletonBlock className="mt-4 h-10 w-3/4" />
            <SkeletonBlock className="mt-4 h-5 w-56" />
            <SkeletonBlock className="mt-2 h-5 w-72 max-w-full" />
          </div>

          <SkeletonBlock className="h-40 w-full" />
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-6">
          <SkeletonCard rows={2} />
          <SkeletonCard rows={3} />
          <SkeletonCard rows={2} />
        </div>

        <aside className="space-y-6">
          <SkeletonCard rows={1} />
          <SkeletonCard rows={4} />
          <SkeletonCard rows={3} />
        </aside>
      </div>
    </main>
  );
}

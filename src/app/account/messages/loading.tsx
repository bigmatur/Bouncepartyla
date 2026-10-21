export default function AccountMessagesLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-5 sm:py-8">
      <section className="overflow-hidden rounded-[22px] border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,.05)] sm:rounded-[30px]">
        <header className="border-b border-black/8 bg-[#faf6ef] px-4 py-4 sm:px-6 sm:py-5">
          <div className="h-3 w-28 animate-pulse rounded bg-black/10" />
          <div className="mt-3 h-8 w-72 animate-pulse rounded bg-black/10" />
          <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-black/10" />
        </header>
        <div className="space-y-4 bg-[linear-gradient(180deg,#f7f3ec_0%,#f3efe7_100%)] px-3 py-6 sm:px-6">
          <div className="h-20 animate-pulse rounded-3xl bg-white/80" />
          <div className="h-20 animate-pulse rounded-3xl bg-white/80" />
          <div className="h-20 animate-pulse rounded-3xl bg-white/80" />
        </div>
      </section>
    </main>
  );
}

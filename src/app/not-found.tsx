export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-12">
      <div className="w-full rounded-[28px] border border-black/5 bg-white p-8 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
          Bounce Party LA
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#6c6258]">
          The page you requested is not available or no longer exists.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/admin"
            className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white"
          >
            Go to dashboard
          </a>
          <a
            href="/login"
            className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28]"
          >
            Open login
          </a>
        </div>
      </div>
    </main>
  );
}
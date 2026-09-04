import Link from "next/link";

const MARKETING_SITE_URL =
  String(process.env.NEXT_PUBLIC_MARKETING_SITE_URL || "").trim() ||
  "https://bouncepartyla.com";

export default function PublicBookingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f5efe6] text-[#1d1d1b]">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f5efe6]/95 backdrop-blur">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <div className="flex min-h-[68px] items-center justify-between gap-4">
            <Link href="/" className="min-w-0">
              <div className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-[#9a723e]">
                Bounce Party LA
              </div>
              <div className="truncate text-lg font-semibold tracking-[-0.02em]">
                Rentals & Booking
              </div>
            </Link>

            <nav className="hidden items-center gap-2 sm:flex" aria-label="Public primary navigation">
              <Link
                href="/"
                className="rounded-full px-4 py-2 text-sm font-semibold text-[#3d3832] transition hover:bg-black/[0.04]"
              >
                Home
              </Link>

              <Link
                href="/catalog"
                className="rounded-full px-4 py-2 text-sm font-semibold text-[#3d3832] transition hover:bg-black/[0.04]"
              >
                Rentals
              </Link>

              <Link
                href="/account"
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-black/[0.03]"
              >
                Account
              </Link>

              <Link
                href="/book"
                className="rounded-full bg-[#1d1d1b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
              >
                Check Availability
              </Link>
            </nav>
          </div>

          <nav
            className="flex items-center gap-2 overflow-x-auto pb-3 sm:hidden"
            aria-label="Public mobile navigation"
          >
            <Link
              href="/"
              className="whitespace-nowrap rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold"
            >
              Home
            </Link>

            <Link
              href="/catalog"
              className="whitespace-nowrap rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold"
            >
              Rentals
            </Link>

            <Link
              href="/account"
              className="whitespace-nowrap rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold"
            >
              Account
            </Link>

            <Link
              href="/book"
              className="whitespace-nowrap rounded-full bg-[#1d1d1b] px-3 py-2 text-xs font-semibold text-white"
            >
              Check Availability
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-black/5 bg-white/60">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-black/55 sm:flex-row sm:items-center sm:justify-between">
          <div>© Bounce Party LA</div>

          <div className="flex flex-wrap gap-4">
            <Link href="/" className="font-semibold text-[#3d3832]">
              Home
            </Link>

            <a href={MARKETING_SITE_URL} className="font-semibold text-[#3d3832]">
              Main website
            </a>

            <Link href="/catalog" className="font-semibold text-[#3d3832]">
              Rentals
            </Link>

            <Link href="/account" className="font-semibold text-[#3d3832]">
              My Account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

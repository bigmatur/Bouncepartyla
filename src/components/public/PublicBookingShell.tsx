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
        <div className="mx-auto flex min-h-[68px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href={MARKETING_SITE_URL} className="min-w-0">
            <div className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-[#9a723e]">
              Bounce Party LA
            </div>
            <div className="truncate text-lg font-semibold tracking-[-0.02em]">
              Rentals & Booking
            </div>
          </a>

          <nav className="flex items-center gap-2">
            <Link
              href="/catalog"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-[#3d3832] transition hover:bg-black/[0.04] sm:inline-flex"
            >
              Rentals
            </Link>

            <Link
              href="/account"
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-black/[0.03]"
            >
              My Account
            </Link>

            <Link
              href="/book"
              className="rounded-full bg-[#1d1d1b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
            >
              Book Now
            </Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-black/5 bg-white/60">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-black/55 sm:flex-row sm:items-center sm:justify-between">
          <div>© Bounce Party LA</div>

          <div className="flex flex-wrap gap-4">
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

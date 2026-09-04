import Link from "next/link";

const MARKETING_SITE_URL =
  String(process.env.NEXT_PUBLIC_MARKETING_SITE_URL || "").trim() ||
  "https://bouncepartyla.com";

export default function PublicBookingShell({
  children,
  marketingMode = false,
}: {
  children: React.ReactNode;
  marketingMode?: boolean;
}) {
  const homeHref = marketingMode ? "/" : MARKETING_SITE_URL;

  return (
    <div className="min-h-screen bg-[#f7f3ec] text-[#1c1b18]">
      <header className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f7f3ec]/92 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] w-full max-w-[1500px] items-center justify-between gap-4 px-4 sm:min-h-[78px] sm:px-7">
          {marketingMode ? (
            <Link href={homeHref} className="group min-w-0">
              <Brand />
            </Link>
          ) : (
            <a href={homeHref} className="group min-w-0">
              <Brand />
            </a>
          )}

          <nav className="hidden items-center gap-1 lg:flex">
            <Link href="/catalog" className="rounded-full px-4 py-2.5 text-sm font-semibold transition hover:bg-black/[0.045]">
              Rentals
            </Link>
            {marketingMode && (
              <>
                <a href="/#why-us" className="rounded-full px-4 py-2.5 text-sm font-semibold transition hover:bg-black/[0.045]">
                  Why us
                </a>
                <a href="https://www.instagram.com/bouncepartyla/" className="rounded-full px-4 py-2.5 text-sm font-semibold transition hover:bg-black/[0.045]">
                  Instagram
                </a>
              </>
            )}
            <Link href="/account" className="rounded-full px-4 py-2.5 text-sm font-semibold transition hover:bg-black/[0.045]">
              My account
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/catalog"
              className="hidden min-h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-bold shadow-sm transition hover:bg-[#fffdf9] sm:inline-flex"
            >
              Browse
            </Link>
            <Link
              href="/book"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1c1b18] px-5 text-sm font-bold text-white transition hover:bg-black sm:px-6"
            >
              Book now
            </Link>
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-black/[0.06] bg-[#eee7dc]">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-12 sm:px-7 lg:grid-cols-[1.2fr_0.8fr_0.8fr] lg:py-16">
          <div>
            <Brand />
            <p className="mt-5 max-w-sm text-sm leading-6 text-black/50">
              Modern bounce houses, soft play, bubble houses and party rentals delivered across Los Angeles and surrounding areas.
            </p>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-black/35">Explore</div>
            <div className="mt-4 flex flex-col gap-3 text-sm font-semibold">
              <Link href="/catalog">All rentals</Link>
              <Link href="/book">Check availability</Link>
              <Link href="/account">My account</Link>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-black/35">Contact</div>
            <div className="mt-4 flex flex-col gap-3 text-sm font-semibold">
              <a href="tel:+17472722603">(747) 272-2603</a>
              <a href="mailto:bouncepartyla@gmail.com">bouncepartyla@gmail.com</a>
              <a href="https://www.instagram.com/bouncepartyla/">@bouncepartyla</a>
            </div>
          </div>
        </div>

        <div className="border-t border-black/[0.06]">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-black/40 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>© {new Date().getFullYear()} Bounce Party LA</div>
            <div>Los Angeles, California</div>
          </div>
        </div>
      </footer>

      <div className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-2 gap-2 rounded-[22px] border border-black/10 bg-white/94 p-2 shadow-[0_16px_45px_rgba(0,0,0,0.16)] backdrop-blur-xl sm:hidden">
        <Link href="/catalog" className="flex min-h-12 items-center justify-center rounded-2xl bg-[#f1ece4] text-sm font-bold">
          Browse rentals
        </Link>
        <Link href="/book" className="flex min-h-12 items-center justify-center rounded-2xl bg-[#1c1b18] text-sm font-bold text-white">
          Check date
        </Link>
      </div>
      <div className="h-20 sm:hidden" />
    </div>
  );
}

function Brand() {
  return (
    <div>
      <div className="truncate text-[10px] font-bold uppercase tracking-[0.23em] text-[#9a7654]">
        Los Angeles
      </div>
      <div className="truncate text-[19px] font-semibold tracking-[-0.045em] sm:text-[21px]">
        BOUNCE PARTY LA
      </div>
    </div>
  );
}

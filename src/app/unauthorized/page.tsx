import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5efe6] px-5 py-10 text-[#1d1d1b]">
      <section className="w-full max-w-lg rounded-[30px] border border-black/10 bg-white p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.08)] sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl">
          🔒
        </div>

        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">
          Access denied
        </h1>

        <p className="mt-3 text-sm leading-6 text-black/60">
          Your account does not have permission to open this section.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#1d1d1b] px-5 text-sm font-semibold text-white transition hover:bg-black"
          >
            Go to website
          </Link>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-black/10 bg-white px-5 text-sm font-semibold text-[#1d1d1b] transition hover:bg-black/[0.03]"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
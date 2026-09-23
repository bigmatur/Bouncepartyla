import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

import { createCustomerPasswordAction } from "./actions";

export const metadata: Metadata = {
  title: "Create Password | Bounce Party LA",
  description: "Create your Bounce Party LA account password.",
  robots: {
    index: false,
    follow: false,
  },
};

type SearchParams = Promise<{
  error?: string;
  next?: string;
}>;

export const dynamic = "force-dynamic";

function safeCustomerNextPath(nextPath: string) {
  return nextPath.startsWith("/account")
    ? nextPath
    : "/account";
}

function customerLoginUrl(nextPath: string, error?: string) {
  const params = new URLSearchParams({
    next: nextPath,
    mode: "customer",
  });

  if (error) {
    params.set("error", error);
  }

  return `/login?${params.toString()}`;
}

export default async function CreatePasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const nextPath = safeCustomerNextPath(safeNextPath(params.next) || "/account");

  const supabase = await createClient();
  const userResult = await supabase.auth.getUser();

  if (!userResult.data.user) {
    redirect(
      customerLoginUrl(
        nextPath,
        "Please sign in again to create your password.",
      ),
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5efe6] px-4 py-8 text-[#1d1d1b] sm:px-5 sm:py-10">
      <section className="w-full max-w-md rounded-[30px] border border-black/10 bg-white p-6 shadow-[0_24px_70px_rgba(0,0,0,0.08)] sm:p-9">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-[#9a723e]">
          Bounce Party LA
        </p>

        <h1 className="mt-3 text-center text-3xl font-semibold tracking-[-0.04em]">
          Create your password
        </h1>

        <p className="mt-3 text-center text-sm leading-6 text-black/60">
          Your email is verified. Create a password for future sign-ins.
        </p>

        {params.error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            {params.error}
          </div>
        ) : null}

        <form action={createCustomerPasswordAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={nextPath} />

          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none focus:border-black/30"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Confirm password</span>
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none focus:border-black/30"
            />
          </label>

          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#1d1d1b] px-5 text-sm font-semibold text-white transition hover:bg-black"
          >
            Create password
          </button>
        </form>
      </section>
    </main>
  );
}

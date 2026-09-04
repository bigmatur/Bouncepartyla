import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requestCustomerLoginCode } from "@/app/account/login/actions";
import {
  getUnifiedAccess,
  resolvePostLoginPath,
  safeNextPath,
} from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

import {
  loginAction,
  requestPasswordResetAction,
} from "./actions";

type LoginSearchParams =
  Promise<{
    error?: string;
    next?: string;
    sent?: string;
    email?: string;
    mode?: string;
    resetSent?: string;
  }>;

export const metadata: Metadata = {
  title: "Sign In | Bounce Party LA",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic =
  "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams:
    LoginSearchParams;
}) {
  const params =
    await searchParams;

  const nextPath =
    safeNextPath(
      params.next,
    ) || "/admin";

  const customerMode =
    params.mode ===
      "customer" ||
    nextPath.startsWith(
      "/account",
    );

  const supabase =
    await createClient();

  const access =
    await getUnifiedAccess(
      supabase,
    );

  if (
    access.user &&
    access.role &&
    access.isActive
  ) {
    redirect(
      resolvePostLoginPath(
        access,
        params.next,
      ),
    );
  }

  const signupQuery =
    new URLSearchParams({
      next:
        customerMode
          ? nextPath
          : "/account",
    });

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5efe6] px-5 py-10 text-[#1d1d1b]">
      <section className="w-full max-w-md rounded-[30px] border border-black/10 bg-white p-7 shadow-[0_24px_70px_rgba(0,0,0,0.08)] sm:p-9">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
            Bounce Party LA
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            {customerMode
              ? "Customer sign in"
              : "Sign in"}
          </h1>

          <p className="mt-3 text-sm leading-6 text-black/60">
            {customerMode
              ? "Access your parties, contracts, payments and account."
              : "Sign in to continue."}
          </p>
        </div>

        {params.error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {
              params.error
            }
          </div>
        )}

        {customerMode && (
          <div className="mt-6 rounded-2xl border border-[#eadfce] bg-[#fffaf3] p-4 text-center">
            <div className="text-sm font-semibold">
              New customer?
            </div>

            <p className="mt-1 text-xs leading-5 text-black/55">
              Create an account before completing your first online booking.
            </p>

            <Link
              href={`/signup?${signupQuery.toString()}`}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#1d1d1b] px-4 text-sm font-semibold text-white"
            >
              Create account
            </Link>
          </div>
        )}

        <form
          action={
            loginAction
          }
          className="mt-7 space-y-5"
        >
          <input
            type="hidden"
            name="next"
            value={
              nextPath
            }
          />

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-semibold"
            >
              Email address
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none transition placeholder:text-black/30 focus:border-black/30 focus:ring-4 focus:ring-black/[0.04]"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-semibold"
            >
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none transition focus:border-black/30 focus:ring-4 focus:ring-black/[0.04]"
            />
          </div>

          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-black/10 bg-white px-5 text-sm font-semibold text-[#1d1d1b] transition hover:bg-black/[0.03]"
          >
            Sign in with password
          </button>
        </form>

        <div className="mt-7 border-t border-black/10 pt-7">
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-[-0.02em]">
              Secure sign-in link
            </h2>

            <p className="mt-2 text-sm leading-6 text-black/60">
              {customerMode
                ? "If you already have a customer account or previous booking, we can email you a secure sign-in link."
                : "Send a secure sign-in link to your email."}
            </p>
          </div>

          {params.sent ===
          "1" ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-800">
              A secure login link was sent to{" "}
              <strong>
                {params.email}
              </strong>
              . Check inbox and spam folder.
            </div>
          ) : (
            <form
              action={
                requestCustomerLoginCode
              }
              className="mt-5 space-y-4"
            >
              <input
                type="hidden"
                name="next"
                value={
                  nextPath
                }
              />

              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={
                  params.email ||
                  ""
                }
                placeholder="you@example.com"
                className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none transition placeholder:text-black/30 focus:border-black/30"
              />

              <button
                type="submit"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#1d1d1b] px-5 text-sm font-semibold text-white transition hover:bg-black"
              >
                Email me a sign-in link
              </button>
            </form>
          )}
        </div>

        <details className="mt-6 border-t border-black/10 pt-5">
          <summary className="cursor-pointer text-center text-xs font-semibold text-black/45">
            Forgot password?
          </summary>

          <div className="mt-4 rounded-2xl bg-[#faf8f4] p-4">
            {params.resetSent ===
            "1" ? (
              <p className="text-sm leading-6 text-emerald-700">
                If an account exists for{" "}
                <strong>
                  {params.email}
                </strong>
                , reset instructions were sent.
              </p>
            ) : (
              <form
                action={
                  requestPasswordResetAction
                }
                className="space-y-3"
              >
                <input
                  type="hidden"
                  name="next"
                  value={
                    nextPath
                  }
                />

                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={
                    params.email ||
                    ""
                  }
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none"
                />

                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold"
                >
                  Send reset link
                </button>
              </form>
            )}
          </div>
        </details>

        {customerMode && (
          <div className="mt-6 text-center">
            <Link
              href="/catalog"
              className="text-xs font-semibold text-black/45"
            >
              ← Back to rentals
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

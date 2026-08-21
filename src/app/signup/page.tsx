import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getUnifiedAccess,
  resolvePostLoginPath,
  safeNextPath,
} from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

import {
  requestCustomerSignupLinkAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Create Account | Bounce Party LA",
  description:
    "Create your Bounce Party LA customer account.",
  robots: {
    index: false,
    follow: false,
  },
};

type SearchParams = Promise<{
  error?: string;
  next?: string;
  sent?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}>;

export const dynamic =
  "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params =
    await searchParams;

  const nextPath =
    safeNextPath(
      params.next,
    ) || "/account";

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
        nextPath,
      ),
    );
  }

  const loginParams =
    new URLSearchParams({
      next: nextPath,
      mode: "customer",
    });

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5efe6] px-4 py-8 text-[#1d1d1b] sm:px-5 sm:py-10">
      <section className="w-full max-w-lg rounded-[30px] border border-black/10 bg-white p-6 shadow-[0_24px_70px_rgba(0,0,0,0.08)] sm:p-9">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a723e]">
            Bounce Party LA
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            Create your account
          </h1>

          <p className="mt-3 text-sm leading-6 text-black/60">
            We will email you a secure verification link. No password is required.
          </p>
        </div>

        {params.error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            {params.error}
          </div>
        )}

        {params.sent === "1" ? (
          <div className="mt-7">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-sm leading-6 text-emerald-800">
              We sent a verification link to{" "}
              <strong>{params.email}</strong>.
              Open the email on this device to finish creating your account.
            </div>

            <div className="mt-5 text-center text-sm text-black/55">
              Already verified?
              {" "}
              <Link
                href={`/login?${loginParams.toString()}`}
                className="font-semibold text-[#6f5936]"
              >
                Sign in
              </Link>
            </div>
          </div>
        ) : (
          <form
            action={
              requestCustomerSignupLinkAction
            }
            className="mt-7 space-y-4"
          >
            <input
              type="hidden"
              name="next"
              value={nextPath}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-semibold">
                  First name
                </span>

                <input
                  name="firstName"
                  required
                  autoComplete="given-name"
                  defaultValue={
                    params.firstName ||
                    ""
                  }
                  className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none focus:border-black/30"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-semibold">
                  Last name
                </span>

                <input
                  name="lastName"
                  autoComplete="family-name"
                  defaultValue={
                    params.lastName ||
                    ""
                  }
                  className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none focus:border-black/30"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Email address
              </span>

              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={
                  params.email || ""
                }
                className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none focus:border-black/30"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Phone
              </span>

              <input
                name="phone"
                type="tel"
                required
                autoComplete="tel"
                defaultValue={
                  params.phone || ""
                }
                placeholder="(818) 555-1234"
                className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none focus:border-black/30"
              />
            </label>

            <button
              type="submit"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#1d1d1b] px-5 text-sm font-semibold text-white transition hover:bg-black"
            >
              Email me a verification link
            </button>
          </form>
        )}

        <div className="mt-7 border-t border-black/10 pt-6 text-center text-sm text-black/55">
          Already have an account or a previous booking?
          {" "}
          <Link
            href={`/login?${loginParams.toString()}`}
            className="font-semibold text-[#6f5936]"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-5 text-center">
          <Link
            href="/catalog"
            className="text-xs font-semibold text-black/45"
          >
            ← Back to rentals
          </Link>
        </div>
      </section>
    </main>
  );
}

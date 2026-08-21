"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type ViewState =
  | "ready"
  | "submitting"
  | "success"
  | "error"
  | "invalid";

function getRecoveryTokens() {
  if (typeof window === "undefined") {
    return {
      accessToken: "",
      refreshToken: "",
      type: "",
    };
  }

  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);

  return {
    accessToken: String(params.get("access_token") || ""),
    refreshToken: String(params.get("refresh_token") || ""),
    type: String(params.get("type") || ""),
  };
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<ViewState>("ready");
  const [message, setMessage] = useState("");

  const recovery = useMemo(() => getRecoveryTokens(), []);

  const isRecoveryTokenPresent =
    recovery.type === "recovery" &&
    recovery.accessToken.length > 0 &&
    recovery.refreshToken.length > 0;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 6) {
      setState("error");
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setState("error");
      setMessage("Password confirmation does not match.");
      return;
    }

    setState("submitting");
    setMessage("");

    const supabase = createClient();

    const currentSessionResult = await supabase.auth.getSession();
    let hasSession = Boolean(currentSessionResult.data.session);

    if (!hasSession && isRecoveryTokenPresent) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: recovery.accessToken,
        refresh_token: recovery.refreshToken,
      });

      if (sessionError) {
        setState("error");
        setMessage("Recovery link is invalid or expired.");
        return;
      }

      hasSession = true;
    }

    if (!hasSession) {
      setState("invalid");
      setMessage("Recovery link is invalid or expired.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setState("error");
      setMessage(error.message || "Failed to update password.");
      return;
    }

    await supabase.auth.signOut();

    setState("success");
    setMessage("Password updated. You can now sign in with your new password.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5efe6] px-5 py-10 text-[#1d1d1b]">
      <section className="w-full max-w-md rounded-[30px] border border-black/10 bg-white p-7 shadow-[0_24px_70px_rgba(0,0,0,0.08)] sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
          Bounce Party LA
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          Set new password
        </h1>

        <p className="mt-3 text-sm leading-6 text-black/60">
          Use the secure link from your email to create a new password.
        </p>

        {message ? (
          <div
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
              state === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm font-semibold">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              disabled={state === "submitting" || state === "success"}
              className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none transition focus:border-black/30 focus:ring-4 focus:ring-black/[0.04]"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={6}
              disabled={state === "submitting" || state === "success"}
              className="h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-base outline-none transition focus:border-black/30 focus:ring-4 focus:ring-black/[0.04]"
            />
          </div>

          <button
            type="submit"
            disabled={state === "submitting" || state === "success"}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#1d1d1b] px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "submitting" ? "Updating..." : "Update password"}
          </button>
        </form>

        <Link
          href="/login"
          className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-black/10 px-5 py-3 text-sm font-semibold text-[#1d1d1b] transition hover:bg-black/[0.03]"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}

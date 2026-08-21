"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function DriverAuthPanel({
  mode,
  email,
}: {
  mode: "signin" | "signedin";
  email?: string | null;
}) {
  const [draftEmail, setDraftEmail] = useState(email || "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const formData = new FormData(event.currentTarget);
      const nextEmail = String(formData.get("email") || draftEmail || "").trim();

      if (!nextEmail) {
        setMessage("Enter your email address.");
        return;
      }

      const supabase = createClient();
      const redirectTo = `${window.location.origin}/driver`;

      const { error } = await supabase.auth.signInWithOtp({
        email: nextEmail,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage("Check your email for the sign-in link.");
      setDraftEmail(nextEmail);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        setMessage(error.message);
        return;
      }

      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  if (mode === "signedin") {
    return (
      <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
          Driver access
        </div>
        <div className="mt-2 text-lg font-semibold text-[#1f1e1b]">
          Signed in{email ? ` as ${email}` : ""}
        </div>
        <p className="mt-2 text-sm leading-6 text-[#6c6258]">
          This account is linked to the driver portal.
        </p>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy}
          className="mt-4 rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Signing out..." : "Sign out"}
        </button>

        {message && <p className="mt-3 text-sm text-[#6c6258]">{message}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
        Driver access
      </div>
      <h2 className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
        Sign in to your route
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#6c6258]">
        Enter the email linked to your driver account. We&apos;ll send a secure magic link.
      </p>

      <form onSubmit={handleSignIn} className="mt-4 grid gap-3">
        <input
          name="email"
          type="email"
          required
          value={draftEmail}
          onChange={(event) => setDraftEmail(event.target.value)}
          placeholder="driver@email.com"
          className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />

        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Sending link..." : "Send sign-in link"}
        </button>
      </form>

      {message && <p className="mt-3 text-sm text-[#6c6258]">{message}</p>}
    </div>
  );
}
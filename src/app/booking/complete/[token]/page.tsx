import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function BookingCompletionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: previewRows } = await supabase.rpc("get_booking_completion_session", {
    raw_token: token,
  });
  const preview = Array.isArray(previewRows) ? previewRows[0] : previewRows;

  if (!preview) {
    return <StatusCard title="Link not found" text="This booking link is invalid or no longer available." />;
  }

  if (preview.status === "expired" || preview.status === "revoked") {
    return <StatusCard title="Reservation expired" text="This temporary reservation is no longer active. Please contact Bounce Party LA." />;
  }

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    const next = `/booking/complete/${encodeURIComponent(token)}`;
    redirect(`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(preview.customer_email || "")}`);
  }

  const { data: claimData, error: claimError } = await supabase.rpc(
    "claim_booking_completion_session",
    { raw_token: token },
  );

  if (claimError) {
    return <StatusCard title="Unable to open booking" text={claimError.message} />;
  }

  const claim = claimData as { success?: boolean; status?: string; booking_id?: string } | null;
  if (claim?.success && claim.booking_id) {
    redirect(`/account/bookings/${claim.booking_id}`);
  }

  if (claim?.status === "email_mismatch") {
    return <StatusCard title="Different account" text="Sign in with the same email address that received this booking link." />;
  }

  return <StatusCard title="Unable to continue" text="This booking cannot be completed from this link. Please contact Bounce Party LA." />;
}

function StatusCard({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5efe6] px-5 py-10 text-[#1d1d1b]">
      <section className="w-full max-w-lg rounded-[30px] border border-black/10 bg-white p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">Bounce Party LA</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-black/60">{text}</p>
        <Link href="/login" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#1d1d1b] px-6 text-sm font-semibold text-white">
          Sign in
        </Link>
      </section>
    </main>
  );
}

import Link from "next/link";

import { requireDriverInterfaceAccess } from "@/lib/auth/require-driver";

export const dynamic = "force-dynamic";

export default async function DriverProfilePage() {
  const { access, linkedDriverRecord } = await requireDriverInterfaceAccess();

  const roleLabel =
    access.role === "driver"
      ? "Driver"
      : access.role
        ? String(access.role)
            .replaceAll("_", " ")
            .replaceAll("-", " ")
            .replace(/\b\w/g, (character) => character.toUpperCase())
        : "Unassigned";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">Driver</div>
        <h1 className="mt-1 text-3xl font-semibold text-[#1f1e1b]">Profile</h1>
        <p className="mt-2 text-sm text-[#6c6258]">Account information linked to this driver login.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[24px] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Display name</div>
          <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">{access.displayName}</div>
        </div>

        <div className="rounded-[24px] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Email</div>
          <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">{access.user?.email || "No email linked"}</div>
        </div>

        <div className="rounded-[24px] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Role</div>
          <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">{roleLabel}</div>
        </div>

        <div className="rounded-[24px] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Driver record</div>
          <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
            {linkedDriverRecord?.name || "Not linked"}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="text-sm font-semibold text-[#1f1e1b]">Links</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/driver/routes"
            className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white"
          >
            Route board
          </Link>
          <Link
            href="/driver/routes/view"
            className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#23313f]"
          >
            Driver view
          </Link>
          <Link
            href="/driver/routes/checklists"
            className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#23313f]"
          >
            Checklist
          </Link>
        </div>
      </section>
    </div>
  );
}
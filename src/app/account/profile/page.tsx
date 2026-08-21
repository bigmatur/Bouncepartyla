import CustomerShell from "@/components/account/CustomerShell";
import { requireCustomerAccess } from "@/lib/auth/require-customer";
import { ROLE_LABELS, isSystemRole } from "@/lib/auth/access-shared";
import { updateCustomerProfileAction } from "./actions";

function roleLabel(role: string | null) {
  if (!role) return "Unassigned";

  if (isSystemRole(role)) {
    return ROLE_LABELS[role];
  }

  return role
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function splitName(profile: any, fallbackDisplayName: string) {
  const first = String(profile?.first_name || "").trim();
  const last = String(profile?.last_name || "").trim();

  if (first || last) {
    return { firstName: first, lastName: last };
  }

  const full = String(profile?.full_name || fallbackDisplayName || "").trim();

  if (!full) {
    return { firstName: "", lastName: "" };
  }

  const parts = full.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");

  return { firstName, lastName };
}

export default async function AccountProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  const profileResult = await supabase.rpc("get_my_customer_profile");
  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  const profile = Array.isArray(profileResult.data) ? profileResult.data[0] : null;
  const canEditOwnProfile = access.role === "customer" && !canPreviewCustomer;
  const nameParts = splitName(profile, access.displayName || "");

  return (
    <CustomerShell
      displayName={access.displayName}
      userEmail={access.user?.email || null}
      role={access.role}
      defaultInterface={access.defaultInterface}
      availableInterfaces={access.availableInterfaces}
      grantedPermissions={access.grantedPermissions}
      previewMode={canPreviewCustomer}
    >
      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-5 sm:py-10">
        <section className="rounded-[22px] border border-black/10 bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:rounded-[30px] sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40">Profile</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:mt-3 sm:text-4xl">Your profile</h1>
          <p className="mt-2 text-sm leading-5 text-black/55 sm:mt-3 sm:leading-6 sm:text-black/60">Contact information used for bookings and notifications.</p>

          {resolvedSearchParams?.saved === "1" ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              Profile updated.
            </div>
          ) : null}

          {resolvedSearchParams?.error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {resolvedSearchParams.error}
            </div>
          ) : null}

          {!canEditOwnProfile ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Profile editing is disabled in preview mode.
            </div>
          ) : null}

          <form action={updateCustomerProfileAction} className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2">
            <label className="rounded-[16px] bg-[#f7f4ef] p-3 sm:rounded-2xl sm:p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">First name</div>
              <input
                name="firstName"
                defaultValue={nameParts.firstName}
                required
                disabled={!canEditOwnProfile}
                className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-semibold outline-none sm:h-11 sm:text-sm focus:border-black/30 focus:ring-2 focus:ring-black/[0.06] disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>

            <label className="rounded-[16px] bg-[#f7f4ef] p-3 sm:rounded-2xl sm:p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Last name</div>
              <input
                name="lastName"
                defaultValue={nameParts.lastName}
                disabled={!canEditOwnProfile}
                className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-semibold outline-none sm:h-11 sm:text-sm focus:border-black/30 focus:ring-2 focus:ring-black/[0.06] disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>

            <label className="rounded-[16px] bg-[#f7f4ef] p-3 sm:rounded-2xl sm:p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Email</div>
              <input
                value={profile?.email || access.user?.email || ""}
                readOnly
                className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-black/[0.03] px-3 text-base font-semibold text-black/65 sm:h-11 sm:text-sm"
              />
            </label>

            <label className="rounded-[16px] bg-[#f7f4ef] p-3 sm:rounded-2xl sm:p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Phone</div>
              <input
                name="phone"
                defaultValue={profile?.phone || ""}
                disabled={!canEditOwnProfile}
                className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-semibold outline-none sm:h-11 sm:text-sm focus:border-black/30 focus:ring-2 focus:ring-black/[0.06] disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>

            <div className="rounded-[16px] bg-[#f7f4ef] p-3 sm:rounded-2xl sm:p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Primary role</div>
              <div className="mt-3 text-sm font-semibold">{roleLabel(access.role)}</div>
            </div>

            <div className="sticky bottom-3 z-10 md:static md:col-span-2">
              <button
                type="submit"
                disabled={!canEditOwnProfile}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#1d1d1b] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,.18)] transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 md:min-h-11 md:w-auto md:shadow-none"
              >
                Save profile
              </button>
            </div>
          </form>
        </section>
      </main>
    </CustomerShell>
  );
}

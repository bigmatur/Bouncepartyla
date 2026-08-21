import { requireAdminPermission } from "@/lib/auth/require-admin";
import { LIVE_BASELINE, SYSTEM_MODULES, type SystemModuleState } from "@/lib/system/developer-portal";

function badge(state: SystemModuleState) {
  if (state === "production") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (state === "testing") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (state === "development") return "bg-blue-50 text-blue-700 ring-blue-200";
  return "bg-neutral-100 text-neutral-600 ring-neutral-200";
}

export default async function SystemDocsPage() {
  await requireAdminPermission("settings.view");

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">Read-only developer portal</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">System Docs</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
          Architecture baseline for the current Bounce Party LA system. This page does not mutate production data. Detailed Markdown documentation lives in the repository <code>/docs</code> folder.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[24px] border border-black/5 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Live baseline</div>
          <div className="mt-2 text-xl font-semibold text-[#1f1e1b]">{LIVE_BASELINE.verifiedAt}</div>
          <div className="mt-1 text-sm text-[#6c6258]">Last manually verified against Supabase</div>
        </div>
        <div className="rounded-[24px] border border-black/5 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Stripe finalizer</div>
          <div className="mt-2 text-sm font-semibold text-[#1f1e1b] break-all">{LIVE_BASELINE.stripeFinalizer}</div>
          <div className="mt-1 text-sm text-[#6c6258]">Route Board writes are outside the mandatory commit</div>
        </div>
        <div className="rounded-[24px] border border-black/5 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Working Time</div>
          <div className="mt-2 text-xl font-semibold text-[#1f1e1b]">{LIVE_BASELINE.workingTimeRpcCount} RPCs</div>
          <div className="mt-1 text-sm text-[#6c6258]">{LIVE_BASELINE.workingTimeTables} confirmed tables</div>
        </div>
        <div className="rounded-[24px] border border-black/5 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">payments.status</div>
          <div className="mt-2 text-xl font-semibold text-[#1f1e1b]">{LIVE_BASELINE.paymentsStatusType}</div>
          <div className="mt-1 text-sm text-[#6c6258]">Confirmed live PostgreSQL type</div>
        </div>
      </section>

      <section className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.025)]">
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Domain ownership</div>
          <h2 className="mt-1 text-2xl font-semibold text-[#1f1e1b]">Module status & source of truth</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e7dfd4] text-xs uppercase tracking-[0.12em] text-[#8b8177]">
                <th className="px-3 py-3">Module</th>
                <th className="px-3 py-3">State</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">Source of truth</th>
                <th className="px-3 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {SYSTEM_MODULES.map((module) => (
                <tr key={module.name} className="border-b border-[#f0eae2] align-top last:border-0">
                  <td className="px-3 py-4 font-semibold text-[#1f1e1b]">{module.name}</td>
                  <td className="px-3 py-4">
                    <span className={["inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", badge(module.state)].join(" ")}>{module.state}</span>
                  </td>
                  <td className="px-3 py-4 text-[#4c443c]">{module.owner}</td>
                  <td className="px-3 py-4 font-mono text-xs text-[#4c443c]">{module.sourceOfTruth}</td>
                  <td className="max-w-md px-3 py-4 leading-6 text-[#6c6258]">{module.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#d8cec0] bg-[#fffdf9] p-6">
        <h2 className="text-xl font-semibold text-[#1f1e1b]">Architecture invariants</h2>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-[#5d554d]">
          <li>• CRM does not create a second Booking, Customer, Lead or Task engine.</li>
          <li>• Notification provider failure cannot roll back a committed business operation.</li>
          <li>• Route Board sync cannot roll back a successful Stripe payment or final booking state.</li>
          <li>• Successful rows in <code>payments</code> are the payment source of truth; tips do not reduce balance.</li>
          <li>• Signed contract documents come from <code>contracts</code>, not only <code>bookings.contract_status</code>.</li>
          <li>• Inventory availability is owned by Inventory/Reservations and must not be duplicated in CRM.</li>
        </ul>
      </section>
    </div>
  );
}

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { listIntegrationSummaries } from "@/lib/integrations/connections";

function statusLabel(status: string) {
  if (status === "connected") return "Connected";
  if (status === "error") return "Error";
  if (status === "disabled") return "Disabled";
  return "Not connected";
}

function statusClass(status: string) {
  if (status === "connected") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (status === "error") return "bg-red-50 text-red-700 ring-1 ring-red-200";
  if (status === "disabled") return "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200";
  return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
}

function formatDate(value: string | null) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function BusinessIntelligenceMetaAnalyticsPage() {
  await requireAdminPermission("dashboard.view");

  const integrations = await listIntegrationSummaries();
  const meta = integrations.find((item) => item.provider === "meta");

  return (
    <div className="space-y-5 pb-10">
      <section className="rounded-[24px] border border-black/5 bg-white px-5 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] sm:px-6">
        <a href="/admin/business-intelligence" className="text-sm font-semibold text-[#9a7a49] hover:text-[#7e623b]">
          ← Back to intelligence
        </a>
        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7a49]">Meta Analytics</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">Meta Ads</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
          Отдельный блок для Meta. Здесь статус подключения и параметры источника данных.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[20px] border border-black/5 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Connection status</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass(meta?.status || "not_connected")}`}>
              {statusLabel(meta?.status || "not_connected")}
            </span>
            <span className="text-sm text-[#6c6258]">Source: {meta?.source || "none"}</span>
          </div>

          <dl className="mt-5 grid gap-3 text-sm text-[#2d2a28] sm:grid-cols-2">
            <div className="rounded-xl bg-[#faf7f3] p-3">
              <dt className="text-xs uppercase tracking-[0.08em] text-[#8a7a69]">Ad account</dt>
              <dd className="mt-1 font-semibold">{String(meta?.publicConfig?.ad_account_id || "Not set")}</dd>
            </div>
            <div className="rounded-xl bg-[#faf7f3] p-3">
              <dt className="text-xs uppercase tracking-[0.08em] text-[#8a7a69]">Graph version</dt>
              <dd className="mt-1 font-semibold">{String(meta?.publicConfig?.graph_version || "Not set")}</dd>
            </div>
            <div className="rounded-xl bg-[#faf7f3] p-3 sm:col-span-2">
              <dt className="text-xs uppercase tracking-[0.08em] text-[#8a7a69]">Last tested</dt>
              <dd className="mt-1 font-semibold">{formatDate(meta?.lastTestedAt || null)}</dd>
            </div>
          </dl>

          {meta?.lastError ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {meta.lastError}
            </div>
          ) : null}
        </div>

        <div className="rounded-[20px] border border-black/5 bg-white p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Actions</div>
          <div className="mt-3 space-y-2.5">
            <a
              href="/admin/settings/integrations"
              className="flex items-center justify-between rounded-xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              <span>Open integrations</span>
              <span>↗</span>
            </a>
            <a
              href="https://adsmanager.facebook.com/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              <span>Open Meta Ads Manager</span>
              <span>↗</span>
            </a>
          </div>
          <p className="mt-4 text-xs leading-5 text-[#7d7267]">
            Финальные KPI из Meta API добавляются в этот же блок, чтобы не смешивать их с dashboard.
          </p>
        </div>
      </section>
    </div>
  );
}

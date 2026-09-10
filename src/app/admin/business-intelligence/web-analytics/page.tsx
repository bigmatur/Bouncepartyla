import { requireAdminPermission } from "@/lib/auth/require-admin";
import { loadGa4Analytics } from "@/lib/analytics/ga4";

function isoDate(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function BusinessIntelligenceWebAnalyticsPage() {
  await requireAdminPermission("dashboard.view");

  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - 29);

  const analytics = await loadGa4Analytics({ from: isoDate(from), to: isoDate(to) });

  return (
    <div className="space-y-5 pb-10">
      <section className="rounded-[24px] border border-black/5 bg-white px-5 py-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] sm:px-6">
        <a href="/admin/business-intelligence" className="text-sm font-semibold text-[#9a7a49] hover:text-[#7e623b]">
          ← Back to intelligence
        </a>
        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7a49]">Web Analytics</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">Google Analytics 4</h1>
        <p className="mt-2 text-sm text-[#6c6258]">Данные за последние 30 дней.</p>
      </section>

      {!analytics.available ? (
        <section className="rounded-[20px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {analytics.error || "Google Analytics data is currently unavailable."}
          <div className="mt-3">
            <a href="/admin/settings/integrations" className="font-semibold underline">
              Open integrations
            </a>
          </div>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-[16px] border border-black/5 bg-white p-4"><div className="text-xs text-[#7d7267]">Active users</div><div className="mt-1 text-2xl font-semibold text-[#1f1e1b]">{analytics.overview.activeUsers.toLocaleString("en-US")}</div></div>
            <div className="rounded-[16px] border border-black/5 bg-white p-4"><div className="text-xs text-[#7d7267]">Sessions</div><div className="mt-1 text-2xl font-semibold text-[#1f1e1b]">{analytics.overview.sessions.toLocaleString("en-US")}</div></div>
            <div className="rounded-[16px] border border-black/5 bg-white p-4"><div className="text-xs text-[#7d7267]">Page views</div><div className="mt-1 text-2xl font-semibold text-[#1f1e1b]">{analytics.overview.pageViews.toLocaleString("en-US")}</div></div>
            <div className="rounded-[16px] border border-black/5 bg-white p-4"><div className="text-xs text-[#7d7267]">Engagement</div><div className="mt-1 text-2xl font-semibold text-[#1f1e1b]">{percent(analytics.overview.engagementRate)}</div></div>
          </section>

          <section className="rounded-[20px] border border-black/5 bg-white p-5">
            <h2 className="text-lg font-semibold text-[#1f1e1b]">Top pages</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-[#8a7a69]">
                  <tr>
                    <th className="px-2 py-2">Page</th>
                    <th className="px-2 py-2">Views</th>
                    <th className="px-2 py-2">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topPages.map((row, index) => (
                    <tr key={`${row.name}-${index}`} className="border-t border-[#efe6dc]">
                      <td className="px-2 py-2 text-[#2d2a28]">{row.name}</td>
                      <td className="px-2 py-2 text-[#2d2a28]">{Number(row.pageViews || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-2 text-[#2d2a28]">{Number(row.users || 0).toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[20px] border border-black/5 bg-white p-5">
            <h2 className="text-lg font-semibold text-[#1f1e1b]">UTM campaigns</h2>
            <div className="mt-2 text-sm text-[#6c6258]">Сессии и пользователи по campaign/source/medium.</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-[#8a7a69]">
                  <tr>
                    <th className="px-2 py-2">Campaign</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">Medium</th>
                    <th className="px-2 py-2">Sessions</th>
                    <th className="px-2 py-2">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.utm.map((row, index) => (
                    <tr key={`${row.campaign}-${row.source}-${row.medium}-${index}`} className="border-t border-[#efe6dc]">
                      <td className="px-2 py-2 text-[#2d2a28]">{row.campaign}</td>
                      <td className="px-2 py-2 text-[#2d2a28]">{row.source}</td>
                      <td className="px-2 py-2 text-[#2d2a28]">{row.medium}</td>
                      <td className="px-2 py-2 text-[#2d2a28]">{Number(row.sessions || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-2 text-[#2d2a28]">{Number(row.users || 0).toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

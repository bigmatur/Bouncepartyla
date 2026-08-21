import StaffTimeClockCard from "@/components/staff/StaffTimeClockCard";
import StaffTimeHistory from "@/components/staff/StaffTimeHistory";
import { requireDriverInterfaceAccess } from "@/lib/auth/require-driver";
import { getMyStaffTimeDashboard } from "@/lib/staff-time/dashboard";

export const dynamic = "force-dynamic";

export default async function DriverTimePage() {
  const { supabase } = await requireDriverInterfaceAccess();
  const dashboard = await getMyStaffTimeDashboard(supabase);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
          Driver
        </div>
        <h1 className="mt-1 text-3xl font-semibold text-[#1f1e1b]">
          My Time
        </h1>
      </div>

      <StaffTimeClockCard
        entry={dashboard.current}
        source="driver_route"
      />
      <StaffTimeHistory rows={dashboard.history} />
    </div>
  );
}

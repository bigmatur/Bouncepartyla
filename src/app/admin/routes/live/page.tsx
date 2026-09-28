import { requireAdminPermission } from "@/lib/auth/require-admin";
import DriverLiveDashboard from "./DriverLiveDashboard";
import { loadDriverLiveDashboardData } from "./loadDriverLiveDashboardData";

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default async function AdminRoutesLivePage({
  searchParams,
}: {
  searchParams?: Promise<{
    date?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedDate = String(resolvedSearchParams?.date || todayISO());

  const { supabase } = await requireAdminPermission("routes.view");

  const googleMapsApiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    "";

  const drivers = await loadDriverLiveDashboardData({
    supabase,
    selectedDate,
  });

  return (
    <DriverLiveDashboard
      selectedDate={selectedDate}
      googleMapsApiKey={googleMapsApiKey}
      drivers={drivers}
      variant="full"
    />
  );
}

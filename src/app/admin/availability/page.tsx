import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getQuickCheckInventorySnapshot } from "@/lib/booking/quick-check-inventory-snapshot";
import { normalizeLosAngelesDateInput } from "@/lib/date-time/los-angeles-day-window";
import AvailabilityQuickCheckClient from "./AvailabilityQuickCheckClient";

type PageProps = {
  searchParams?: Promise<{
    date?: string;
    start?: string;
    end?: string;
  }>;
};

function isValidTimeString(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function normalizeTimeInput(rawValue: string | undefined, fallback: string) {
  const value = String(rawValue || "").trim();

  if (!isValidTimeString(value)) {
    return fallback;
  }

  return value;
}

export default async function AdminAvailabilityPage(props: PageProps) {
  const searchParams = await props.searchParams;

  const selectedDate = normalizeLosAngelesDateInput(searchParams?.date);
  const eventStartTime = normalizeTimeInput(searchParams?.start, "09:00");
  const eventEndTime = normalizeTimeInput(searchParams?.end, "21:00");

  const { supabase, access } = await requireAdminPermission("bookings.view");
  const canCreateBooking = access.can("bookings.create");

  const initialSnapshot = await getQuickCheckInventorySnapshot({
    supabase,
    eventDate: selectedDate,
    eventStartTime,
    eventEndTime,
    bookingActor: "cashier",
  }).catch((error: any) => {
    return {
      ok: false,
      message: String(error?.message || "Could not load inventory availability snapshot."),
      categories: [],
      items: [],
      selectedDate,
      eventStartTime,
      eventEndTime,
      bookingActor: "cashier" as const,
    };
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f7efe4_0%,_#f3f6f8_55%,_#ecf0f2_100%)] p-3 sm:p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <AvailabilityQuickCheckClient
          canCreateBooking={canCreateBooking}
          initialSnapshot={initialSnapshot}
        />
      </div>
    </main>
  );
}
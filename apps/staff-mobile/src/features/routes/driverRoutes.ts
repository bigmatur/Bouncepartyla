import { supabase } from "../../lib/supabase";

export type MobileDriverProfile = {
  id: string;
  name: string;
  phone: string | null;
  color: string | null;
};

export type MobileRouteStop = {
  id: string;
  booking_id: string | null;
  stop_date: string | null;
  stop_type: string | null;
  status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  driver_name: string | null;
  truck_name: string | null;
  items_summary: string | null;
  setup_notes: string | null;
  balance_due: number | string | null;
  payment_collected: boolean | null;
  sort_order: number | null;
};

export type TodayDriverRoute = {
  driver: MobileDriverProfile;
  date: string;
  stops: MobileRouteStop[];
};

function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isCompletedStop(stop: MobileRouteStop) {
  const status = String(stop.status || "").toLowerCase();
  return ["installed", "picked_up", "completed"].includes(status);
}

export async function loadTodayDriverRoute(): Promise<TodayDriverRoute> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!user) {
    throw new Error("Your staff session has expired. Please sign in again.");
  }

  const driverResult = await supabase
    .from("route_drivers")
    .select("id, name, phone, color")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (driverResult.error) {
    throw new Error(driverResult.error.message);
  }

  if (!driverResult.data) {
    throw new Error(
      "This account is not linked to an active driver profile. Ask an administrator to link the staff account.",
    );
  }

  const date = localDateISO();

  const stopsResult = await supabase
    .from("route_stops")
    .select(
      "id, booking_id, stop_date, stop_type, status, customer_name, customer_phone, address, city, state, zip, scheduled_start_time, scheduled_end_time, driver_name, truck_name, items_summary, setup_notes, balance_due, payment_collected, sort_order",
    )
    .eq("stop_date", date)
    .eq("driver_name", driverResult.data.name)
    .in("stop_type", ["delivery", "pickup"])
    .order("scheduled_start_time", { ascending: true })
    .order("sort_order", { ascending: true });

  if (stopsResult.error) {
    throw new Error(stopsResult.error.message);
  }

  return {
    driver: driverResult.data,
    date,
    stops: (stopsResult.data || []) as MobileRouteStop[],
  };
}

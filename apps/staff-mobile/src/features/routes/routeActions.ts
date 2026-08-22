import { supabase } from "../../lib/supabase";
import type { MobileRouteStop } from "./driverRoutes";

export type MobileRouteStopStatus =
  | "on_the_way"
  | "arrived"
  | "installed"
  | "picked_up"
  | "completed";

export function nextRouteAction(stop: MobileRouteStop): {
  label: string;
  status: MobileRouteStopStatus | null;
} {
  const status = String(stop.status || "").toLowerCase();
  const stopType = String(stop.stop_type || "").toLowerCase();

  if (["installed", "picked_up", "completed"].includes(status)) {
    return { label: "Completed", status: null };
  }

  if (status === "on_the_way") {
    return { label: "Arrived", status: "arrived" };
  }

  if (status === "arrived") {
    return stopType === "pickup"
      ? { label: "Complete pickup", status: "picked_up" }
      : { label: "Complete delivery", status: "installed" };
  }

  return { label: "Start navigation", status: "on_the_way" };
}

export async function updateMyRouteStopStatus(
  stopId: string,
  status: MobileRouteStopStatus,
) {
  const result = await supabase.rpc("update_my_route_stop_status", {
    p_stop_id: stopId,
    p_status: status,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

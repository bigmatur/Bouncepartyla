import { useEffect } from "react";
import * as Location from "expo-location";

import { supabase } from "../../lib/supabase";

function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function DriverLocationTracker() {
  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let lastUploadedAt = 0;

    async function start() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled || userError || !user) return;

      const driverResult = await supabase
        .from("route_drivers")
        .select("name")
        .eq("auth_user_id", user.id)
        .eq("active", true)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled || driverResult.error || !driverResult.data?.name) return;

      const permission = await Location.requestForegroundPermissionsAsync();

      if (cancelled || permission.status !== "granted") return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (position) => {
          const now = Date.now();

          // Avoid flooding the database when iOS/Android emits several updates
          // very close together. Route Board only needs a fresh operational ping.
          if (now - lastUploadedAt < 5000) return;
          lastUploadedAt = now;

          const coords = position.coords;

          void supabase.from("driver_location_pings").insert({
            driver_name: driverResult.data.name,
            route_date: localDateISO(),
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: finiteOrNull(coords.accuracy),
            heading: finiteOrNull(coords.heading),
            speed: finiteOrNull(coords.speed),
          });
        },
      );
    }

    void start();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return null;
}

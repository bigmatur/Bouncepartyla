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

type StaffTimeDashboard = {
  current?: {
    id?: string | null;
    clock_out_at?: string | null;
  } | null;
};

export function DriverLocationTracker() {
  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let reconcileTimer: ReturnType<typeof setInterval> | null = null;
    let lastUploadedAt = 0;
    let driverName = "";
    let permissionGranted = false;

    async function stopWatching() {
      subscription?.remove();
      subscription = null;
    }

    async function uploadPosition(position: Location.LocationObject) {
      if (!driverName || cancelled) return;

      const now = Date.now();

      // Avoid flooding the database when iOS/Android emits several updates
      // very close together. Route Board only needs a fresh operational ping.
      if (now - lastUploadedAt < 5000) return;
      lastUploadedAt = now;

      const coords = position.coords;
      const result = await supabase.from("driver_location_pings").insert({
        driver_name: driverName,
        route_date: localDateISO(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: finiteOrNull(coords.accuracy),
        heading: finiteOrNull(coords.heading),
        speed: finiteOrNull(coords.speed),
      });

      if (result.error) {
        console.warn("Driver GPS ping failed", result.error.message);
      }
    }

    async function ensureWatching() {
      if (cancelled || subscription || !driverName) return;

      if (!permissionGranted) {
        const permission = await Location.requestForegroundPermissionsAsync();

        if (cancelled || permission.status !== "granted") return;
        permissionGranted = true;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (position) => {
          void uploadPosition(position);
        },
      );
    }

    async function reconcileTrackingState() {
      if (cancelled || !driverName) return;

      const dashboardResult = await supabase.rpc("get_my_staff_time_dashboard", {
        p_limit: 1,
      });

      if (cancelled || dashboardResult.error) return;

      const dashboard = (dashboardResult.data || null) as StaffTimeDashboard | null;
      const hasOpenShift = Boolean(
        dashboard?.current?.id && !dashboard.current.clock_out_at,
      );

      if (hasOpenShift) {
        await ensureWatching();
      } else {
        await stopWatching();
      }
    }

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

      driverName = String(driverResult.data.name).trim();
      await reconcileTrackingState();

      reconcileTimer = setInterval(() => {
        void reconcileTrackingState();
      }, 15000);
    }

    void start();

    return () => {
      cancelled = true;

      if (reconcileTimer) {
        clearInterval(reconcileTimer);
      }

      subscription?.remove();
      subscription = null;
    };
  }, []);

  return null;
}

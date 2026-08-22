import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  isCompletedStop,
  loadTodayDriverRoute,
  type MobileRouteStop,
  type TodayDriverRoute,
} from "../features/routes/driverRoutes";
import {
  nextRouteAction,
  updateMyRouteStopStatus,
} from "../features/routes/routeActions";
import { supabase } from "../lib/supabase";

function formatTime(value: string | null) {
  if (!value) return "--";

  const parts = value.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1] || 0);

  if (!Number.isFinite(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function stopLabel(stop: MobileRouteStop) {
  return String(stop.stop_type || "stop").toLowerCase() === "pickup"
    ? "Pickup"
    : "Delivery";
}

function addressText(stop: MobileRouteStop) {
  return [stop.address, stop.city, stop.state, stop.zip].filter(Boolean).join(", ");
}

export function HomeScreen() {
  const [route, setRoute] = useState<TodayDriverRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState("");

  const loadRoute = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    mode === "refresh" ? setRefreshing(true) : setLoading(true);
    setError("");

    try {
      setRoute(await loadTodayDriverRoute());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load today's route.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadRoute();
  }, [loadRoute]);

  const completedCount = useMemo(
    () => route?.stops.filter(isCompletedStop).length || 0,
    [route],
  );

  const activeStop = useMemo(
    () => route?.stops.find((stop) => !isCompletedStop(stop)) || null,
    [route],
  );

  const activeAction = activeStop ? nextRouteAction(activeStop) : null;

  const runActiveAction = useCallback(async () => {
    if (!activeStop || !activeAction?.status || actionPending) return;

    setActionPending(true);
    setError("");

    try {
      await updateMyRouteStopStatus(activeStop.id, activeAction.status);
      await loadRoute("refresh");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Could not update the route stop.",
      );
    } finally {
      setActionPending(false);
    }
  }, [activeAction?.status, activeStop, actionPending, loadRoute]);

  if (loading && !route) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#23313f" />
        <Text style={styles.loadingText}>Loading today's route…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadRoute("refresh")}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>
          <Text style={styles.title}>Today's Route</Text>
          <Text style={styles.subtitle}>
            {route?.driver.name || "Driver"}
            {route?.date ? ` · ${route.date}` : ""}
          </Text>
        </View>

        <Pressable
          onPress={() => void supabase.auth.signOut()}
          style={({ pressed }) => [styles.signOut, pressed ? styles.pressed : null]}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Action unavailable</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {route ? (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{route.stops.length}</Text>
              <Text style={styles.statLabel}>Stops</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{completedCount}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {Math.max(route.stops.length - completedCount, 0)}
              </Text>
              <Text style={styles.statLabel}>Remaining</Text>
            </View>
          </View>

          {activeStop ? (
            <View style={styles.currentCard}>
              <View style={styles.currentTopRow}>
                <Text style={styles.cardLabel}>CURRENT STOP</Text>
                <Text style={styles.typePill}>{stopLabel(activeStop)}</Text>
              </View>

              <Text style={styles.currentTime}>
                {formatTime(activeStop.scheduled_start_time)}
              </Text>
              <Text style={styles.currentCustomer}>
                {activeStop.customer_name || "Customer"}
              </Text>
              <Text style={styles.currentAddress}>
                {addressText(activeStop) || "Address not available"}
              </Text>

              {activeStop.items_summary ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>EQUIPMENT</Text>
                  <Text style={styles.detailText}>{activeStop.items_summary}</Text>
                </View>
              ) : null}

              {activeStop.setup_notes ? (
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>NOTES</Text>
                  <Text style={styles.detailText}>{activeStop.setup_notes}</Text>
                </View>
              ) : null}

              <Pressable
                disabled={!activeAction?.status || actionPending}
                onPress={() => void runActiveAction()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed ? styles.pressed : null,
                  actionPending ? styles.primaryButtonBusy : null,
                ]}
              >
                {actionPending ? (
                  <ActivityIndicator color="#23313f" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {activeAction?.label || "Continue"}
                  </Text>
                )}
              </Pressable>

              <Text style={styles.actionHint}>
                Starting the first route action also starts the driver's work shift.
              </Text>
            </View>
          ) : (
            <View style={styles.completeCard}>
              <Text style={styles.completeTitle}>
                {route.stops.length > 0 ? "Route completed" : "No route assigned"}
              </Text>
              <Text style={styles.completeText}>
                {route.stops.length > 0
                  ? "All assigned delivery and pickup stops are complete."
                  : "There are no delivery or pickup stops assigned to you for today."}
              </Text>
            </View>
          )}

          {route.stops.length > 0 ? (
            <View style={styles.listSection}>
              <Text style={styles.sectionTitle}>All Stops</Text>
              {route.stops.map((stop, index) => {
                const completed = isCompletedStop(stop);
                return (
                  <View key={stop.id} style={styles.stopRow}>
                    <View style={[styles.sequence, completed ? styles.sequenceDone : null]}>
                      <Text style={styles.sequenceText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stopCopy}>
                      <View style={styles.stopTitleRow}>
                        <Text style={styles.stopTitle} numberOfLines={1}>
                          {stop.customer_name || stopLabel(stop)}
                        </Text>
                        <Text style={styles.stopTime}>
                          {formatTime(stop.scheduled_start_time)}
                        </Text>
                      </View>
                      <Text style={styles.stopMeta} numberOfLines={1}>
                        {stopLabel(stop)} · {addressText(stop) || "No address"}
                      </Text>
                      <Text style={[styles.stopStatus, completed ? styles.stopStatusDone : null]}>
                        {completed ? "Completed" : String(stop.status || "Scheduled")}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: { paddingHorizontal: 18, paddingTop: 64, paddingBottom: 48 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f1e8",
    padding: 24,
  },
  loadingText: { marginTop: 14, color: "#6c6258", fontSize: 14 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#b88645", fontSize: 11, fontWeight: "800", letterSpacing: 1.7 },
  title: { color: "#23313f", fontSize: 31, fontWeight: "800", marginTop: 6 },
  subtitle: { color: "#6c6258", fontSize: 14, marginTop: 6 },
  signOut: {
    borderColor: "#d1c8bb",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  signOutText: { color: "#23313f", fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.68 },
  errorCard: {
    backgroundColor: "#fff1f0",
    borderColor: "#efb7b3",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 22,
    padding: 16,
  },
  errorTitle: { color: "#8c2e2a", fontSize: 16, fontWeight: "800" },
  errorText: { color: "#7a4844", fontSize: 13, lineHeight: 19, marginTop: 6 },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 24 },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  statValue: { color: "#23313f", fontSize: 24, fontWeight: "800" },
  statLabel: { color: "#81766a", fontSize: 11, fontWeight: "700", marginTop: 3 },
  currentCard: { backgroundColor: "#23313f", borderRadius: 26, marginTop: 18, padding: 20 },
  currentTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: { color: "#f0c987", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  typePill: {
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  currentTime: { color: "#f0c987", fontSize: 17, fontWeight: "800", marginTop: 22 },
  currentCustomer: { color: "#ffffff", fontSize: 27, fontWeight: "800", marginTop: 4 },
  currentAddress: { color: "rgba(255,255,255,0.76)", fontSize: 14, lineHeight: 20, marginTop: 7 },
  detailBlock: { borderTopColor: "rgba(255,255,255,0.12)", borderTopWidth: 1, marginTop: 18, paddingTop: 14 },
  detailLabel: { color: "#f0c987", fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  detailText: { color: "rgba(255,255,255,0.88)", fontSize: 13, lineHeight: 19, marginTop: 5 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#f0c987",
    borderRadius: 16,
    marginTop: 20,
    minHeight: 52,
    justifyContent: "center",
    paddingVertical: 15,
  },
  primaryButtonBusy: { opacity: 0.75 },
  primaryButtonText: { color: "#23313f", fontSize: 15, fontWeight: "900" },
  actionHint: { color: "rgba(255,255,255,0.58)", fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: "center" },
  completeCard: { backgroundColor: "#ffffff", borderRadius: 24, marginTop: 18, padding: 20 },
  completeTitle: { color: "#23313f", fontSize: 21, fontWeight: "800" },
  completeText: { color: "#6c6258", fontSize: 14, lineHeight: 21, marginTop: 7 },
  listSection: { marginTop: 28 },
  sectionTitle: { color: "#23313f", fontSize: 19, fontWeight: "800", marginBottom: 12 },
  stopRow: { flexDirection: "row", backgroundColor: "#ffffff", borderRadius: 18, marginBottom: 10, padding: 14 },
  sequence: { alignItems: "center", justifyContent: "center", backgroundColor: "#23313f", borderRadius: 14, height: 38, width: 38 },
  sequenceDone: { backgroundColor: "#82927e" },
  sequenceText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  stopCopy: { flex: 1, marginLeft: 12 },
  stopTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  stopTitle: { flex: 1, color: "#23313f", fontSize: 15, fontWeight: "800" },
  stopTime: { color: "#6c6258", fontSize: 12, fontWeight: "700" },
  stopMeta: { color: "#81766a", fontSize: 12, marginTop: 4 },
  stopStatus: { color: "#a16a2c", fontSize: 11, fontWeight: "800", marginTop: 7, textTransform: "capitalize" },
  stopStatusDone: { color: "#5f735c" },
});

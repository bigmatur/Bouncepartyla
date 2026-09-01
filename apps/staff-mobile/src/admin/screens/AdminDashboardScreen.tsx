import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { supabase } from "../../lib/supabase";

type DashboardStats = {
  bookingsToday: number;
  deliveriesToday: number;
  pickupsToday: number;
  balanceDue: number;
  activeBookings: number;
  inventoryAvailable: number;
};

const EMPTY: DashboardStats = {
  bookingsToday: 0,
  deliveriesToday: 0,
  pickupsToday: 0,
  balanceDue: 0,
  activeBookings: 0,
  inventoryAvailable: 0,
};

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function AdminDashboardScreen({ displayName }: { displayName: string }) {
  const [stats, setStats] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(localDate, []);

  const load = useCallback(async () => {
    setError(null);

    const [bookingsResult, routesResult, inventoryResult] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, event_date, status, balance_due, archived_at")
        .order("event_date", { ascending: false })
        .limit(500),
      supabase.from("route_stops").select("id, stop_type, stop_date, status").eq("stop_date", today),
      supabase.from("inventory_units").select("id, status"),
    ]);

    const firstError = bookingsResult.error || routesResult.error || inventoryResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }

    const bookings = (bookingsResult.data || []) as any[];
    const routes = (routesResult.data || []) as any[];
    const inventory = (inventoryResult.data || []) as any[];
    const active = bookings.filter((booking) => {
      const status = String(booking.status || "").toLowerCase();
      return !booking.archived_at && status !== "archived" && status !== "cancelled";
    });

    setStats({
      bookingsToday: active.filter((booking) => booking.event_date === today).length,
      deliveriesToday: routes.filter((stop) => String(stop.stop_type).toLowerCase() === "delivery").length,
      pickupsToday: routes.filter((stop) => String(stop.stop_type).toLowerCase() === "pickup").length,
      balanceDue: active.reduce((sum, booking) => sum + Number(booking.balance_due || 0), 0),
      activeBookings: active.length,
      inventoryAvailable: inventory.filter((unit) => String(unit.status).toLowerCase() === "available").length,
    });
  }, [today]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#23313f" />}
    >
      <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>{displayName}</Text>

      {loading ? (
        <View style={styles.loadingCard}><ActivityIndicator color="#23313f" /></View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not load dashboard</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={refresh} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      ) : (
        <>
          <View style={styles.grid}>
            <Metric label="Bookings today" value={String(stats.bookingsToday)} />
            <Metric label="Deliveries today" value={String(stats.deliveriesToday)} />
            <Metric label="Pickups today" value={String(stats.pickupsToday)} />
            <Metric label="Balance due" value={money(stats.balanceDue)} />
          </View>

          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.card}>
            <OverviewRow label="Active bookings" value={String(stats.activeBookings)} />
            <View style={styles.divider} />
            <OverviewRow label="Available inventory units" value={String(stats.inventoryAvailable)} />
            <View style={styles.divider} />
            <OverviewRow label="Route stops today" value={String(stats.deliveriesToday + stats.pickupsToday)} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: { paddingHorizontal: 18, paddingTop: 62, paddingBottom: 120 },
  eyebrow: { color: "#b88645", fontSize: 11, fontWeight: "900", letterSpacing: 1.7 },
  title: { color: "#23313f", fontSize: 32, fontWeight: "900", marginTop: 6 },
  subtitle: { color: "#81766a", fontSize: 13, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 22 },
  metric: { backgroundColor: "#ffffff", borderRadius: 20, minHeight: 118, padding: 16, width: "48%" },
  metricValue: { color: "#23313f", fontSize: 24, fontWeight: "900" },
  metricLabel: { color: "#6c6258", fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 8 },
  sectionTitle: { color: "#23313f", fontSize: 18, fontWeight: "900", marginTop: 24, marginBottom: 10 },
  card: { backgroundColor: "#ffffff", borderRadius: 22, paddingHorizontal: 16 },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 52 },
  rowLabel: { color: "#6c6258", fontSize: 13, fontWeight: "700" },
  rowValue: { color: "#23313f", fontSize: 14, fontWeight: "900" },
  divider: { backgroundColor: "#ebe5dc", height: 1 },
  loadingCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 22, justifyContent: "center", marginTop: 22, minHeight: 160 },
  errorCard: { backgroundColor: "#fff1f0", borderRadius: 22, marginTop: 22, padding: 18 },
  errorTitle: { color: "#8c2e2a", fontSize: 16, fontWeight: "900" },
  errorText: { color: "#7a4844", fontSize: 12, lineHeight: 18, marginTop: 6 },
  retryButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#23313f", borderRadius: 14, justifyContent: "center", marginTop: 14, minHeight: 42, paddingHorizontal: 18 },
  retryText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
});

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

type DashboardBooking = {
  id: string;
  booking_number?: string | null;
  event_date?: string | null;
  event_start_time?: string | null;
  status?: string | null;
  balance_due?: number | string | null;
  payment_status?: string | null;
  customers?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
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

export function AdminDashboardScreen({
  displayName,
  grantedPermissions,
  onOpenBookings,
  onOpenAvailability,
  onOpenRoutes,
  onOpenNotifications,
}: {
  displayName: string;
  grantedPermissions: string[];
  onOpenBookings?: () => void;
  onOpenAvailability?: () => void;
  onOpenRoutes?: () => void;
  onOpenNotifications?: () => void;
}) {
  const [stats, setStats] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<DashboardBooking[]>([]);
  const [unassignedStops, setUnassignedStops] = useState(0);
  const today = useMemo(localDate, []);
  const can = useCallback(
    (permission: string) =>
      grantedPermissions.length === 0 || grantedPermissions.includes(permission),
    [grantedPermissions],
  );
  const canViewBookings = can("bookings.view");
  const canViewFinancials = can("bookings.view_financials");
  const canViewRoutes = can("routes.view");
  const canViewInventory = can("inventory.view");

  const load = useCallback(async () => {
    setError(null);

    const [bookingsResult, routesResult, inventoryResult] = await Promise.all([
      canViewBookings
        ? supabase
        .from("bookings")
        .select("id, booking_number, event_date, event_start_time, status, balance_due, payment_status, archived_at, customers(full_name)")
        .order("event_date", { ascending: false })
        .limit(500)
        : Promise.resolve({ data: [], error: null }),
      canViewRoutes
        ? supabase.from("route_stops").select("id, stop_type, stop_date, status, driver_name").eq("stop_date", today)
        : Promise.resolve({ data: [], error: null }),
      canViewInventory
        ? supabase.from("inventory_units").select("id, status")
        : Promise.resolve({ data: [], error: null }),
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
      balanceDue: canViewFinancials
        ? active.reduce((sum, booking) => sum + Number(booking.balance_due || 0), 0)
        : 0,
      activeBookings: active.length,
      inventoryAvailable: inventory.filter((unit) => String(unit.status).toLowerCase() === "available").length,
    });
    setUpcomingBookings(
      active
        .filter((booking) => String(booking.event_date || "") >= today)
        .sort((left, right) => {
          const leftKey = `${left.event_date || ""}T${left.event_start_time || "00:00"}`;
          const rightKey = `${right.event_date || ""}T${right.event_start_time || "00:00"}`;
          return leftKey.localeCompare(rightKey);
        })
        .slice(0, 5),
    );
    setUnassignedStops(
      routes.filter((stop) => {
        const driver = String(stop.driver_name || "").trim().toLowerCase();
        return !driver || driver === "unassigned";
      }).length,
    );
  }, [canViewBookings, canViewFinancials, canViewInventory, canViewRoutes, today]);

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

      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.quickGrid}>
        {canViewBookings ? <QuickAction label="Check availability" detail="Date, time and stock" onPress={onOpenAvailability} accent /> : null}
        {canViewBookings ? <QuickAction label="Open bookings" detail="Payments and customers" onPress={onOpenBookings} /> : null}
        {canViewRoutes ? <QuickAction label="Run routes" detail="Drivers and stops" onPress={onOpenRoutes} /> : null}
        <QuickAction label="Notifications" detail="New operational alerts" onPress={onOpenNotifications} />
      </View>

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
            {canViewBookings ? <Metric label="Bookings today" value={String(stats.bookingsToday)} /> : null}
            {canViewRoutes ? <Metric label="Deliveries today" value={String(stats.deliveriesToday)} /> : null}
            {canViewRoutes ? <Metric label="Pickups today" value={String(stats.pickupsToday)} /> : null}
            {canViewFinancials ? <Metric label="Balance due" value={money(stats.balanceDue)} /> : null}
          </View>

          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.card}>
            {canViewBookings ? <OverviewRow label="Active bookings" value={String(stats.activeBookings)} /> : null}
            {canViewBookings && (canViewInventory || canViewRoutes) ? <View style={styles.divider} /> : null}
            {canViewInventory ? <OverviewRow label="Available inventory units" value={String(stats.inventoryAvailable)} /> : null}
            {canViewInventory && canViewRoutes ? <View style={styles.divider} /> : null}
            {canViewRoutes ? <OverviewRow label="Route stops today" value={String(stats.deliveriesToday + stats.pickupsToday)} /> : null}
          </View>

          {(unassignedStops > 0 || (canViewFinancials && stats.balanceDue > 0)) ? (
            <>
              <Text style={styles.sectionTitle}>Needs attention</Text>
              <View style={styles.attentionCard}>
                {unassignedStops > 0 ? (
                  <Pressable onPress={onOpenRoutes} style={styles.attentionRow}>
                    <View style={styles.alertDot} />
                    <View style={styles.attentionText}><Text style={styles.attentionTitle}>{unassignedStops} unassigned route stop{unassignedStops === 1 ? "" : "s"}</Text><Text style={styles.attentionDetail}>Assign a driver before dispatch.</Text></View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ) : null}
                {canViewFinancials && stats.balanceDue > 0 ? (
                  <Pressable onPress={onOpenBookings} style={styles.attentionRow}>
                    <View style={[styles.alertDot, styles.moneyDot]} />
                    <View style={styles.attentionText}><Text style={styles.attentionTitle}>{money(stats.balanceDue)} outstanding</Text><Text style={styles.attentionDetail}>Review open customer balances.</Text></View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}

          {canViewBookings ? (
            <>
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Next bookings</Text><Pressable onPress={onOpenBookings}><Text style={styles.viewAll}>VIEW ALL</Text></Pressable></View>
              <View style={styles.card}>
                {upcomingBookings.length === 0 ? <Text style={styles.emptyText}>No upcoming bookings.</Text> : upcomingBookings.map((booking, index) => {
                  const customer = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers;
                  return <View key={booking.id}>{index > 0 ? <View style={styles.divider} /> : null}<View style={styles.bookingRow}><View style={styles.dateBadge}><Text style={styles.dateBadgeDay}>{String(booking.event_date || "").slice(-2)}</Text><Text style={styles.dateBadgeMonth}>{monthLabel(booking.event_date)}</Text></View><View style={styles.bookingMain}><Text style={styles.bookingTitle}>#{booking.booking_number || booking.id.slice(0, 8)} · {customer?.full_name || "Customer"}</Text><Text style={styles.bookingMeta}>{formatBookingTime(booking.event_start_time)} · {String(booking.status || "open").replace(/_/g, " ")}</Text></View>{Number(booking.balance_due || 0) > 0 ? <Text style={styles.bookingBalance}>{money(Number(booking.balance_due || 0))}</Text> : <Text style={styles.paid}>PAID</Text>}</View></View>;
                })}
              </View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function monthLabel(value: string | null | undefined) {
  if (!value) return "---";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "---" : new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase();
}

function formatBookingTime(value: string | null | undefined) {
  if (!value) return "Time not set";
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return value;
  return `${hour % 12 || 12}:${minuteRaw || "00"} ${hour >= 12 ? "PM" : "AM"}`;
}

function QuickAction({ label, detail, onPress, accent = false }: { label: string; detail: string; onPress?: () => void; accent?: boolean }) {
  return <Pressable onPress={onPress} style={[styles.quickAction, accent ? styles.quickActionAccent : null]}><Text style={[styles.quickTitle, accent ? styles.quickTitleAccent : null]}>{label}</Text><Text style={[styles.quickDetail, accent ? styles.quickDetailAccent : null]}>{detail}</Text><Text style={[styles.quickArrow, accent ? styles.quickTitleAccent : null]}>›</Text></Pressable>;
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
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickAction: { backgroundColor: "#ffffff", borderRadius: 18, minHeight: 92, padding: 14, position: "relative", width: "48%" },
  quickActionAccent: { backgroundColor: "#23313f" },
  quickTitle: { color: "#23313f", fontSize: 14, fontWeight: "900", paddingRight: 14 },
  quickTitleAccent: { color: "#ffffff" },
  quickDetail: { color: "#81766a", fontSize: 10, lineHeight: 14, marginTop: 6, paddingRight: 10 },
  quickDetailAccent: { color: "#d8cfc2" },
  quickArrow: { bottom: 9, color: "#23313f", fontSize: 25, position: "absolute", right: 13 },
  metric: { backgroundColor: "#ffffff", borderRadius: 20, minHeight: 118, padding: 16, width: "48%" },
  metricValue: { color: "#23313f", fontSize: 24, fontWeight: "900" },
  metricLabel: { color: "#6c6258", fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 8 },
  sectionTitle: { color: "#23313f", fontSize: 18, fontWeight: "900", marginTop: 24, marginBottom: 10 },
  card: { backgroundColor: "#ffffff", borderRadius: 22, paddingHorizontal: 16 },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 52 },
  rowLabel: { color: "#6c6258", fontSize: 13, fontWeight: "700" },
  rowValue: { color: "#23313f", fontSize: 14, fontWeight: "900" },
  divider: { backgroundColor: "#ebe5dc", height: 1 },
  attentionCard: { backgroundColor: "#fff7e8", borderColor: "#eed7ad", borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  attentionRow: { alignItems: "center", flexDirection: "row", minHeight: 70, paddingHorizontal: 14 },
  alertDot: { backgroundColor: "#b6473b", borderRadius: 6, height: 12, marginRight: 11, width: 12 },
  moneyDot: { backgroundColor: "#d3a04c" },
  attentionText: { flex: 1 },
  attentionTitle: { color: "#23313f", fontSize: 13, fontWeight: "900" },
  attentionDetail: { color: "#81766a", fontSize: 10, marginTop: 3 },
  chevron: { color: "#81766a", fontSize: 25 },
  sectionHeader: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" },
  viewAll: { color: "#b88645", fontSize: 10, fontWeight: "900", marginBottom: 11 },
  bookingRow: { alignItems: "center", flexDirection: "row", minHeight: 72, paddingVertical: 9 },
  dateBadge: { alignItems: "center", backgroundColor: "#23313f", borderRadius: 12, height: 48, justifyContent: "center", width: 48 },
  dateBadgeDay: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  dateBadgeMonth: { color: "#f0c987", fontSize: 8, fontWeight: "900" },
  bookingMain: { flex: 1, marginLeft: 10 },
  bookingTitle: { color: "#23313f", fontSize: 12, fontWeight: "900" },
  bookingMeta: { color: "#81766a", fontSize: 10, marginTop: 4, textTransform: "capitalize" },
  bookingBalance: { color: "#a4493d", fontSize: 11, fontWeight: "900", marginLeft: 6 },
  paid: { color: "#277a5b", fontSize: 9, fontWeight: "900", marginLeft: 6 },
  emptyText: { color: "#81766a", fontSize: 12, paddingVertical: 20, textAlign: "center" },
  loadingCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 22, justifyContent: "center", marginTop: 22, minHeight: 160 },
  errorCard: { backgroundColor: "#fff1f0", borderRadius: 22, marginTop: 22, padding: 18 },
  errorTitle: { color: "#8c2e2a", fontSize: 16, fontWeight: "900" },
  errorText: { color: "#7a4844", fontSize: 12, lineHeight: 18, marginTop: 6 },
  retryButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#23313f", borderRadius: 14, justifyContent: "center", marginTop: 14, minHeight: 42, paddingHorizontal: 18 },
  retryText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
});

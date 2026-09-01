import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";

type Booking = {
  id: string;
  booking_number?: string | null;
  status?: string | null;
  event_date?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  total_amount?: number | string | null;
  balance_due?: number | string | null;
  marker_color?: string | null;
  setup_city?: string | null;
  customers?: { full_name?: string | null } | { full_name?: string | null }[] | null;
  booking_items?: Array<{ products?: { name?: string | null } | { name?: string | null }[] | null }> | null;
};

function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateISO(date);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function time(value: string | null | undefined) {
  if (!value) return "—";
  const [h, m = "00"] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${m} ${suffix}`;
}

export function AdminCalendarScreen({ onBack }: { onBack: () => void }) {
  const [date, setDate] = useState(localDateISO);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const result = await supabase
      .from("bookings")
      .select(`
        id,
        booking_number,
        status,
        event_date,
        event_start_time,
        event_end_time,
        total_amount,
        balance_due,
        marker_color,
        setup_city,
        customers (full_name),
        booking_items (
          products (name)
        )
      `)
      .eq("event_date", date)
      .order("event_start_time", { ascending: true });

    if (result.error) throw new Error(result.error.message);
    setBookings((result.data || []) as Booking[]);
  }, [date]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Could not load calendar."));
  }, [load]);

  const revenue = useMemo(
    () => bookings.reduce((sum, booking) => sum + Number(booking.total_amount || 0), 0),
    [bookings],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          void load().finally(() => setRefreshing(false));
        }} />
      }
    >
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>‹ BACK</Text>
      </Pressable>

      <Text style={styles.eyebrow}>BOOKING CALENDAR</Text>
      <Text style={styles.title}>Calendar</Text>

      <View style={styles.dateCard}>
        <Pressable onPress={() => setDate((v) => shiftDate(v, -1))} style={styles.arrowButton}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={styles.dateText}>{date === localDateISO() ? "Today" : date}</Text>
          <Text style={styles.dateSub}>{bookings.length} booking{bookings.length === 1 ? "" : "s"} · ${revenue.toFixed(0)}</Text>
        </View>
        <Pressable onPress={() => setDate((v) => shiftDate(v, 1))} style={styles.arrowButton}>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => setDate(localDateISO())} style={styles.todayButton}>
        <Text style={styles.todayText}>TODAY</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {bookings.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No bookings</Text>
          <Text style={styles.emptyText}>Nothing is scheduled for this day.</Text>
        </View>
      ) : (
        bookings.map((booking) => {
          const customer = first(booking.customers)?.full_name || "Customer";
          const products = (booking.booking_items || [])
            .map((item) => first(item.products)?.name)
            .filter(Boolean)
            .join(", ");

          return (
            <View key={booking.id} style={styles.card}>
              <View style={styles.timeColumn}>
                <Text style={styles.startTime}>{time(booking.event_start_time)}</Text>
                <Text style={styles.endTime}>{time(booking.event_end_time)}</Text>
              </View>

              <View style={styles.bookingBody}>
                <Text style={styles.customer}>{customer}</Text>
                <Text style={styles.bookingNumber}>#{booking.booking_number || booking.id.slice(0, 8)}</Text>
                <Text style={styles.product} numberOfLines={2}>{products || "No products"}</Text>
                <Text style={styles.city}>{booking.setup_city || "City not set"} · {String(booking.status || "").replace(/_/g, " ")}</Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: { paddingTop: 54, paddingHorizontal: 18, paddingBottom: 120 },
  backButton: { alignSelf: "flex-start", paddingVertical: 7, paddingRight: 12 },
  backText: { color: "#b88645", fontSize: 10, fontWeight: "900" },
  eyebrow: { color: "#b88645", fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 },
  title: { color: "#23313f", fontSize: 30, fontWeight: "900", marginTop: 5 },
  dateCard: { backgroundColor: "#ffffff", borderRadius: 20, flexDirection: "row", alignItems: "center", marginTop: 18, minHeight: 72 },
  arrowButton: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  arrow: { color: "#23313f", fontSize: 34 },
  dateText: { color: "#23313f", fontSize: 16, fontWeight: "900" },
  dateSub: { color: "#81766a", fontSize: 10, marginTop: 3 },
  todayButton: { alignSelf: "center", backgroundColor: "#23313f", borderRadius: 999, marginVertical: 12, paddingHorizontal: 16, paddingVertical: 9 },
  todayText: { color: "#ffffff", fontSize: 9, fontWeight: "900" },
  error: { color: "#8c2e2a", backgroundColor: "#fff1f0", borderRadius: 16, padding: 12, marginBottom: 9, fontSize: 11 },
  emptyCard: { backgroundColor: "#ffffff", borderRadius: 20, alignItems: "center", padding: 28 },
  emptyTitle: { color: "#23313f", fontSize: 16, fontWeight: "900" },
  emptyText: { color: "#81766a", fontSize: 11, marginTop: 4 },
  card: { backgroundColor: "#ffffff", borderRadius: 19, flexDirection: "row", marginBottom: 9, padding: 14 },
  timeColumn: { width: 74, paddingRight: 10 },
  startTime: { color: "#23313f", fontSize: 12, fontWeight: "900" },
  endTime: { color: "#81766a", fontSize: 9, marginTop: 3 },
  bookingBody: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "#e5ddd1", paddingLeft: 12 },
  customer: { color: "#23313f", fontSize: 14, fontWeight: "900" },
  bookingNumber: { color: "#b88645", fontSize: 9, fontWeight: "900", marginTop: 2 },
  product: { color: "#6c6258", fontSize: 10, lineHeight: 15, marginTop: 5 },
  city: { color: "#81766a", fontSize: 9, marginTop: 6, textTransform: "capitalize" },
});

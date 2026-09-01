import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";

type Booking = {
  id: string;
  booking_number?: string | null;
  event_date?: string | null;
  total_amount?: number | string | null;
  balance_due?: number | string | null;
  setup_city?: string | null;
};

type Customer = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  created_at?: string | null;
  bookings?: Booking[] | null;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function AdminCustomersScreen({ onBack }: { onBack: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const result = await supabase
      .from("customers")
      .select(`
        id,
        full_name,
        phone,
        email,
        created_at,
        bookings (
          id,
          booking_number,
          event_date,
          total_amount,
          balance_due,
          setup_city
        )
      `)
      .order("created_at", { ascending: false })
      .limit(300);

    if (result.error) throw new Error(result.error.message);
    setCustomers((result.data || []) as Customer[]);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Could not load customers."));
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return customers;

    return customers.filter((customer) =>
      [customer.full_name, customer.phone, customer.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [customers, query]);

  const revenue = customers.reduce(
    (sum, customer) =>
      sum +
      (customer.bookings || []).reduce(
        (bookingSum, booking) => bookingSum + Number(booking.total_amount || 0),
        0,
      ),
    0,
  );

  const due = customers.reduce(
    (sum, customer) =>
      sum +
      (customer.bookings || []).reduce(
        (bookingSum, booking) => bookingSum + Number(booking.balance_due || 0),
        0,
      ),
    0,
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

      <Text style={styles.eyebrow}>CUSTOMER CRM</Text>
      <Text style={styles.title}>Customers</Text>
      <Text style={styles.subtitle}>Contacts, history and balances</Text>

      <View style={styles.statsRow}>
        <Stat label="Customers" value={String(customers.length)} />
        <Stat label="Revenue" value={money(revenue)} />
        <Stat label="Due" value={money(due)} />
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name, phone or email"
        placeholderTextColor="#9c9184"
        style={styles.search}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {filtered.map((customer) => {
        const bookings = customer.bookings || [];
        const total = bookings.reduce((sum, booking) => sum + Number(booking.total_amount || 0), 0);
        const balance = bookings.reduce((sum, booking) => sum + Number(booking.balance_due || 0), 0);
        const last = [...bookings].sort((a, b) => String(b.event_date || "").localeCompare(String(a.event_date || "")))[0];

        return (
          <View key={customer.id} style={styles.card}>
            <Text style={styles.name}>{customer.full_name || "Customer"}</Text>
            <Text style={styles.contact}>{customer.phone || customer.email || "No contact info"}</Text>

            <View style={styles.row}>
              <Text style={styles.meta}>{bookings.length} booking{bookings.length === 1 ? "" : "s"} · {money(total)}</Text>
              <Text style={[styles.balance, balance > 0 ? styles.balanceDue : styles.balancePaid]}>
                {balance > 0 ? `Due ${money(balance)}` : "Paid"}
              </Text>
            </View>

            {last ? (
              <Text style={styles.lastBooking}>
                Last: {last.event_date || "—"}{last.setup_city ? ` · ${last.setup_city}` : ""}
              </Text>
            ) : null}

            <View style={styles.actions}>
              {customer.phone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionText}>CALL</Text>
                </Pressable>
              ) : null}
              {customer.email ? (
                <Pressable
                  onPress={() => void Linking.openURL(`mailto:${customer.email}`)}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionText}>EMAIL</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: { paddingTop: 54, paddingHorizontal: 18, paddingBottom: 120 },
  backButton: { alignSelf: "flex-start", paddingVertical: 7, paddingRight: 12 },
  backText: { color: "#b88645", fontSize: 10, fontWeight: "900" },
  eyebrow: { color: "#b88645", fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 },
  title: { color: "#23313f", fontSize: 30, fontWeight: "900", marginTop: 5 },
  subtitle: { color: "#81766a", fontSize: 12, marginTop: 3 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  stat: { flex: 1, backgroundColor: "#ffffff", borderRadius: 17, padding: 12 },
  statValue: { color: "#23313f", fontSize: 14, fontWeight: "900" },
  statLabel: { color: "#81766a", fontSize: 8, fontWeight: "800", marginTop: 3 },
  search: { backgroundColor: "#ffffff", borderRadius: 16, color: "#23313f", minHeight: 48, marginTop: 12, marginBottom: 10, paddingHorizontal: 14 },
  error: { color: "#8c2e2a", backgroundColor: "#fff1f0", borderRadius: 16, padding: 12, marginBottom: 9, fontSize: 11 },
  card: { backgroundColor: "#ffffff", borderRadius: 19, marginBottom: 9, padding: 14 },
  name: { color: "#23313f", fontSize: 15, fontWeight: "900" },
  contact: { color: "#81766a", fontSize: 10, marginTop: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 8 },
  meta: { color: "#6c6258", fontSize: 10, flex: 1 },
  balance: { borderRadius: 999, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5, fontSize: 8, fontWeight: "900" },
  balanceDue: { backgroundColor: "#fff1f0", color: "#8c2e2a" },
  balancePaid: { backgroundColor: "#eaf1e6", color: "#5f735c" },
  lastBooking: { color: "#81766a", fontSize: 10, marginTop: 9 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionButton: { backgroundColor: "#f7ead0", borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8 },
  actionText: { color: "#8a6437", fontSize: 8, fontWeight: "900" },
});

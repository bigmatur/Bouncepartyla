import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";

type StaffRow = {
  id: string;
  name?: string | null;
  phone?: string | null;
  account_email?: string | null;
  notes?: string | null;
  active?: boolean | null;
  sort_order?: number | null;
};

function parseRole(notes: string | null | undefined) {
  const raw = String(notes || "");
  const match = raw.match(/\[\[STAFF_META\]\]([\s\S]*?)\[\[\/STAFF_META\]\]/);

  if (!match) return "driver";

  try {
    const parsed = JSON.parse(match[1]);
    return String(parsed?.role || "driver");
  } catch {
    return "driver";
  }
}

function pretty(value: string | null | undefined) {
  return String(value || "driver")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AdminStaffScreen({ onBack }: { onBack: () => void }) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadStaff = useCallback(async () => {
    setError("");

    const variants = [
      "id, name, phone, account_email, notes, active, sort_order",
      "id, name, phone, notes, active, sort_order",
      "id, name, phone, active, sort_order",
      "id, name, active, sort_order",
      "id, name",
    ];

    let lastError = "";

    for (const select of variants) {
      const result = await supabase
        .from("route_drivers")
        .select(select)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (!result.error) {
        const rows = (result.data || []) as unknown as StaffRow[];

        setStaff(
          rows.filter(
            (row) => row.active === undefined || row.active !== false,
          ),
        );
        return;
      }

      lastError = result.error.message;
    }

    throw new Error(lastError || "Could not load staff.");
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadStaff()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load staff."))
      .finally(() => setLoading(false));
  }, [loadStaff]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return staff;

    return staff.filter((member) =>
      [member.name, member.phone, member.account_email, parseRole(member.notes)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, staff]);

  const drivers = staff.filter((member) => parseRole(member.notes) === "driver").length;
  const admins = staff.filter((member) =>
    ["super_admin", "admin", "manager", "dispatcher"].includes(parseRole(member.notes)),
  ).length;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadStaff().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <Header title="Staff" subtitle="Team members and access roles" onBack={onBack} />

        <View style={styles.statsRow}>
          <Stat label="Active" value={staff.length} />
          <Stat label="Drivers" value={drivers} />
          <Stat label="Admin" value={admins} />
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search staff"
          placeholderTextColor="#9c9184"
          style={styles.search}
        />

        {loading ? (
          <State><ActivityIndicator color="#23313f" /><Text style={styles.stateText}>Loading staff…</Text></State>
        ) : error ? (
          <State><Text style={styles.errorText}>{error}</Text></State>
        ) : (
          filtered.map((member) => {
            const role = parseRole(member.notes);
            return (
              <View key={member.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{member.name || "Staff member"}</Text>
                    <Text style={styles.meta}>{member.phone || member.account_email || "No contact info"}</Text>
                  </View>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleText}>{pretty(role)}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>‹ BACK</Text>
      </Pressable>
      <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function State({ children }: { children: React.ReactNode }) {
  return <View style={styles.state}>{children}</View>;
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
  stat: { flex: 1, backgroundColor: "#ffffff", borderRadius: 17, padding: 13 },
  statValue: { color: "#23313f", fontSize: 21, fontWeight: "900" },
  statLabel: { color: "#81766a", fontSize: 9, fontWeight: "800", marginTop: 2 },
  search: { backgroundColor: "#ffffff", borderRadius: 16, color: "#23313f", minHeight: 48, marginTop: 12, marginBottom: 10, paddingHorizontal: 14 },
  card: { backgroundColor: "#ffffff", borderRadius: 18, marginBottom: 9, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { color: "#23313f", fontSize: 14, fontWeight: "900" },
  meta: { color: "#81766a", fontSize: 10, marginTop: 3 },
  roleBadge: { backgroundColor: "#f7ead0", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  roleText: { color: "#8a6437", fontSize: 8, fontWeight: "900" },
  state: { backgroundColor: "#ffffff", borderRadius: 20, alignItems: "center", marginTop: 10, padding: 24 },
  stateText: { color: "#81766a", fontSize: 12, marginTop: 8 },
  errorText: { color: "#8c2e2a", fontSize: 12, textAlign: "center" },
});

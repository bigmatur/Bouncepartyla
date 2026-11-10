import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { loadMobileDamageReports, updateMobileDamageReport, type MobileDamageReport } from "../../lib/mobileApi";

type Filter = "active" | "open" | "in_repair" | "resolved" | "all";

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function money(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount) : "$0.00";
}

function pretty(value: string | null | undefined) {
  return String(value || "unknown").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export function AdminDamageReportsScreen({
  grantedPermissions,
  onBack,
}: {
  grantedPermissions: string[];
  onBack: () => void;
}) {
  const canUpdate = grantedPermissions.length === 0 || grantedPermissions.includes("inventory.mark_damaged");
  const [reports, setReports] = useState<MobileDamageReport[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await loadMobileDamageReports();
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError("");
    setReports(result.data.reports || []);
  }, []);

  useEffect(() => { void load().finally(() => setLoading(false)); }, [load]);

  const visible = useMemo(() => reports.filter((report) => {
    if (filter === "all") return true;
    if (filter === "active") return ["open", "in_repair"].includes(String(report.status));
    return report.status === filter;
  }), [filter, reports]);

  const counts = useMemo(() => ({
    open: reports.filter((report) => report.status === "open").length,
    repair: reports.filter((report) => report.status === "in_repair").length,
  }), [reports]);

  async function update(report: MobileDamageReport, action: "repair" | "resolve" | "close") {
    if (savingId) return;
    const request = action === "repair"
      ? { status: "in_repair" as const, unitStatus: "maintenance" as const }
      : action === "resolve"
        ? { status: "resolved" as const, unitStatus: "available" as const }
        : { status: "closed" as const };

    const submit = async () => {
      setSavingId(report.id);
      const result = await updateMobileDamageReport({ reportId: report.id, ...request });
      if (!result.success) Alert.alert("Could not update damage report", result.error);
      else await load();
      setSavingId(null);
    };

    if (action === "resolve") {
      Alert.alert("Resolve damage", "This also marks the linked inventory unit as available.", [
        { text: "Cancel", style: "cancel" },
        { text: "Resolve", onPress: () => void submit() },
      ]);
      return;
    }
    await submit();
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
    >
      <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ BACK</Text></Pressable>
      <Text style={styles.eyebrow}>INVENTORY RISK</Text>
      <Text style={styles.title}>Damage reports</Text>
      <Text style={styles.subtitle}>Track damaged equipment through repair and safely return resolved units to stock.</Text>

      <View style={styles.stats}>
        <Stat label="Open" value={counts.open} danger />
        <Stat label="In repair" value={counts.repair} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {(["active", "open", "in_repair", "resolved", "all"] as Filter[]).map((value) => (
          <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value ? styles.filterActive : null]}>
            <Text style={[styles.filterText, filter === value ? styles.filterTextActive : null]}>{pretty(value)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? <View style={styles.state}><ActivityIndicator color="#23313f" /></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {!loading && !error && visible.length === 0 ? <View style={styles.state}><Text style={styles.emptyTitle}>No damage reports in this view</Text></View> : null}

      {visible.map((report) => {
        const item = one(report.inventory_items);
        const unit = one(report.inventory_units);
        const booking = one(report.bookings);
        const saving = savingId === report.id;
        return (
          <View key={report.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardCopy}><Text style={styles.reportTitle}>{report.title || "Damage report"}</Text><Text style={styles.meta}>{item?.name || "No item"} · {unit?.unit_code || unit?.serial_number || "No unit"}</Text></View>
              <View style={[styles.severity, report.severity === "critical" || report.severity === "high" ? styles.severityHigh : null]}><Text style={styles.severityText}>{pretty(report.severity)}</Text></View>
            </View>
            <View style={styles.infoRow}><Text style={styles.statusText}>{pretty(report.status)}</Text><Text style={styles.date}>{dateTime(report.reported_at)}</Text></View>
            {booking?.booking_number ? <Text style={styles.booking}>Booking #{booking.booking_number}{booking.event_date ? ` · ${booking.event_date}` : ""}</Text> : null}
            {report.description ? <Text style={styles.description}>{report.description}</Text> : null}
            {Number(report.repair_cost || 0) > 0 ? <Text style={styles.cost}>Estimated repair: {money(report.repair_cost)}</Text> : null}
            {canUpdate && ["open", "in_repair"].includes(String(report.status)) ? <View style={styles.actions}>
              {report.status === "open" ? <Action label="Start repair" disabled={saving} onPress={() => void update(report, "repair")} /> : null}
              <Action label="Resolved" primary disabled={saving} onPress={() => void update(report, "resolve")} />
              <Action label="Close" disabled={saving} onPress={() => void update(report, "close")} />
            </View> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <View style={styles.stat}><Text style={[styles.statValue, danger && value ? styles.dangerText : null]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function Action({ label, onPress, disabled, primary = false }: { label: string; onPress: () => void; disabled: boolean; primary?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.action, primary ? styles.actionPrimary : null, disabled ? styles.disabled : null]}><Text style={[styles.actionText, primary ? styles.actionTextPrimary : null]}>{label.toUpperCase()}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" }, content: { paddingTop: 54, paddingHorizontal: 18, paddingBottom: 120 },
  back: { alignSelf: "flex-start", paddingVertical: 7 }, backText: { color: "#b88645", fontSize: 10, fontWeight: "900" }, eyebrow: { color: "#b88645", fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 }, title: { color: "#23313f", fontSize: 30, fontWeight: "900", marginTop: 5 }, subtitle: { color: "#81766a", fontSize: 12, lineHeight: 18, marginTop: 4 },
  stats: { flexDirection: "row", gap: 8, marginTop: 18 }, stat: { backgroundColor: "#ffffff", borderRadius: 17, flex: 1, minHeight: 76, padding: 12 }, statValue: { color: "#23313f", fontSize: 23, fontWeight: "900" }, statLabel: { color: "#81766a", fontSize: 9, fontWeight: "900", marginTop: 4, textTransform: "uppercase" }, dangerText: { color: "#b4423a" },
  filters: { gap: 7, paddingRight: 18, paddingTop: 13 }, filter: { backgroundColor: "#ffffff", borderColor: "#ded5c9", borderRadius: 99, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 }, filterActive: { backgroundColor: "#23313f", borderColor: "#23313f" }, filterText: { color: "#6c6258", fontSize: 9, fontWeight: "900" }, filterTextActive: { color: "#ffffff" },
  state: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, marginTop: 16, padding: 26 }, emptyTitle: { color: "#23313f", fontSize: 15, fontWeight: "900", textAlign: "center" }, error: { backgroundColor: "#fff1f0", borderRadius: 16, marginTop: 16, padding: 13 }, errorText: { color: "#8c2e2a", fontSize: 11 },
  card: { backgroundColor: "#ffffff", borderRadius: 19, marginTop: 10, padding: 14 }, cardTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, cardCopy: { flex: 1, paddingRight: 8 }, reportTitle: { color: "#23313f", fontSize: 14, fontWeight: "900" }, meta: { color: "#81766a", fontSize: 10, marginTop: 4 }, severity: { backgroundColor: "#fff4d8", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 6 }, severityHigh: { backgroundColor: "#ffe7e4" }, severityText: { color: "#795e2b", fontSize: 8, fontWeight: "900", textTransform: "uppercase" }, infoRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 11 }, statusText: { color: "#355879", fontSize: 9, fontWeight: "900", textTransform: "uppercase" }, date: { color: "#9a8d7e", fontSize: 9 }, booking: { color: "#a2763a", fontSize: 10, marginTop: 8 }, description: { color: "#6c6258", fontSize: 11, lineHeight: 16, marginTop: 8 }, cost: { color: "#856727", fontSize: 10, fontWeight: "900", marginTop: 8 },
  actions: { flexDirection: "row", gap: 6, marginTop: 13 }, action: { alignItems: "center", borderColor: "#d9cdbd", borderRadius: 11, borderWidth: 1, flex: 1, paddingVertical: 10 }, actionPrimary: { backgroundColor: "#23313f", borderColor: "#23313f" }, actionText: { color: "#665d53", fontSize: 8, fontWeight: "900" }, actionTextPrimary: { color: "#ffffff" }, disabled: { opacity: 0.45 },
});

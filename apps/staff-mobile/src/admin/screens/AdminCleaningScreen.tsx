import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { loadMobileCleaningTasks, updateMobileCleaningTask, type MobileCleaningTask } from "../../lib/mobileApi";

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function label(value: string | null | undefined) {
  return String(value || "waiting").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AdminCleaningScreen({
  grantedPermissions,
  onBack,
}: {
  grantedPermissions: string[];
  onBack: () => void;
}) {
  const [tasks, setTasks] = useState<MobileCleaningTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const canEdit = grantedPermissions.length === 0 || grantedPermissions.includes("inventory.edit");
  const canReportProblem = grantedPermissions.length === 0 || grantedPermissions.includes("inventory.mark_damaged");

  const load = useCallback(async () => {
    const result = await loadMobileCleaningTasks();
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError("");
    setTasks(result.data.tasks || []);
  }, []);

  useEffect(() => { void load().finally(() => setLoading(false)); }, [load]);

  const counts = useMemo(() => ({
    waiting: tasks.filter((task) => task.status === "waiting").length,
    working: tasks.filter((task) => task.status === "in_progress").length,
    problem: tasks.filter((task) => task.status === "problem").length,
  }), [tasks]);

  async function update(task: MobileCleaningTask, action: "start" | "complete" | "problem") {
    if (savingId) return;
    if (action === "problem") {
      Alert.alert("Report a problem", "This marks the unit for attention. Add detailed notes in the web workspace.", [
        { text: "Cancel", style: "cancel" },
        { text: "Report", style: "destructive", onPress: () => void save(task, action) },
      ]);
      return;
    }
    await save(task, action);
  }

  async function save(task: MobileCleaningTask, action: "start" | "complete" | "problem") {
    setSavingId(task.id);
    const result = await updateMobileCleaningTask({ taskId: task.id, action });
    if (!result.success) Alert.alert("Could not update cleaning", result.error);
    else await load();
    setSavingId(null);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
    >
      <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ BACK</Text></Pressable>
      <Text style={styles.eyebrow}>WAREHOUSE WORKFLOW</Text>
      <Text style={styles.title}>Cleaning queue</Text>
      <Text style={styles.subtitle}>Returned equipment marked Needs Cleaning appears here.</Text>

      <View style={styles.stats}>
        <Stat label="Waiting" value={counts.waiting} />
        <Stat label="Working" value={counts.working} />
        <Stat label="Problem" value={counts.problem} danger />
      </View>

      {loading ? <View style={styles.state}><ActivityIndicator color="#23313f" /></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {!loading && !error && tasks.length === 0 ? <View style={styles.state}><Text style={styles.emptyTitle}>Cleaning queue is clear</Text><Text style={styles.emptyText}>There are no open cleaning tasks.</Text></View> : null}

      {tasks.map((task) => {
        const item = one(task.inventory_items);
        const unit = one(task.inventory_units);
        const booking = one(task.bookings);
        const isWorking = task.status === "in_progress";
        return (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.taskTop}>
              <View style={styles.taskText}><Text style={styles.taskName}>{item?.name || "Inventory item"}</Text><Text style={styles.taskMeta}>{unit?.unit_code || item?.sku || "Unit not assigned"} · Qty {task.quantity || 1}</Text></View>
              <View style={[styles.badge, task.status === "problem" ? styles.badgeProblem : isWorking ? styles.badgeWorking : styles.badgeWaiting]}><Text style={styles.badgeText}>{label(task.status)}</Text></View>
            </View>
            {booking?.booking_number ? <Text style={styles.booking}>Booking #{booking.booking_number}{booking.event_date ? ` · ${booking.event_date}` : ""}</Text> : null}
            {task.notes ? <Text style={styles.notes}>{task.notes}</Text> : null}
            <View style={styles.actions}>
              {!isWorking && canEdit ? <Action label="Start" onPress={() => void update(task, "start")} disabled={savingId === task.id} /> : null}
              {isWorking && canEdit ? <Action label="Complete" primary onPress={() => void update(task, "complete")} disabled={savingId === task.id} /> : null}
              {canReportProblem ? <Action label="Problem" danger onPress={() => void update(task, "problem")} disabled={savingId === task.id} /> : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <View style={styles.stat}><Text style={[styles.statValue, danger && value ? styles.dangerText : null]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function Action({ label, onPress, disabled, primary = false, danger = false }: { label: string; onPress: () => void; disabled: boolean; primary?: boolean; danger?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.action, primary ? styles.actionPrimary : null, danger ? styles.actionDanger : null, disabled ? styles.disabled : null]}><Text style={[styles.actionText, primary || danger ? styles.actionTextOnColor : null]}>{label.toUpperCase()}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" }, content: { paddingTop: 54, paddingHorizontal: 18, paddingBottom: 120 },
  back: { alignSelf: "flex-start", paddingVertical: 7 }, backText: { color: "#b88645", fontSize: 10, fontWeight: "900" },
  eyebrow: { color: "#b88645", fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 }, title: { color: "#23313f", fontSize: 30, fontWeight: "900", marginTop: 5 }, subtitle: { color: "#81766a", fontSize: 12, lineHeight: 18, marginTop: 4 },
  stats: { flexDirection: "row", gap: 8, marginTop: 18 }, stat: { backgroundColor: "#ffffff", borderRadius: 17, flex: 1, minHeight: 76, padding: 12 }, statValue: { color: "#23313f", fontSize: 23, fontWeight: "900" }, statLabel: { color: "#81766a", fontSize: 9, fontWeight: "900", marginTop: 4, textTransform: "uppercase" }, dangerText: { color: "#b4423a" },
  state: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, marginTop: 16, padding: 26 }, emptyTitle: { color: "#23313f", fontSize: 16, fontWeight: "900" }, emptyText: { color: "#81766a", fontSize: 11, marginTop: 4 }, error: { backgroundColor: "#fff1f0", borderRadius: 16, marginTop: 16, padding: 13 }, errorText: { color: "#8c2e2a", fontSize: 11 },
  taskCard: { backgroundColor: "#ffffff", borderRadius: 19, marginTop: 10, padding: 14 }, taskTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, taskText: { flex: 1, paddingRight: 8 }, taskName: { color: "#23313f", fontSize: 14, fontWeight: "900" }, taskMeta: { color: "#81766a", fontSize: 10, marginTop: 4 }, badge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 6 }, badgeWaiting: { backgroundColor: "#fff4d8" }, badgeWorking: { backgroundColor: "#e8f0f8" }, badgeProblem: { backgroundColor: "#fff0ee" }, badgeText: { color: "#6b5940", fontSize: 8, fontWeight: "900", textTransform: "uppercase" }, booking: { color: "#a2763a", fontSize: 10, marginTop: 10 }, notes: { color: "#6c6258", fontSize: 11, lineHeight: 16, marginTop: 7 },
  actions: { flexDirection: "row", gap: 8, marginTop: 13 }, action: { alignItems: "center", borderColor: "#d9cdbd", borderRadius: 12, borderWidth: 1, flex: 1, paddingVertical: 10 }, actionPrimary: { backgroundColor: "#23313f", borderColor: "#23313f" }, actionDanger: { backgroundColor: "#b4423a", borderColor: "#b4423a" }, actionText: { color: "#665d53", fontSize: 9, fontWeight: "900" }, actionTextOnColor: { color: "#ffffff" }, disabled: { opacity: 0.45 },
});

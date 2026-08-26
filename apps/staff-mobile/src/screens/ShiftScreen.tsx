import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  finishMyDriverShift,
  resumeMyStaffWork,
  startMyDriverShift,
  startMyStaffBreak,
} from "../features/routes/routeActions";
import { supabase } from "../lib/supabase";

type StaffTimeBreak = {
  id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  break_type?: string | null;
};

type StaffTimeDashboard = {
  current?: {
    id?: string | null;
    work_date?: string | null;
    clock_in_at?: string | null;
    clock_out_at?: string | null;
    source?: string | null;
    status?: string | null;
    staff_time_breaks?: StaffTimeBreak[] | null;
  } | null;
  stale_open?: {
    id?: string | null;
    clock_in_at?: string | null;
    needs_review?: boolean | null;
  } | null;
  history?: Array<{
    id?: string | null;
    work_date?: string | null;
    clock_in_at?: string | null;
    clock_out_at?: string | null;
    source?: string | null;
    status?: string | null;
    break_minutes?: number | string | null;
  }> | null;
};

function currentOpenBreak(dashboard: StaffTimeDashboard | null) {
  const breaks = dashboard?.current?.staff_time_breaks || [];
  return (
    [...breaks]
      .reverse()
      .find((item) => item?.started_at && !item?.ended_at) || null
  );
}

function durationMinutes(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  nowMs: number,
) {
  if (!startedAt) return 0;

  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : nowMs;

  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

  return Math.max(0, Math.floor((end - start) / 60000));
}

function formatDuration(totalMinutes: number) {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours <= 0) return `${remainder}m`;
  return `${hours}h ${remainder}m`;
}

function formatClock(value: string | null | undefined) {
  if (!value) return "--";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "--";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function paidMinutes(
  dashboard: StaffTimeDashboard | null,
  nowMs: number,
) {
  const current = dashboard?.current;
  if (!current?.clock_in_at || current.clock_out_at) return 0;

  const gross = durationMinutes(
    current.clock_in_at,
    current.clock_out_at,
    nowMs,
  );

  const breaks = (current.staff_time_breaks || []).reduce(
    (sum, item) =>
      sum +
      durationMinutes(
        item.started_at,
        item.ended_at,
        nowMs,
      ),
    0,
  );

  return Math.max(0, gross - breaks);
}

export function ShiftScreen() {
  const [dashboard, setDashboard] = useState<StaffTimeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadDashboard = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const result = await supabase.rpc("get_my_staff_time_dashboard", {
          p_limit: 14,
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        setDashboard(
          (result.data || null) as StaffTimeDashboard | null,
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load staff time.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadDashboard();

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => clearInterval(timer);
  }, [loadDashboard]);

  const current = dashboard?.current || null;
  const openBreak = currentOpenBreak(dashboard);
  const isWorking = Boolean(current?.id && !current.clock_out_at);
  const currentPaidMinutes = paidMinutes(dashboard, nowMs);
  const breakMinutes = durationMinutes(
    openBreak?.started_at,
    openBreak?.ended_at,
    nowMs,
  );

  const totalBreakMinutes = useMemo(
    () =>
      (current?.staff_time_breaks || []).reduce(
        (sum, item) =>
          sum +
          durationMinutes(
            item.started_at,
            item.ended_at,
            nowMs,
          ),
        0,
      ),
    [current?.staff_time_breaks, nowMs],
  );

  const run = useCallback(
    async (action: "start" | "break" | "resume") => {
      if (pending) return;

      setPending(true);
      setError("");

      try {
        if (action === "start") {
          await startMyDriverShift();
        } else if (action === "break") {
          await startMyStaffBreak();
        } else {
          await resumeMyStaffWork();
        }

        await loadDashboard(true);
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Could not update your shift.",
        );
      } finally {
        setPending(false);
      }
    },
    [loadDashboard, pending],
  );

  const finishShift = useCallback(() => {
    if (pending) return;

    Alert.alert(
      "Finish work shift?",
      "This will clock you out for today.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Finish Shift",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setPending(true);
              setError("");

              try {
                await finishMyDriverShift();
                await loadDashboard(true);
              } catch (finishError) {
                setError(
                  finishError instanceof Error
                    ? finishError.message
                    : "Could not finish the work shift.",
                );
              } finally {
                setPending(false);
              }
            })();
          },
        },
      ],
    );
  }, [loadDashboard, pending]);

  if (loading && !dashboard) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#23313f" />
        <Text style={styles.loadingText}>Loading shift…</Text>
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
          onRefresh={() => void loadDashboard(true)}
        />
      }
    >
      <Text style={styles.eyebrow}>STAFF TIME</Text>
      <Text style={styles.title}>My Shift</Text>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Staff time unavailable</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {dashboard?.stale_open?.needs_review ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Shift needs review</Text>
          <Text style={styles.warningText}>
            An older open shift exists. An administrator must review it before a new shift can be started.
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.statusCard,
          openBreak ? styles.statusCardBreak : null,
        ]}
      >
        <Text style={styles.statusLabel}>
          {openBreak ? "ON BREAK" : isWorking ? "WORKING" : "OFF SHIFT"}
        </Text>

        <Text style={styles.statusTime}>
          {openBreak
            ? formatDuration(breakMinutes)
            : isWorking
              ? formatDuration(currentPaidMinutes)
              : "—"}
        </Text>

        <Text style={styles.statusCaption}>
          {openBreak
            ? `Paid time today ${formatDuration(currentPaidMinutes)}`
            : isWorking
              ? `Clocked in ${formatClock(current?.clock_in_at)}`
              : "Your shift starts automatically with the first navigation."}
        </Text>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>
              {isWorking ? formatDuration(currentPaidMinutes) : "0m"}
            </Text>
            <Text style={styles.metricLabel}>Paid</Text>
          </View>

          <View style={styles.metric}>
            <Text style={styles.metricValue}>
              {isWorking ? formatDuration(totalBreakMinutes) : "0m"}
            </Text>
            <Text style={styles.metricLabel}>Break</Text>
          </View>
        </View>

        {!isWorking ? (
          <Pressable
            disabled={pending || Boolean(dashboard?.stale_open?.needs_review)}
            onPress={() => void run("start")}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.pressed : null,
              pending || dashboard?.stale_open?.needs_review
                ? styles.disabled
                : null,
            ]}
          >
            {pending ? (
              <ActivityIndicator color="#23313f" />
            ) : (
              <Text style={styles.primaryButtonText}>Start Shift</Text>
            )}
          </Pressable>
        ) : openBreak ? (
          <Pressable
            disabled={pending}
            onPress={() => void run("resume")}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.pressed : null,
              pending ? styles.disabled : null,
            ]}
          >
            {pending ? (
              <ActivityIndicator color="#23313f" />
            ) : (
              <Text style={styles.primaryButtonText}>Resume Work</Text>
            )}
          </Pressable>
        ) : (
          <>
            <Pressable
              disabled={pending}
              onPress={() => void run("break")}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.pressed : null,
                pending ? styles.disabled : null,
              ]}
            >
              {pending ? (
                <ActivityIndicator color="#23313f" />
              ) : (
                <Text style={styles.primaryButtonText}>Start Break</Text>
              )}
            </Pressable>

            <Pressable
              disabled={pending}
              onPress={finishShift}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.pressed : null,
                pending ? styles.disabled : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Finish Shift</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.historySection}>
        <Text style={styles.sectionTitle}>Recent Shifts</Text>

        {(dashboard?.history || []).length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No completed shifts yet.</Text>
          </View>
        ) : (
          (dashboard?.history || []).map((item) => (
            <View key={String(item.id)} style={styles.historyRow}>
              <View>
                <Text style={styles.historyDate}>
                  {item.work_date || "Shift"}
                </Text>
                <Text style={styles.historyTimes}>
                  {formatClock(item.clock_in_at)} – {formatClock(item.clock_out_at)}
                </Text>
              </View>

              <View style={styles.historyRight}>
                <Text style={styles.historyBreak}>
                  {formatDuration(Number(item.break_minutes || 0))} break
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f1e8",
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 62,
    paddingBottom: 120,
  },

  centered: {
    alignItems: "center",
    backgroundColor: "#f5f1e8",
    flex: 1,
    justifyContent: "center",
  },

  loadingText: {
    color: "#6c6258",
    fontSize: 14,
    marginTop: 12,
  },

  eyebrow: {
    color: "#b88645",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.7,
  },

  title: {
    color: "#23313f",
    fontSize: 32,
    fontWeight: "900",
    marginTop: 6,
  },

  errorCard: {
    backgroundColor: "#fff1f0",
    borderColor: "#efb7b3",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    padding: 15,
  },

  errorTitle: {
    color: "#8c2e2a",
    fontSize: 15,
    fontWeight: "900",
  },

  errorText: {
    color: "#7a4844",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  warningCard: {
    backgroundColor: "#fff8e7",
    borderColor: "#e4c78c",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    padding: 15,
  },

  warningTitle: {
    color: "#76531f",
    fontSize: 15,
    fontWeight: "900",
  },

  warningText: {
    color: "#765f3d",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  statusCard: {
    backgroundColor: "#23313f",
    borderRadius: 26,
    marginTop: 22,
    padding: 20,
  },

  statusCardBreak: {
    backgroundColor: "#604c36",
  },

  statusLabel: {
    color: "#f0c987",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },

  statusTime: {
    color: "#ffffff",
    fontSize: 48,
    fontWeight: "900",
    marginTop: 8,
  },

  statusCaption: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },

  metric: {
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 16,
    flex: 1,
    padding: 14,
  },

  metricValue: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },

  metricLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },

  primaryButton: {
    alignItems: "center",
    backgroundColor: "#f0c987",
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 52,
  },

  primaryButtonText: {
    color: "#23313f",
    fontSize: 15,
    fontWeight: "900",
  },

  secondaryButton: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 48,
  },

  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  historySection: {
    marginTop: 28,
  },

  sectionTitle: {
    color: "#23313f",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 12,
  },

  historyRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    padding: 15,
  },

  historyDate: {
    color: "#23313f",
    fontSize: 14,
    fontWeight: "900",
  },

  historyTimes: {
    color: "#81766a",
    fontSize: 12,
    marginTop: 3,
  },

  historyRight: {
    alignItems: "flex-end",
  },

  historyBreak: {
    color: "#a16a2c",
    fontSize: 11,
    fontWeight: "800",
  },

  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
  },

  emptyText: {
    color: "#81766a",
    fontSize: 13,
  },

  pressed: {
    opacity: 0.7,
  },

  disabled: {
    opacity: 0.5,
  },
});

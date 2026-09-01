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

import { supabase } from "../../lib/supabase";
import { setTaskCompletedFromMobile } from "../../lib/mobileApi";

type Task = {
  id: string;
  title: string;
  description?: string | null;
  task_type?: string | null;
  due_at?: string | null;
  status?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  customers?:
    | { full_name?: string | null; phone?: string | null }
    | { full_name?: string | null; phone?: string | null }[]
    | null;
  bookings?:
    | {
        booking_number?: string | null;
        event_date?: string | null;
        setup_city?: string | null;
      }
    | {
        booking_number?: string | null;
        event_date?: string | null;
        setup_city?: string | null;
      }[]
    | null;
};

type Filter = "open" | "overdue" | "completed" | "all";

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function overdue(task: Task) {
  return (
    task.status !== "completed" &&
    !!task.due_at &&
    new Date(task.due_at).getTime() < Date.now()
  );
}

function pretty(value: string | null | undefined) {
  return String(value || "follow_up")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dueLabel(value: string | null | undefined) {
  if (!value) return "No due date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function AdminTasksScreen({ onBack }: { onBack: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [refreshing, setRefreshing] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");

    const result = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        task_type,
        due_at,
        status,
        completed_at,
        created_at,
        bookings (
          booking_number,
          event_date,
          setup_city
        ),
        customers (
          full_name,
          phone
        )
      `)
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(150);

    if (result.error) {
      throw new Error(result.error.message);
    }

    setTasks((result.data || []) as unknown as Task[]);
  }, []);

  useEffect(() => {
    void load().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load tasks.",
      );
    });
  }, [load]);

  const setTaskCompleted = useCallback(
    async (task: Task, completed: boolean) => {
      if (savingTaskId) return;

      setSavingTaskId(task.id);
      setError("");

      const result = await setTaskCompletedFromMobile({
        taskId: task.id,
        completed,
      });

      if (!result.success) {
        setSavingTaskId(null);
        const message = result.error || "Could not update task status.";
        setError(message);
        Alert.alert(
          completed ? "Task not completed" : "Task not reopened",
          message,
        );
        return;
      }

      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: result.data.status,
                completed_at: result.data.completedAt,
              }
            : item,
        ),
      );

      setSavingTaskId(null);
    },
    [savingTaskId],
  );

  const confirmComplete = useCallback(
    (task: Task) => {
      Alert.alert(
        "Complete task?",
        task.title,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Complete",
            onPress: () => void setTaskCompleted(task, true),
          },
        ],
      );
    },
    [setTaskCompleted],
  );

  const visible = useMemo(() => {
    if (filter === "all") return tasks;
    if (filter === "overdue") return tasks.filter(overdue);
    if (filter === "completed") {
      return tasks.filter((task) => task.status === "completed");
    }

    return tasks.filter((task) => task.status !== "completed");
  }, [filter, tasks]);

  const openCount = tasks.filter((task) => task.status !== "completed").length;
  const overdueCount = tasks.filter(overdue).length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load()
              .catch((loadError) => {
                setError(
                  loadError instanceof Error
                    ? loadError.message
                    : "Could not refresh tasks.",
                );
              })
              .finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>‹ BACK</Text>
      </Pressable>

      <Text style={styles.eyebrow}>FOLLOW-UP CENTER</Text>
      <Text style={styles.title}>Tasks</Text>
      <Text style={styles.subtitle}>What the team cannot forget</Text>

      <View style={styles.statsRow}>
        <Stat label="Open" value={openCount} />
        <Stat
          label="Overdue"
          value={overdueCount}
          danger={overdueCount > 0}
        />
        <Stat label="Total" value={tasks.length} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {(["open", "overdue", "completed", "all"] as Filter[]).map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={[
              styles.filter,
              filter === item ? styles.filterActive : null,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filter === item ? styles.filterTextActive : null,
              ]}
            >
              {pretty(item)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {visible.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No tasks</Text>
          <Text style={styles.emptyText}>
            Nothing matches the current filter.
          </Text>
        </View>
      ) : (
        visible.map((task) => {
          const customer = first(task.customers);
          const booking = first(task.bookings);
          const isOverdue = overdue(task);
          const completed = task.status === "completed";
          const saving = savingTaskId === task.id;

          return (
            <View
              key={task.id}
              style={[
                styles.card,
                isOverdue ? styles.cardOverdue : null,
                completed ? styles.cardCompleted : null,
              ]}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardTitleBlock}>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskType}>
                    {pretty(task.task_type)}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.status,
                    isOverdue ? styles.statusOverdue : null,
                    completed ? styles.statusCompleted : null,
                  ]}
                >
                  {completed
                    ? "COMPLETED"
                    : isOverdue
                      ? "OVERDUE"
                      : pretty(task.status)}
                </Text>
              </View>

              {task.description ? (
                <Text style={styles.description} numberOfLines={3}>
                  {task.description}
                </Text>
              ) : null}

              <Text style={styles.due}>
                {completed && task.completed_at
                  ? `Completed ${dueLabel(task.completed_at)}`
                  : dueLabel(task.due_at)}
              </Text>

              {customer || booking ? (
                <Text style={styles.context}>
                  {[
                    customer?.full_name,
                    booking?.booking_number
                      ? `#${booking.booking_number}`
                      : null,
                    booking?.setup_city,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              ) : null}

              <View style={styles.actionRow}>
                {completed ? (
                  <Pressable
                    disabled={saving}
                    onPress={() => void setTaskCompleted(task, false)}
                    style={({ pressed }) => [
                      styles.reopenButton,
                      pressed ? styles.pressed : null,
                      saving ? styles.disabled : null,
                    ]}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#23313f" />
                    ) : (
                      <Text style={styles.reopenText}>REOPEN</Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    disabled={saving}
                    onPress={() => confirmComplete(task)}
                    style={({ pressed }) => [
                      styles.completeButton,
                      pressed ? styles.pressed : null,
                      saving ? styles.disabled : null,
                    ]}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.completeText}>MARK COMPLETE</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          );
        })
      )}

      <View style={styles.safetyNote}>
        <Text style={styles.safetyTitle}>Uses existing task workflow</Text>
        <Text style={styles.safetyText}>
          Complete and reopen write the same status, completed_at and
          updated_at fields used by the existing web Admin actions.
        </Text>
      </View>
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, danger ? styles.statDanger : null]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: {
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingRight: 12,
  },
  backText: {
    color: "#b88645",
    fontSize: 10,
    fontWeight: "900",
  },
  eyebrow: {
    color: "#b88645",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 4,
  },
  title: {
    color: "#23313f",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 5,
  },
  subtitle: {
    color: "#81766a",
    fontSize: 12,
    marginTop: 3,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },
  stat: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 17,
    padding: 13,
  },
  statValue: {
    color: "#23313f",
    fontSize: 21,
    fontWeight: "900",
  },
  statDanger: { color: "#8c2e2a" },
  statLabel: {
    color: "#81766a",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },
  filters: {
    gap: 8,
    paddingVertical: 12,
  },
  filter: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 13,
    minHeight: 37,
    justifyContent: "center",
  },
  filterActive: {
    backgroundColor: "#23313f",
  },
  filterText: {
    color: "#81766a",
    fontSize: 10,
    fontWeight: "900",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  error: {
    color: "#8c2e2a",
    backgroundColor: "#fff1f0",
    borderRadius: 16,
    padding: 12,
    marginBottom: 9,
    fontSize: 11,
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    alignItems: "center",
    padding: 26,
  },
  emptyTitle: {
    color: "#23313f",
    fontSize: 15,
    fontWeight: "900",
  },
  emptyText: {
    color: "#81766a",
    fontSize: 10,
    marginTop: 4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 19,
    marginBottom: 9,
    padding: 14,
  },
  cardOverdue: {
    borderColor: "#e4c1bd",
    borderWidth: 1,
  },
  cardCompleted: {
    opacity: 0.82,
  },
  cardTop: {
    flexDirection: "row",
    gap: 10,
  },
  cardTitleBlock: {
    flex: 1,
  },
  taskTitle: {
    color: "#23313f",
    fontSize: 14,
    fontWeight: "900",
  },
  taskType: {
    color: "#b88645",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 3,
  },
  status: {
    color: "#5f735c",
    fontSize: 8,
    fontWeight: "900",
  },
  statusOverdue: {
    color: "#8c2e2a",
  },
  statusCompleted: {
    color: "#5f735c",
  },
  description: {
    color: "#6c6258",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  due: {
    color: "#23313f",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 9,
  },
  context: {
    color: "#81766a",
    fontSize: 9,
    marginTop: 5,
  },
  actionRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5ddd1",
    marginTop: 11,
    paddingTop: 11,
  },
  completeButton: {
    minHeight: 43,
    backgroundColor: "#23313f",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  completeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  reopenButton: {
    minHeight: 43,
    borderColor: "#cbbfaf",
    borderWidth: 1,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  reopenText: {
    color: "#23313f",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  safetyNote: {
    backgroundColor: "#eee7dc",
    borderRadius: 17,
    padding: 14,
    marginTop: 6,
  },
  safetyTitle: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "900",
  },
  safetyText: {
    color: "#81766a",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 4,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.7,
  },
});

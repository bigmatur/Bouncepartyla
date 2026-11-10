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
  loadMobileNotifications,
  markMobileNotificationsRead,
  type MobileNotification,
} from "../../lib/mobileApi";

function prettyEvent(value: string | null | undefined) {
  return String(value || "notification")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function AdminNotificationsScreen({ onBack, onOpenBooking }: { onBack: () => void; onOpenBooking?: (bookingId: string) => void }) {
  const [notifications, setNotifications] = useState<MobileNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (showError = true) => {
    const result = await loadMobileNotifications();
    if (!result.success) {
      if (showError) setError(result.error);
      return;
    }
    setError("");
    setNotifications(result.data.deliveries || []);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
    const interval = setInterval(() => void load(false), 20_000);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications],
  );

  async function markOne(notification: MobileNotification) {
    if (notification.read_at) {
      if (notification.booking_id && onOpenBooking) {
        onOpenBooking(notification.booking_id);
      }
      return;
    }
    if (marking) return;
    setMarking(true);
    const result = await markMobileNotificationsRead({ deliveryId: notification.id });
    if (!result.success) {
      Alert.alert("Could not mark as read", result.error);
    } else {
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
      )));
    }
    setMarking(false);
    if (notification.booking_id && onOpenBooking) {
      onOpenBooking(notification.booking_id);
    }
  }

  async function markAll() {
    if (!unreadCount || marking) return;
    setMarking(true);
    const result = await markMobileNotificationsRead({ markAll: true });
    if (!result.success) {
      Alert.alert("Could not mark notifications as read", result.error);
    } else {
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
    }
    setMarking(false);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }} />}
    >
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>‹ BACK</Text>
      </Pressable>
      <Text style={styles.eyebrow}>PERSONAL ALERTS</Text>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.subtitle}>Updates assigned to your staff account.</Text>

      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>UNREAD</Text>
          <Text style={styles.summaryValue}>{unreadCount}</Text>
        </View>
        <Pressable
          disabled={!unreadCount || marking}
          onPress={() => void markAll()}
          style={[styles.markAllButton, (!unreadCount || marking) ? styles.disabledButton : null]}
        >
          <Text style={styles.markAllText}>{marking ? "SAVING…" : "MARK ALL READ"}</Text>
        </Pressable>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color="#23313f" /></View> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}

      {!loading && !error && notifications.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>You’re all caught up</Text>
          <Text style={styles.emptyText}>New operational updates will appear here.</Text>
        </View>
      ) : null}

      {notifications.map((notification) => {
        const unread = !notification.read_at;
        const title = String(notification.subject || "").trim() || prettyEvent(notification.event_code);
        return (
          <Pressable
            key={notification.id}
            onPress={() => void markOne(notification)}
            style={[styles.notificationCard, unread ? styles.notificationUnread : styles.notificationRead]}
          >
            <View style={styles.notificationHeading}>
              <View style={styles.notificationTitleWrap}>
                <View style={[styles.dot, unread ? styles.dotUnread : styles.dotRead]} />
                <Text style={[styles.notificationTitle, unread ? null : styles.notificationTitleRead]} numberOfLines={1}>{title}</Text>
              </View>
              <Text style={styles.timestamp}>{dateLabel(notification.delivered_at || notification.created_at)}</Text>
            </View>
            <Text style={styles.eventCode}>{prettyEvent(notification.event_code)}</Text>
            {notification.rendered_body ? <Text style={[styles.body, unread ? null : styles.bodyRead]}>{notification.rendered_body}</Text> : null}
            {notification.booking_id && onOpenBooking ? <Text style={styles.openHint}>OPEN BOOKING ›</Text> : null}
          </Pressable>
        );
      })}
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
  subtitle: { color: "#81766a", fontSize: 12, lineHeight: 18, marginTop: 4 },
  summaryCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, flexDirection: "row", justifyContent: "space-between", marginTop: 19, padding: 16 },
  summaryLabel: { color: "#81766a", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  summaryValue: { color: "#23313f", fontSize: 27, fontWeight: "900", marginTop: 2 },
  markAllButton: { backgroundColor: "#23313f", borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12 },
  disabledButton: { opacity: 0.42 },
  markAllText: { color: "#ffffff", fontSize: 9, fontWeight: "900" },
  loading: { alignItems: "center", marginTop: 34 },
  errorCard: { backgroundColor: "#fff1f0", borderRadius: 16, marginTop: 15, padding: 13 },
  errorText: { color: "#8c2e2a", fontSize: 11, lineHeight: 17 },
  emptyCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, marginTop: 15, padding: 26 },
  emptyTitle: { color: "#23313f", fontSize: 16, fontWeight: "900" },
  emptyText: { color: "#81766a", fontSize: 11, marginTop: 4 },
  notificationCard: { borderRadius: 18, marginTop: 10, padding: 14 },
  notificationUnread: { backgroundColor: "#fff8eb", borderColor: "#d8c39b", borderWidth: 1 },
  notificationRead: { backgroundColor: "#fbf9f6", borderColor: "#e9e3da", borderWidth: 1 },
  notificationHeading: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  notificationTitleWrap: { alignItems: "center", flex: 1, flexDirection: "row", paddingRight: 8 },
  dot: { borderRadius: 99, height: 8, marginRight: 8, width: 8 },
  dotUnread: { backgroundColor: "#c9964f" },
  dotRead: { backgroundColor: "#cac5bd" },
  notificationTitle: { color: "#23313f", flex: 1, fontSize: 13, fontWeight: "900" },
  notificationTitleRead: { color: "#5d5750", fontWeight: "700" },
  timestamp: { color: "#958b7f", fontSize: 9, textAlign: "right" },
  eventCode: { color: "#a29686", fontSize: 9, fontWeight: "900", letterSpacing: 0.5, marginTop: 7, textTransform: "uppercase" },
  body: { color: "#4f4941", fontSize: 12, lineHeight: 18, marginTop: 6 },
  bodyRead: { color: "#81766a" },
  openHint: { color: "#8a6437", fontSize: 9, fontWeight: "900", marginTop: 9 },
});

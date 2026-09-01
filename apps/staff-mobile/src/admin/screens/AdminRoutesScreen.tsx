import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";

type AdminRouteStop = {
  id: string;
  booking_id?: string | null;
  stop_date?: string | null;
  stop_type?: string | null;
  status?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  scheduled_start_time?: string | null;
  scheduled_end_time?: string | null;
  driver_name?: string | null;
  truck_name?: string | null;
  items_summary?: string | null;
  setup_notes?: string | null;
  pickup_notes?: string | null;
  balance_due?: number | string | null;
  payment_collected?: boolean | null;
  sort_order?: number | null;
  bookings?: {
    booking_number?: string | null;
    status?: string | null;
  } | Array<{
    booking_number?: string | null;
    status?: string | null;
  }> | null;
};

type RouteFilter = "all" | "delivery" | "pickup" | "unassigned";

function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateISO(date);
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  const today = localDateISO();
  if (value === today) return "Today";
  if (value === shiftDate(today, 1)) return "Tomorrow";
  if (value === shiftDate(today, -1)) return "Yesterday";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--";

  const [hourRaw, minuteRaw] = value.split(":");
  const hours = Number(hourRaw);
  const minutes = Number(minuteRaw || 0);

  if (!Number.isFinite(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function money(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function titleCase(value: string | null | undefined) {
  return String(value || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function isComplete(stop: AdminRouteStop) {
  return ["installed", "picked_up", "completed"].includes(
    String(stop.status || "").toLowerCase(),
  );
}

function isUnassigned(stop: AdminRouteStop) {
  const driver = String(stop.driver_name || "").trim().toLowerCase();
  return !driver || driver === "unassigned";
}

function addressText(stop: AdminRouteStop) {
  return [stop.address, stop.city, stop.state, stop.zip]
    .filter(Boolean)
    .join(", ");
}

function stopTypeLabel(stop: AdminRouteStop) {
  return String(stop.stop_type || "").toLowerCase() === "pickup"
    ? "PICKUP"
    : "DELIVERY";
}

function bookingLabel(stop: AdminRouteStop) {
  const booking = firstRelation(stop.bookings);
  return booking?.booking_number
    ? `#${booking.booking_number}`
    : stop.booking_id
      ? `#${stop.booking_id.slice(0, 8)}`
      : "No booking";
}

export function AdminRoutesScreen() {
  const [date, setDate] = useState(localDateISO);
  const [filter, setFilter] = useState<RouteFilter>("all");
  const [stops, setStops] = useState<AdminRouteStop[]>([]);
  const [selectedStop, setSelectedStop] = useState<AdminRouteStop | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadStops = useCallback(async () => {
    setError("");

    const result = await supabase
      .from("route_stops")
      .select(`
        id,
        booking_id,
        stop_date,
        stop_type,
        status,
        customer_name,
        customer_phone,
        address,
        city,
        state,
        zip,
        scheduled_start_time,
        scheduled_end_time,
        driver_name,
        truck_name,
        items_summary,
        setup_notes,
        pickup_notes,
        balance_due,
        payment_collected,
        sort_order,
        bookings (
          booking_number,
          status
        )
      `)
      .eq("stop_date", date)
      .in("stop_type", ["delivery", "pickup"])
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("scheduled_start_time", { ascending: true })
      .order("created_at", { ascending: true });

    if (result.error) {
      throw new Error(result.error.message);
    }

    setStops((result.data || []) as AdminRouteStop[]);
  }, [date]);

  useEffect(() => {
    setLoading(true);
    void loadStops()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load routes.",
        );
      })
      .finally(() => setLoading(false));
  }, [loadStops]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void loadStops()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not refresh routes.",
        );
      })
      .finally(() => setRefreshing(false));
  }, [loadStops]);

  const filteredStops = useMemo(() => {
    if (filter === "all") return stops;
    if (filter === "unassigned") return stops.filter(isUnassigned);

    return stops.filter(
      (stop) => String(stop.stop_type || "").toLowerCase() === filter,
    );
  }, [filter, stops]);

  const stats = useMemo(() => {
    const deliveries = stops.filter(
      (stop) => String(stop.stop_type || "").toLowerCase() === "delivery",
    ).length;
    const pickups = stops.filter(
      (stop) => String(stop.stop_type || "").toLowerCase() === "pickup",
    ).length;
    const unassigned = stops.filter(isUnassigned).length;
    const completed = stops.filter(isComplete).length;

    return {
      deliveries,
      pickups,
      unassigned,
      completed,
      total: stops.length,
    };
  }, [stops]);

  const driverGroups = useMemo(() => {
    const groups = new Map<string, AdminRouteStop[]>();

    for (const stop of filteredStops) {
      const driver = isUnassigned(stop)
        ? "Unassigned"
        : String(stop.driver_name || "").trim();

      const current = groups.get(driver) || [];
      current.push(stop);
      groups.set(driver, current);
    }

    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "Unassigned") return -1;
      if (b === "Unassigned") return 1;
      return a.localeCompare(b);
    });
  }, [filteredStops]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>

        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>Routes</Text>
            <Text style={styles.subtitle}>Live route board for the selected day</Text>
          </View>

          <Pressable
            onPress={() => {
              setDate(localDateISO());
              setFilter("all");
            }}
            style={({ pressed }) => [
              styles.todayButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.todayButtonText}>TODAY</Text>
          </Pressable>
        </View>

        <View style={styles.dateCard}>
          <Pressable
            onPress={() => setDate((current) => shiftDate(current, -1))}
            style={({ pressed }) => [
              styles.dateArrow,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.dateArrowText}>‹</Text>
          </Pressable>

          <View style={styles.dateCenter}>
            <Text style={styles.dateLabel}>{formatDate(date)}</Text>
            <Text style={styles.dateValue}>{date}</Text>
          </View>

          <Pressable
            onPress={() => setDate((current) => shiftDate(current, 1))}
            style={({ pressed }) => [
              styles.dateArrow,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.dateArrowText}>›</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          <StatCard label="Stops" value={stats.total} />
          <StatCard label="Delivery" value={stats.deliveries} />
          <StatCard label="Pickup" value={stats.pickups} />
          <StatCard label="Done" value={stats.completed} />
          <StatCard label="Unassigned" value={stats.unassigned} danger={stats.unassigned > 0} />
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {([
            ["all", `All ${stats.total}`],
            ["delivery", `Delivery ${stats.deliveries}`],
            ["pickup", `Pickup ${stats.pickups}`],
            ["unassigned", `Unassigned ${stats.unassigned}`],
          ] as Array<[RouteFilter, string]>).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={({ pressed }) => [
                styles.filterButton,
                filter === key ? styles.filterButtonActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === key ? styles.filterTextActive : null,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color="#23313f" />
            <Text style={styles.stateText}>Loading routes…</Text>
          </View>
        ) : error ? (
          <View style={[styles.stateCard, styles.errorCard]}>
            <Text style={styles.errorTitle}>Could not load routes</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => {
                setLoading(true);
                void loadStops().finally(() => setLoading(false));
              }}
              style={({ pressed }) => [
                styles.retryButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.retryText}>TRY AGAIN</Text>
            </Pressable>
          </View>
        ) : driverGroups.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.emptyTitle}>No route stops</Text>
            <Text style={styles.stateText}>
              There are no {filter === "all" ? "" : `${filter} `}stops for {formatDate(date).toLowerCase()}.
            </Text>
          </View>
        ) : (
          driverGroups.map(([driver, groupStops]) => (
            <View key={driver} style={styles.driverSection}>
              <View style={styles.driverHeader}>
                <View>
                  <Text style={styles.driverName}>{driver}</Text>
                  <Text style={styles.driverMeta}>
                    {groupStops.length} stop{groupStops.length === 1 ? "" : "s"}
                    {groupStops[0]?.truck_name ? ` · ${groupStops[0].truck_name}` : ""}
                  </Text>
                </View>

                {driver === "Unassigned" ? (
                  <View style={styles.unassignedBadge}>
                    <Text style={styles.unassignedBadgeText}>NEEDS DRIVER</Text>
                  </View>
                ) : null}
              </View>

              {groupStops.map((stop, index) => (
                <Pressable
                  key={stop.id}
                  onPress={() => setSelectedStop(stop)}
                  style={({ pressed }) => [
                    styles.stopCard,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.stopTopRow}>
                    <View
                      style={[
                        styles.sequence,
                        isComplete(stop) ? styles.sequenceDone : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sequenceText,
                          isComplete(stop) ? styles.sequenceTextDone : null,
                        ]}
                      >
                        {index + 1}
                      </Text>
                    </View>

                    <View style={styles.stopMain}>
                      <View style={styles.stopTitleRow}>
                        <Text style={styles.customerName} numberOfLines={1}>
                          {stop.customer_name || "Customer"}
                        </Text>
                        <Text
                          style={[
                            styles.typeBadge,
                            String(stop.stop_type || "").toLowerCase() === "pickup"
                              ? styles.pickupBadge
                              : styles.deliveryBadge,
                          ]}
                        >
                          {stopTypeLabel(stop)}
                        </Text>
                      </View>

                      <Text style={styles.bookingNumber}>{bookingLabel(stop)}</Text>
                      <Text style={styles.address} numberOfLines={2}>
                        {addressText(stop) || "Address not set"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stopBottomRow}>
                    <Text style={styles.time}>
                      {formatTime(stop.scheduled_start_time)}
                      {stop.scheduled_end_time
                        ? ` – ${formatTime(stop.scheduled_end_time)}`
                        : ""}
                    </Text>

                    <Text
                      style={[
                        styles.status,
                        isComplete(stop) ? styles.statusDone : null,
                      ]}
                    >
                      {titleCase(stop.status)}
                    </Text>
                  </View>

                  {stop.items_summary ? (
                    <Text style={styles.items} numberOfLines={2}>
                      {stop.items_summary}
                    </Text>
                  ) : null}

                  {Number(stop.balance_due || 0) > 0 ? (
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceLabel}>Balance due</Text>
                      <Text style={styles.balanceValue}>{money(stop.balance_due)}</Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <RouteStopDetails
        stop={selectedStop}
        onClose={() => setSelectedStop(null)}
      />
    </View>
  );
}

function StatCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <View style={[styles.statCard, danger ? styles.statCardDanger : null]}>
      <Text style={[styles.statValue, danger ? styles.statValueDanger : null]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RouteStopDetails({
  stop,
  onClose,
}: {
  stop: AdminRouteStop | null;
  onClose: () => void;
}) {
  if (!stop) return null;

  const address = addressText(stop);
  const phone = String(stop.customer_phone || "").trim();

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <ScrollView
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalEyebrow}>{stopTypeLabel(stop)}</Text>
                <Text style={styles.modalTitle}>
                  {stop.customer_name || "Customer"}
                </Text>
                <Text style={styles.modalBooking}>{bookingLabel(stop)}</Text>
              </View>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.detailGrid}>
              <Detail label="Time">
                {formatTime(stop.scheduled_start_time)}
                {stop.scheduled_end_time
                  ? ` – ${formatTime(stop.scheduled_end_time)}`
                  : ""}
              </Detail>
              <Detail label="Status">{titleCase(stop.status)}</Detail>
              <Detail label="Driver">
                {isUnassigned(stop) ? "Unassigned" : String(stop.driver_name)}
              </Detail>
              <Detail label="Truck">{stop.truck_name || "—"}</Detail>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.sectionLabel}>ADDRESS</Text>
              <Text style={styles.sectionValue}>{address || "Address not set"}</Text>

              {address ? (
                <Pressable
                  onPress={() => {
                    const url = `http://maps.apple.com/?q=${encodeURIComponent(address)}`;
                    void Linking.openURL(url);
                  }}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.primaryActionText}>OPEN IN MAPS</Text>
                </Pressable>
              ) : null}
            </View>

            {phone ? (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>CUSTOMER PHONE</Text>
                <Text style={styles.sectionValue}>{phone}</Text>
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${phone}`)}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.secondaryActionText}>CALL CUSTOMER</Text>
                </Pressable>
              </View>
            ) : null}

            {stop.items_summary ? (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>ITEMS</Text>
                <Text style={styles.sectionValue}>{stop.items_summary}</Text>
              </View>
            ) : null}

            {stop.setup_notes || stop.pickup_notes ? (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>NOTES</Text>
                <Text style={styles.sectionValue}>
                  {String(stop.setup_notes || stop.pickup_notes)}
                </Text>
              </View>
            ) : null}

            <View style={styles.modalSection}>
              <Text style={styles.sectionLabel}>PAYMENT</Text>
              <View style={styles.paymentRow}>
                <Text style={styles.sectionValue}>Balance due</Text>
                <Text style={styles.paymentValue}>{money(stop.balance_due)}</Text>
              </View>
              {stop.payment_collected ? (
                <Text style={styles.paymentCollected}>Payment marked collected</Text>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: {
    paddingTop: 62,
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  eyebrow: {
    color: "#b88645",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.7,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 6,
  },
  title: { color: "#23313f", fontSize: 32, fontWeight: "900" },
  subtitle: {
    color: "#81766a",
    fontSize: 12,
    marginTop: 3,
  },
  todayButton: {
    backgroundColor: "#23313f",
    borderRadius: 12,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  todayButtonText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  dateCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    minHeight: 72,
    paddingHorizontal: 8,
  },
  dateArrow: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dateArrowText: {
    color: "#23313f",
    fontSize: 36,
    fontWeight: "400",
    lineHeight: 38,
  },
  dateCenter: { flex: 1, alignItems: "center" },
  dateLabel: {
    color: "#23313f",
    fontSize: 16,
    fontWeight: "900",
  },
  dateValue: {
    color: "#81766a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  statsRow: {
    gap: 9,
    paddingVertical: 14,
  },
  statCard: {
    minWidth: 92,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  statCardDanger: {
    borderWidth: 1,
    borderColor: "#d9b6b2",
  },
  statValue: {
    color: "#23313f",
    fontSize: 22,
    fontWeight: "900",
  },
  statValueDanger: { color: "#8c2e2a" },
  statLabel: {
    color: "#81766a",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },
  filters: { gap: 8, paddingBottom: 14 },
  filterButton: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 38,
    justifyContent: "center",
  },
  filterButtonActive: { backgroundColor: "#23313f" },
  filterText: {
    color: "#81766a",
    fontSize: 11,
    fontWeight: "900",
  },
  filterTextActive: { color: "#ffffff" },
  stateCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    alignItems: "center",
    padding: 28,
    marginTop: 8,
  },
  errorCard: {
    backgroundColor: "#fff1f0",
    alignItems: "flex-start",
  },
  stateText: {
    color: "#81766a",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 9,
  },
  emptyTitle: {
    color: "#23313f",
    fontSize: 17,
    fontWeight: "900",
  },
  errorTitle: {
    color: "#8c2e2a",
    fontSize: 16,
    fontWeight: "900",
  },
  errorText: {
    color: "#8c2e2a",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  retryButton: {
    backgroundColor: "#23313f",
    borderRadius: 12,
    minHeight: 40,
    justifyContent: "center",
    marginTop: 14,
    paddingHorizontal: 16,
  },
  retryText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },
  driverSection: { marginTop: 10 },
  driverHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: 8,
    marginTop: 5,
  },
  driverName: {
    color: "#23313f",
    fontSize: 17,
    fontWeight: "900",
  },
  driverMeta: {
    color: "#81766a",
    fontSize: 11,
    marginTop: 2,
  },
  unassignedBadge: {
    backgroundColor: "#fff1f0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  unassignedBadgeText: {
    color: "#8c2e2a",
    fontSize: 9,
    fontWeight: "900",
  },
  stopCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    marginBottom: 10,
    padding: 14,
  },
  stopTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  sequence: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "#f0c987",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  sequenceDone: { backgroundColor: "#dfe7dc" },
  sequenceText: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "900",
  },
  sequenceTextDone: { color: "#5f735c" },
  stopMain: { flex: 1 },
  stopTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customerName: {
    flex: 1,
    color: "#23313f",
    fontSize: 15,
    fontWeight: "900",
  },
  typeBadge: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 8,
    fontWeight: "900",
  },
  deliveryBadge: {
    backgroundColor: "#f7ead0",
    color: "#8a6437",
  },
  pickupBadge: {
    backgroundColor: "#e6f0f5",
    color: "#5f8faa",
  },
  bookingNumber: {
    color: "#b88645",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 3,
  },
  address: {
    color: "#6c6258",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  stopBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  time: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "800",
  },
  status: {
    color: "#b88645",
    fontSize: 10,
    fontWeight: "900",
  },
  statusDone: { color: "#5f735c" },
  items: {
    color: "#81766a",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5ddd1",
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 9,
    backgroundColor: "#fff8e9",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  balanceLabel: {
    color: "#81766a",
    fontSize: 10,
    fontWeight: "800",
  },
  balanceValue: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "900",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(35,49,63,0.28)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#f5f1e8",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "88%",
    minHeight: "55%",
    paddingTop: 8,
  },
  modalHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#cbbfaf",
    marginBottom: 3,
  },
  modalContent: {
    paddingHorizontal: 18,
    paddingBottom: 38,
    paddingTop: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  modalHeaderText: { flex: 1, paddingRight: 12 },
  modalEyebrow: {
    color: "#b88645",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  modalTitle: {
    color: "#23313f",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 4,
  },
  modalBooking: {
    color: "#81766a",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: "#23313f",
    fontSize: 25,
    lineHeight: 27,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
  },
  detailCell: {
    width: "48.5%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 13,
  },
  detailLabel: {
    color: "#81766a",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4,
  },
  modalSection: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    marginTop: 10,
    padding: 15,
  },
  sectionLabel: {
    color: "#b88645",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionValue: {
    color: "#23313f",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  primaryAction: {
    backgroundColor: "#23313f",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: 12,
  },
  primaryActionText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  secondaryAction: {
    borderColor: "#cbbfaf",
    borderWidth: 1,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: 12,
  },
  secondaryActionText: {
    color: "#23313f",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  paymentValue: {
    color: "#23313f",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5,
  },
  paymentCollected: {
    color: "#5f735c",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
  },
  pressed: { opacity: 0.7 },
});

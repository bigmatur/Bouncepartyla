import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  loadQuickAvailabilityFromMobile,
  type MobileQuickAvailabilityItem,
  type MobileQuickAvailabilitySnapshot,
} from "../../lib/mobileApi";

type StatusFilter = "all" | "available" | "unavailable";

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
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function AdminAvailabilityScreen({
  onCreateBooking,
}: {
  onCreateBooking?: (params: {
    eventDate: string;
    eventStartTime: string;
    eventEndTime: string;
    productIds: string[];
  }) => void;
}) {
  const [eventDate, setEventDate] = useState(localDateISO);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("21:00");
  const [snapshot, setSnapshot] = useState<MobileQuickAvailabilitySnapshot | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const result = await loadQuickAvailabilityFromMobile({
      eventDate,
      eventStartTime: startTime,
      eventEndTime: endTime,
    });
    if (!result.success) {
      setError(result.error || "Could not check availability.");
      return;
    }
    setSnapshot(result.data);
    setSelectedIds((current) =>
      current.filter((id) =>
        result.data.items.some((item) => item.productId === id && item.available && !item.checkFailed),
      ),
    );
  }, [endTime, eventDate, startTime]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const counts = useMemo(() => {
    const items = snapshot?.items || [];
    return {
      total: items.length,
      available: items.filter((item) => item.available && !item.checkFailed).length,
      unavailable: items.filter((item) => !item.available && !item.checkFailed).length,
      failed: items.filter((item) => item.checkFailed).length,
    };
  }, [snapshot]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (snapshot?.items || []).filter((item) => {
      if (category !== "all" && (item.categoryId || "uncategorized") !== category) return false;
      if (statusFilter === "available" && (!item.available || item.checkFailed)) return false;
      if (statusFilter === "unavailable" && item.available && !item.checkFailed) return false;
      if (query && !`${item.productName} ${item.categoryName}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [category, search, snapshot, statusFilter]);

  const toggle = (item: MobileQuickAvailabilityItem) => {
    if (!item.available || item.checkFailed) return;
    setSelectedIds((current) =>
      current.includes(item.productId)
        ? current.filter((id) => id !== item.productId)
        : [...current, item.productId],
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <Text style={styles.eyebrow}>BOOKING OPERATIONS</Text>
        <Text style={styles.title}>Availability</Text>
        <Text style={styles.subtitle}>Check real inventory before promising a date.</Text>

        <View style={styles.controlsCard}>
          <View style={styles.dateRow}>
            <Pressable onPress={() => setEventDate((value) => shiftDate(value, -1))} style={styles.arrowButton}>
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
            <Pressable onPress={() => setEventDate(localDateISO())} style={styles.dateCenter}>
              <Text style={styles.dateLabel}>{formatDate(eventDate)}</Text>
              <Text style={styles.dateValue}>{eventDate}</Text>
            </Pressable>
            <Pressable onPress={() => setEventDate((value) => shiftDate(value, 1))} style={styles.arrowButton}>
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Text style={styles.fieldLabel}>START</Text>
              <TextInput value={startTime} onChangeText={setStartTime} placeholder="09:00" style={styles.input} />
            </View>
            <View style={styles.timeField}>
              <Text style={styles.fieldLabel}>END</Text>
              <TextInput value={endTime} onChangeText={setEndTime} placeholder="21:00" style={styles.input} />
            </View>
          </View>

          <Pressable onPress={refresh} disabled={loading || refreshing} style={styles.checkButton}>
            <Text style={styles.checkButtonText}>{loading || refreshing ? "CHECKING…" : "CHECK AVAILABILITY"}</Text>
          </Pressable>
        </View>

        <View style={styles.summaryRow}>
          <Summary value={counts.available} label="Available" tone="good" />
          <Summary value={counts.unavailable} label="Unavailable" tone="bad" />
          <Summary value={counts.failed} label="Check failed" tone="neutral" />
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search product or category"
          placeholderTextColor="#a59b91"
          style={styles.searchInput}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {(["all", "available", "unavailable"] as StatusFilter[]).map((value) => (
            <FilterButton
              key={value}
              active={statusFilter === value}
              label={value === "all" ? `All ${counts.total}` : `${value[0].toUpperCase()}${value.slice(1)}`}
              onPress={() => setStatusFilter(value)}
            />
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          <FilterButton active={category === "all"} label="All categories" onPress={() => setCategory("all")} />
          {(snapshot?.categories || []).map((item) => (
            <FilterButton
              key={item.id}
              active={category === item.id}
              label={`${item.name} ${item.count}`}
              onPress={() => setCategory(item.id)}
            />
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.stateCard}><ActivityIndicator color="#23313f" /><Text style={styles.stateText}>Checking inventory…</Text></View>
        ) : error ? (
          <View style={[styles.stateCard, styles.errorCard]}><Text style={styles.errorTitle}>Availability check failed</Text><Text style={styles.errorText}>{error}</Text></View>
        ) : visibleItems.length === 0 ? (
          <View style={styles.stateCard}><Text style={styles.emptyTitle}>No products match</Text><Text style={styles.stateText}>Change the filters or search.</Text></View>
        ) : (
          visibleItems.map((item) => (
            <ProductCard
              key={item.productId}
              item={item}
              selected={selectedIds.includes(item.productId)}
              onPress={() => toggle(item)}
            />
          ))
        )}
      </ScrollView>

      {selectedIds.length > 0 && onCreateBooking ? (
        <View style={styles.selectionBar}>
          <View><Text style={styles.selectionCount}>{selectedIds.length} selected</Text><Text style={styles.selectionHint}>Available products only</Text></View>
          <Pressable
            onPress={() => onCreateBooking({ eventDate, eventStartTime: startTime, eventEndTime: endTime, productIds: selectedIds })}
            style={styles.createButton}
          >
            <Text style={styles.createButtonText}>CREATE BOOKING</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Summary({ value, label, tone }: { value: number; label: string; tone: "good" | "bad" | "neutral" }) {
  return <View style={styles.summaryCard}><Text style={[styles.summaryValue, tone === "good" ? styles.good : tone === "bad" ? styles.bad : null]}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

function FilterButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.filterButton, active ? styles.filterButtonActive : null]}><Text style={[styles.filterText, active ? styles.filterTextActive : null]}>{label}</Text></Pressable>;
}

function ProductCard({ item, selected, onPress }: { item: MobileQuickAvailabilityItem; selected: boolean; onPress: () => void }) {
  const available = item.available && !item.checkFailed;
  return (
    <Pressable onPress={onPress} disabled={!available} style={[styles.productCard, selected ? styles.productCardSelected : null, !available ? styles.productCardDisabled : null]}>
      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.productImage} /> : <View style={styles.productPlaceholder}><Text style={styles.productPlaceholderText}>NO IMG</Text></View>}
      <View style={styles.productMain}>
        <View style={styles.productTitleRow}>
          <Text numberOfLines={1} style={styles.productName}>{item.productName}</Text>
          <View style={[styles.badge, available ? styles.availableBadge : item.checkFailed ? styles.failedBadge : styles.unavailableBadge]}><Text style={styles.badgeText}>{available ? "AVAILABLE" : item.checkFailed ? "CHECK FAILED" : "UNAVAILABLE"}</Text></View>
        </View>
        <Text style={styles.productMeta}>{available ? `${Math.max(0, item.remainingQuantity)} left` : item.categoryName} · {item.categoryName}</Text>
        {item.message ? <Text numberOfLines={3} style={styles.productReason}>{item.message}</Text> : null}
      </View>
      {available ? <View style={[styles.checkbox, selected ? styles.checkboxSelected : null]}><Text style={styles.checkmark}>{selected ? "✓" : ""}</Text></View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: { paddingHorizontal: 16, paddingTop: 58, paddingBottom: 180 },
  eyebrow: { color: "#b88645", fontSize: 11, fontWeight: "900", letterSpacing: 1.7 },
  title: { color: "#23313f", fontSize: 32, fontWeight: "900", marginTop: 5 },
  subtitle: { color: "#81766a", fontSize: 13, lineHeight: 18, marginTop: 3 },
  controlsCard: { backgroundColor: "#ffffff", borderRadius: 22, marginTop: 18, padding: 14 },
  dateRow: { alignItems: "center", flexDirection: "row" },
  arrowButton: { alignItems: "center", height: 48, justifyContent: "center", width: 48 },
  arrowText: { color: "#23313f", fontSize: 34, lineHeight: 36 },
  dateCenter: { alignItems: "center", flex: 1 },
  dateLabel: { color: "#23313f", fontSize: 16, fontWeight: "900" },
  dateValue: { color: "#81766a", fontSize: 11, marginTop: 2 },
  timeRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  timeField: { flex: 1 },
  fieldLabel: { color: "#b88645", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 },
  input: { backgroundColor: "#f7f3ed", borderColor: "#ded6c8", borderRadius: 14, borderWidth: 1, color: "#23313f", fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  checkButton: { alignItems: "center", backgroundColor: "#23313f", borderRadius: 15, justifyContent: "center", marginTop: 12, minHeight: 48 },
  checkButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  summaryRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  summaryCard: { backgroundColor: "#ffffff", borderRadius: 17, flex: 1, minHeight: 78, padding: 12 },
  summaryValue: { color: "#23313f", fontSize: 22, fontWeight: "900" },
  summaryLabel: { color: "#81766a", fontSize: 10, fontWeight: "800", marginTop: 4 },
  good: { color: "#277a5b" },
  bad: { color: "#a4493d" },
  searchInput: { backgroundColor: "#ffffff", borderRadius: 16, color: "#23313f", fontSize: 14, marginTop: 12, minHeight: 50, paddingHorizontal: 15 },
  filters: { gap: 8, paddingTop: 10 },
  categoryRow: { gap: 8, paddingBottom: 12, paddingTop: 8 },
  filterButton: { backgroundColor: "#ffffff", borderColor: "#ded6c8", borderRadius: 18, borderWidth: 1, justifyContent: "center", minHeight: 38, paddingHorizontal: 13 },
  filterButtonActive: { backgroundColor: "#23313f", borderColor: "#23313f" },
  filterText: { color: "#6c6258", fontSize: 11, fontWeight: "800" },
  filterTextActive: { color: "#ffffff" },
  stateCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, gap: 9, justifyContent: "center", minHeight: 150, padding: 18 },
  stateText: { color: "#81766a", fontSize: 12, textAlign: "center" },
  emptyTitle: { color: "#23313f", fontSize: 17, fontWeight: "900" },
  errorCard: { backgroundColor: "#fff1f0" },
  errorTitle: { color: "#8c2e2a", fontSize: 16, fontWeight: "900" },
  errorText: { color: "#7a4844", fontSize: 11, lineHeight: 17, textAlign: "center" },
  productCard: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "transparent", borderRadius: 18, borderWidth: 2, flexDirection: "row", marginBottom: 9, minHeight: 92, padding: 10 },
  productCardSelected: { borderColor: "#277a5b" },
  productCardDisabled: { opacity: 0.72 },
  productImage: { borderRadius: 12, height: 62, width: 62 },
  productPlaceholder: { alignItems: "center", backgroundColor: "#eee8df", borderRadius: 12, height: 62, justifyContent: "center", width: 62 },
  productPlaceholderText: { color: "#9a8f84", fontSize: 8, fontWeight: "800" },
  productMain: { flex: 1, marginLeft: 11 },
  productTitleRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  productName: { color: "#23313f", flex: 1, fontSize: 14, fontWeight: "900" },
  productMeta: { color: "#81766a", fontSize: 11, marginTop: 4 },
  productReason: { color: "#8c4c3c", fontSize: 10, lineHeight: 14, marginTop: 4 },
  badge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  availableBadge: { backgroundColor: "#e4f5ed" },
  unavailableBadge: { backgroundColor: "#fde8e5" },
  failedBadge: { backgroundColor: "#e9edf1" },
  badgeText: { color: "#23313f", fontSize: 7, fontWeight: "900" },
  checkbox: { alignItems: "center", borderColor: "#c9c0b5", borderRadius: 8, borderWidth: 2, height: 25, justifyContent: "center", marginLeft: 8, width: 25 },
  checkboxSelected: { backgroundColor: "#277a5b", borderColor: "#277a5b" },
  checkmark: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  selectionBar: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 22, bottom: 8, flexDirection: "row", justifyContent: "space-between", left: 10, padding: 12, position: "absolute", right: 10 },
  selectionCount: { color: "#23313f", fontSize: 14, fontWeight: "900" },
  selectionHint: { color: "#81766a", fontSize: 9, marginTop: 2 },
  createButton: { alignItems: "center", backgroundColor: "#d3a04c", borderRadius: 15, justifyContent: "center", minHeight: 48, paddingHorizontal: 16 },
  createButtonText: { color: "#23313f", fontSize: 10, fontWeight: "900" },
});

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";

type RouteStop = {
  id: string;
  booking_id: string;
  stop_date?: string | null;
  scheduled_start_time?: string | null;
  driver_name?: string | null;
  truck_name?: string | null;
  sort_order?: number | null;
};

type Booking = {
  id: string;
  booking_number?: string | null;
  event_date?: string | null;
  event_start_time?: string | null;
  setup_address?: string | null;
  setup_city?: string | null;
  setup_zip?: string | null;
  customers?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
  booking_items?: Array<{
    id: string;
    products?: { name?: string | null } | Array<{ name?: string | null }> | null;
  }> | null;
  booking_modifiers?: Array<{
    booking_item_id?: string | null;
    inventory_item_id?: string | null;
  }> | null;
};

type ChecklistItem = {
  id: string;
  booking_id: string;
  booking_item_id?: string | null;
  inventory_item_id?: string | null;
  title?: string | null;
  item_type?: string | null;
  source?: string | null;
  quantity?: number | string | null;
  loaded?: boolean | null;
  sort_order?: number | null;
  inventory_items?: { sku?: string | null } | Array<{ sku?: string | null }> | null;
  inventory_units?: { unit_code?: string | null; serial_number?: string | null } | Array<{ unit_code?: string | null; serial_number?: string | null }> | null;
};

type PickOrder = {
  stop: RouteStop;
  booking: Booking;
  checklist: ChecklistItem[];
};

function visibleChecklistItems(checklist: ChecklistItem[]) {
  const bookingItemIdsWithPhysicalRows = new Set(
    checklist
      .filter((item) => String(item.item_type || "").toLowerCase() !== "equipment")
      .map((item) => String(item.booking_item_id || ""))
      .filter(Boolean),
  );

  return checklist.filter((item) => {
    const isBookingEquipment = String(item.item_type || "").toLowerCase() === "equipment";
    const bookingItemId = String(item.booking_item_id || "");

    return !(isBookingEquipment && bookingItemId && bookingItemIdsWithPhysicalRows.has(bookingItemId));
  });
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

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
  if (value === localDateISO()) return "Today";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTime(value?: string | null) {
  if (!value) return "No time";
  const [hourRaw, minuteRaw] = value.split(":");
  const hours = Number(hourRaw);
  const minutes = Number(minuteRaw || 0);
  if (!Number.isFinite(hours)) return value;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function address(booking: Booking) {
  return [booking.setup_address, booking.setup_city, booking.setup_zip].filter(Boolean).join(", ");
}

function customerName(booking: Booking) {
  return firstRelation(booking.customers)?.full_name || "Customer";
}

function bookingLabel(booking: Booking) {
  return booking.booking_number ? `#${booking.booking_number}` : `#${booking.id.slice(0, 8)}`;
}

function progress(items: ChecklistItem[]) {
  const done = items.filter((item) => Boolean(item.loaded)).length;
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 };
}

function checklistGroups(booking: Booking, checklist: ChecklistItem[]) {
  const modifierParentsByInventoryItem = new Map<string, Set<string>>();
  const modifierPairs = new Set<string>();
  for (const modifier of booking.booking_modifiers || []) {
    const inventoryItemId = String(modifier.inventory_item_id || "");
    const bookingItemId = String(modifier.booking_item_id || "");
    if (!inventoryItemId || !bookingItemId) continue;
    const parents = modifierParentsByInventoryItem.get(inventoryItemId) || new Set<string>();
    parents.add(bookingItemId);
    modifierParentsByInventoryItem.set(inventoryItemId, parents);
    modifierPairs.add(`${bookingItemId}:${inventoryItemId}`);
  }

  const rows = checklist.map((item) => {
    const inventoryItemId = String(item.inventory_item_id || "");
    const explicitBookingItemId = String(item.booking_item_id || "");
    const modifierParents = modifierParentsByInventoryItem.get(inventoryItemId);
    const inferredBookingItemId = modifierParents?.size === 1 ? Array.from(modifierParents)[0] : "";
    const bookingItemId = explicitBookingItemId || inferredBookingItemId;
    return {
      item,
      bookingItemId,
      isAdditional: Boolean(inventoryItemId && bookingItemId && modifierPairs.has(`${bookingItemId}:${inventoryItemId}`)),
    };
  });

  const groups: Array<{ key: string; name: string; items: ChecklistItem[]; additionalItems: ChecklistItem[] }> = [];
  const assigned = new Set<string>();

  for (const [index, bookingItem] of (booking.booking_items || []).entries()) {
    const bookingItemId = String(bookingItem.id || "");
    const matched = rows.filter((row) => row.bookingItemId === bookingItemId);
    if (matched.length === 0) continue;

    matched.forEach((row) => assigned.add(row.item.id));
    groups.push({
      key: bookingItemId || `product-${index}`,
      name: firstRelation(bookingItem.products)?.name || `Product ${index + 1}`,
      items: matched.filter((row) => !row.isAdditional).map((row) => row.item),
      additionalItems: matched.filter((row) => row.isAdditional).map((row) => row.item),
    });
  }

  const additional = checklist.filter((item) => !assigned.has(item.id));
  if (additional.length > 0) {
    groups.push({ key: "additional", name: "Additional booking items", items: additional, additionalItems: [] });
  }

  return groups;
}

export function AdminPickingScreen({ onBack }: { onBack?: () => void }) {
  const [date, setDate] = useState(localDateISO);
  const [orders, setOrders] = useState<PickOrder[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    setError("");
    const stopsResult = await supabase
      .from("route_stops")
      .select("id, booking_id, stop_date, scheduled_start_time, driver_name, truck_name, sort_order")
      .eq("stop_date", date)
      .eq("stop_type", "delivery")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("scheduled_start_time", { ascending: true })
      .order("created_at", { ascending: true });

    if (stopsResult.error) throw new Error(stopsResult.error.message);
    const stops = (stopsResult.data || []).filter((stop) => stop.booking_id) as RouteStop[];
    const bookingIds = Array.from(new Set(stops.map((stop) => String(stop.booking_id))));

    if (bookingIds.length === 0) {
      setOrders([]);
      return;
    }

    const [bookingsResult, checklistResult] = await Promise.all([
      supabase
        .from("bookings")
        .select(`
          id,
          booking_number,
          event_date,
          event_start_time,
          setup_address,
          setup_city,
          setup_zip,
          customers ( full_name ),
          booking_items ( id, products ( name ) ),
          booking_modifiers ( booking_item_id, inventory_item_id )
        `)
        .in("id", bookingIds)
        .not("status", "in", "(cancelled,refunded)"),
      supabase
        .from("booking_checklist_items")
        .select(`
          id,
          booking_id,
          booking_item_id,
          inventory_item_id,
          title,
          item_type,
          source,
          quantity,
          loaded,
          sort_order,
          inventory_items ( sku ),
          inventory_units ( unit_code, serial_number )
        `)
        .in("booking_id", bookingIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (bookingsResult.error) throw new Error(bookingsResult.error.message);
    if (checklistResult.error) throw new Error(checklistResult.error.message);

    const bookingsById = new Map((bookingsResult.data || []).map((booking) => [String(booking.id), booking as Booking]));
    const checklistByBookingId = new Map<string, ChecklistItem[]>();
    for (const item of (checklistResult.data || []) as ChecklistItem[]) {
      const rows = checklistByBookingId.get(String(item.booking_id)) || [];
      rows.push(item);
      checklistByBookingId.set(String(item.booking_id), rows);
    }

    setOrders(stops.flatMap((stop) => {
      const booking = bookingsById.get(String(stop.booking_id));
      const checklist = visibleChecklistItems(checklistByBookingId.get(String(stop.booking_id)) || []);
      return booking ? [{ stop, booking, checklist }] : [];
    }));
  }, [date]);

  useEffect(() => {
    setLoading(true);
    void loadOrders()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load picking orders."))
      .finally(() => setLoading(false));
  }, [loadOrders]);

  const groups = useMemo(() => {
    const result = new Map<string, PickOrder[]>();
    for (const order of orders) {
      const vehicle = String(
        order.stop.truck_name ||
        (order.stop.driver_name ? `${order.stop.driver_name} route` : "No vehicle assigned"),
      );
      const rows = result.get(vehicle) || [];
      rows.push(order);
      result.set(vehicle, rows);
    }
    return Array.from(result.entries());
  }, [orders]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void loadOrders()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not refresh picking orders."))
      .finally(() => setRefreshing(false));
  }, [loadOrders]);

  const toggleItem = useCallback(async (order: PickOrder, item: ChecklistItem) => {
    const next = !Boolean(item.loaded);
    setPending(item.id);
    setError("");
    setOrders((current) => current.map((row) => row.booking.id !== order.booking.id
      ? row
      : { ...row, checklist: row.checklist.map((entry) => entry.id === item.id ? { ...entry, loaded: next } : entry) }));
    const result = await supabase
      .from("booking_checklist_items")
      .update({
        loaded: next,
        loaded_at: next ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("booking_id", order.booking.id);

    if (result.error) {
      setError(result.error.message);
      setOrders((current) => current.map((row) => row.booking.id !== order.booking.id
        ? row
        : { ...row, checklist: row.checklist.map((entry) => entry.id === item.id ? { ...entry, loaded: !next } : entry) }));
    }
    setPending(null);
  }, []);

  const setAll = useCallback(async (order: PickOrder, loaded: boolean) => {
    setPending(`all-${order.booking.id}`);
    setError("");
    const previous = order.checklist.map((entry) => ({ id: entry.id, loaded: Boolean(entry.loaded) }));
    setOrders((current) => current.map((row) => row.booking.id !== order.booking.id
      ? row
      : { ...row, checklist: row.checklist.map((entry) => ({ ...entry, loaded })) }));
    const result = await supabase
      .from("booking_checklist_items")
      .update({
        loaded,
        loaded_at: loaded ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("booking_id", order.booking.id);

    if (result.error) {
      setError(result.error.message);
      const previousById = new Map(previous.map((entry) => [entry.id, entry.loaded]));
      setOrders((current) => current.map((row) => row.booking.id !== order.booking.id
        ? row
        : { ...row, checklist: row.checklist.map((entry) => ({ ...entry, loaded: previousById.get(entry.id) ?? entry.loaded })) }));
    }
    setPending(null);
  }, []);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>WAREHOUSE</Text>
          <Text style={styles.title}>Order picking</Text>
          <Text style={styles.subtitle}>Load each vehicle in route order</Text>
        </View>
        {onBack ? <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>BACK</Text></Pressable> : null}
      </View>

      <View style={styles.dateCard}>
        <Pressable onPress={() => setDate((current) => shiftDate(current, -1))} style={styles.dateArrow}><Text style={styles.dateArrowText}>‹</Text></Pressable>
        <Pressable onPress={() => setDate(localDateISO())} style={styles.dateCenter}>
          <Text style={styles.dateLabel}>{formatDate(date)}</Text>
          <Text style={styles.dateValue}>{date}</Text>
        </Pressable>
        <Pressable onPress={() => setDate((current) => shiftDate(current, 1))} style={styles.dateArrow}><Text style={styles.dateArrowText}>›</Text></Pressable>
      </View>

      {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>Picking could not update</Text><Text style={styles.errorText}>{error}</Text></View> : null}

      {loading ? (
        <View style={styles.stateCard}><ActivityIndicator color="#23313f" /><Text style={styles.stateText}>Loading delivery loads…</Text></View>
      ) : groups.length === 0 ? (
        <View style={styles.stateCard}><Text style={styles.emptyTitle}>No deliveries</Text><Text style={styles.stateText}>No delivery orders are scheduled for this date.</Text></View>
      ) : groups.map(([vehicle, vehicleOrders]) => {
        const allItems = vehicleOrders.flatMap((order) => order.checklist);
        const vehicleProgress = progress(allItems);
        const drivers = Array.from(new Set(vehicleOrders.map((order) => order.stop.driver_name || "Unassigned")));
        return (
          <View key={vehicle} style={styles.vehicleSection}>
            <View style={styles.vehicleHeader}>
              <View style={styles.vehicleCopy}>
                <Text style={styles.vehicleLabel}>VEHICLE / LOAD</Text>
                <Text style={styles.vehicleName}>{vehicle}</Text>
                <Text style={styles.driverName}>Driver: {drivers.join(", ")}</Text>
              </View>
              <View style={styles.progressBadge}><Text style={styles.progressBadgeText}>{vehicleProgress.done}/{vehicleProgress.total}</Text></View>
            </View>

            {vehicleOrders.map((order, index) => {
              const orderProgress = progress(order.checklist);
              const itemGroups = checklistGroups(order.booking, order.checklist);
              const isOpen = Boolean(expanded[order.booking.id]);
              return (
                <View key={order.stop.id} style={styles.orderCard}>
                  <Pressable onPress={() => setExpanded((current) => ({ ...current, [order.booking.id]: !current[order.booking.id] }))} style={styles.orderSummary}>
                    <View style={styles.sequence}><Text style={styles.sequenceText}>{index + 1}</Text></View>
                    <View style={styles.orderCopy}>
                      <Text style={styles.orderTitle} numberOfLines={2}>{customerName(order.booking)} · {bookingLabel(order.booking)}</Text>
                      <Text style={styles.orderMeta}>{formatTime(order.stop.scheduled_start_time)} · {orderProgress.done}/{orderProgress.total} loaded</Text>
                      <Text style={styles.orderAddress} numberOfLines={2}>{address(order.booking) || "No delivery address"}</Text>
                    </View>
                    <Text style={styles.chevron}>{isOpen ? "⌃" : "⌄"}</Text>
                  </Pressable>

                  {isOpen ? (
                    <View style={styles.checklistArea}>
                      {order.checklist.length > 0 ? (
                        <Pressable
                          disabled={pending !== null}
                          onPress={() => void setAll(order, orderProgress.percent !== 100)}
                          style={styles.selectAllButton}
                        >
                          <Text style={styles.selectAllText}>{orderProgress.percent === 100 ? "CLEAR ALL" : "MARK ALL LOADED"}</Text>
                        </Pressable>
                      ) : null}

                      {itemGroups.map((group, groupIndex) => (
                        <View key={group.key} style={styles.productGroup}>
                          <View style={styles.productGroupHeader}>
                            <View style={styles.productGroupCopy}>
                              <Text style={styles.productGroupLabel}>PRODUCT {groupIndex + 1}</Text>
                              <Text style={styles.productGroupName}>{group.name}</Text>
                            </View>
                            <View style={styles.productGroupCount}><Text style={styles.productGroupCountText}>{group.items.length + group.additionalItems.length}</Text></View>
                          </View>
                          <View style={styles.productGroupItems}>
                            {group.items.map((item) => {
                              const checked = Boolean(item.loaded);
                              const unit = firstRelation(item.inventory_units);
                              const inventory = firstRelation(item.inventory_items);
                              const detail = [
                                `Qty ${Number(item.quantity || 1)}`,
                                unit?.unit_code || unit?.serial_number,
                                inventory?.sku,
                              ].filter(Boolean).join(" · ");
                              return (
                                <Pressable
                                  key={item.id}
                                  disabled={pending !== null}
                                  onPress={() => void toggleItem(order, item)}
                                  style={[styles.checklistRow, checked ? styles.checklistRowDone : null]}
                                >
                                  <View style={[styles.checkbox, checked ? styles.checkboxDone : null]}>
                                    <Text style={styles.checkmark}>{checked ? "✓" : ""}</Text>
                                  </View>
                                  <View style={styles.checklistCopy}>
                                    <Text style={[styles.itemTitle, checked ? styles.itemTitleDone : null]}>{item.title || "Checklist item"}</Text>
                                    <Text style={styles.itemMeta}>{detail}</Text>
                                    <Text style={styles.itemType}>{String(item.item_type || item.source || "item").replace(/_/g, " ").toUpperCase()}</Text>
                                  </View>
                                </Pressable>
                              );
                            })}
                            {group.additionalItems.length > 0 ? (
                              <View style={styles.additionalHeader}>
                                <Text style={styles.additionalHeaderText}>ADDITIONAL BOOKING ITEMS</Text>
                              </View>
                            ) : null}
                            {group.additionalItems.map((item) => {
                              const checked = Boolean(item.loaded);
                              const unit = firstRelation(item.inventory_units);
                              const inventory = firstRelation(item.inventory_items);
                              const detail = [
                                `Qty ${Number(item.quantity || 1)}`,
                                unit?.unit_code || unit?.serial_number,
                                inventory?.sku,
                              ].filter(Boolean).join(" · ");
                              return (
                                <Pressable
                                  key={item.id}
                                  disabled={pending !== null}
                                  onPress={() => void toggleItem(order, item)}
                                  style={[styles.checklistRow, checked ? styles.checklistRowDone : null]}
                                >
                                  <View style={[styles.checkbox, checked ? styles.checkboxDone : null]}>
                                    <Text style={styles.checkmark}>{checked ? "✓" : ""}</Text>
                                  </View>
                                  <View style={styles.checklistCopy}>
                                    <Text style={[styles.itemTitle, checked ? styles.itemTitleDone : null]}>{item.title || "Checklist item"}</Text>
                                    <Text style={styles.itemMeta}>{detail}</Text>
                                    <Text style={styles.itemType}>{String(item.item_type || item.source || "item").replace(/_/g, " ").toUpperCase()}</Text>
                                  </View>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      ))}

                      {order.checklist.length === 0 ? <Text style={styles.noItems}>No checklist items have been generated for this booking.</Text> : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: { paddingTop: 62, paddingHorizontal: 18, paddingBottom: 120 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#b88645", fontSize: 11, fontWeight: "900", letterSpacing: 1.7 },
  title: { color: "#23313f", fontSize: 32, fontWeight: "900", marginTop: 6 },
  subtitle: { color: "#81766a", fontSize: 12, marginTop: 3 },
  backButton: { borderColor: "#cbbfaf", borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  backText: { color: "#23313f", fontSize: 10, fontWeight: "900" },
  dateCard: { backgroundColor: "#fff", borderRadius: 22, flexDirection: "row", alignItems: "center", marginTop: 20, padding: 10 },
  dateArrow: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#f3eadc", alignItems: "center", justifyContent: "center" },
  dateArrowText: { color: "#23313f", fontSize: 28, fontWeight: "900" },
  dateCenter: { flex: 1, alignItems: "center" },
  dateLabel: { color: "#23313f", fontSize: 17, fontWeight: "900" },
  dateValue: { color: "#81766a", fontSize: 10, marginTop: 3 },
  errorCard: { backgroundColor: "#fff1ef", borderColor: "#efb7ae", borderWidth: 1, borderRadius: 18, marginTop: 14, padding: 14 },
  errorTitle: { color: "#a63c2d", fontSize: 13, fontWeight: "900" },
  errorText: { color: "#a63c2d", fontSize: 11, lineHeight: 16, marginTop: 4 },
  stateCard: { backgroundColor: "#fff", borderRadius: 22, alignItems: "center", marginTop: 18, padding: 28 },
  stateText: { color: "#81766a", fontSize: 12, lineHeight: 18, marginTop: 8, textAlign: "center" },
  emptyTitle: { color: "#23313f", fontSize: 18, fontWeight: "900" },
  vehicleSection: { marginTop: 18 },
  vehicleHeader: { backgroundColor: "#23313f", borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 17 },
  vehicleCopy: { flex: 1 },
  vehicleLabel: { color: "#f0c987", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  vehicleName: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 4 },
  driverName: { color: "rgba(255,255,255,0.68)", fontSize: 11, marginTop: 3 },
  progressBadge: { backgroundColor: "#f0c987", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  progressBadgeText: { color: "#23313f", fontSize: 12, fontWeight: "900" },
  orderCard: { backgroundColor: "#fff", borderRadius: 20, marginTop: 10, overflow: "hidden" },
  orderSummary: { flexDirection: "row", alignItems: "center", padding: 14 },
  sequence: { width: 38, height: 38, borderRadius: 999, backgroundColor: "#23313f", alignItems: "center", justifyContent: "center" },
  sequenceText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  orderCopy: { flex: 1, marginLeft: 11 },
  orderTitle: { color: "#23313f", fontSize: 13, lineHeight: 17, fontWeight: "900" },
  orderMeta: { color: "#b07d3c", fontSize: 11, fontWeight: "800", marginTop: 3 },
  orderAddress: { color: "#81766a", fontSize: 10, lineHeight: 14, marginTop: 3 },
  chevron: { color: "#b88645", fontSize: 20, fontWeight: "900", marginLeft: 8 },
  checklistArea: { borderTopColor: "#eee5d9", borderTopWidth: 1, backgroundColor: "#fcfaf7", padding: 12 },
  selectAllButton: { backgroundColor: "#23313f", borderRadius: 14, alignItems: "center", paddingVertical: 12, marginBottom: 9 },
  selectAllText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  productGroup: { backgroundColor: "#f7f0e6", borderColor: "#d9c8af", borderWidth: 1, borderRadius: 18, marginTop: 10, overflow: "hidden" },
  productGroupHeader: { backgroundColor: "#efe3d2", borderBottomColor: "#dfd1bf", borderBottomWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 11 },
  productGroupCopy: { flex: 1 },
  productGroupLabel: { color: "#9a723e", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  productGroupName: { color: "#23313f", fontSize: 13, lineHeight: 17, fontWeight: "900", marginTop: 2 },
  productGroupCount: { backgroundColor: "#fff", borderRadius: 999, minWidth: 28, alignItems: "center", paddingHorizontal: 8, paddingVertical: 5, marginLeft: 8 },
  productGroupCountText: { color: "#6c6258", fontSize: 10, fontWeight: "900" },
  productGroupItems: { padding: 6 },
  additionalHeader: { backgroundColor: "#23313f", borderRadius: 12, marginHorizontal: 2, marginTop: 8, paddingHorizontal: 11, paddingVertical: 8 },
  additionalHeaderText: { color: "#f0c987", fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  checklistRow: { backgroundColor: "#fff", borderColor: "#e5dccf", borderWidth: 1, borderRadius: 16, flexDirection: "row", alignItems: "center", marginTop: 7, padding: 11 },
  checklistRowDone: { backgroundColor: "#edf9f1", borderColor: "#a9dfba" },
  checkbox: { width: 38, height: 38, borderRadius: 13, borderColor: "#cbbfaf", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  checkboxDone: { backgroundColor: "#258455", borderColor: "#258455" },
  checkmark: { color: "#fff", fontSize: 19, fontWeight: "900" },
  checklistCopy: { flex: 1, marginLeft: 11 },
  itemTitle: { color: "#23313f", fontSize: 13, fontWeight: "900" },
  itemTitleDone: { color: "#27704c" },
  itemMeta: { color: "#81766a", fontSize: 10, marginTop: 3 },
  itemType: { color: "#b07d3c", fontSize: 8, fontWeight: "900", letterSpacing: 0.7, marginTop: 4 },
  noItems: { color: "#81766a", fontSize: 11, lineHeight: 17, textAlign: "center", padding: 18 },
});

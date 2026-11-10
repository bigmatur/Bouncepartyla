import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { loadMobileReturns, processMobileReturn, type MobileReturnReservation } from "../../lib/mobileApi";

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function pretty(value: string | null | undefined) {
  return String(value || "unknown").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AdminReturnsScreen({
  grantedPermissions,
  onBack,
}: {
  grantedPermissions: string[];
  onBack: () => void;
}) {
  const canEdit = grantedPermissions.length === 0 || grantedPermissions.includes("inventory.edit");
  const canDamage = grantedPermissions.length === 0 || grantedPermissions.includes("inventory.mark_damaged");
  const [reservations, setReservations] = useState<MobileReturnReservation[]>([]);
  const [defaultLocationId, setDefaultLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [damageNotes, setDamageNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await loadMobileReturns();
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError("");
    setReservations(result.data.reservations || []);
    setDefaultLocationId(result.data.defaultLocationId);
  }, []);

  useEffect(() => { void load().finally(() => setLoading(false)); }, [load]);

  async function process(reservation: MobileReturnReservation, status: "available" | "cleaning" | "maintenance" | "damaged") {
    const item = one(reservation.inventory_items);
    const unit = one(reservation.inventory_units);
    const booking = one(reservation.bookings);
    if (!item?.id || savingId) return;
    const notes = String(damageNotes[reservation.id] || "").trim();

    if (status === "damaged" && !notes) {
      Alert.alert("Damage details required", "Describe the damage before creating the report.");
      return;
    }

    const submit = async () => {
      setSavingId(reservation.id);
      const result = await processMobileReturn({
        reservationId: reservation.id,
        itemId: item.id,
        unitId: unit?.id,
        bookingId: booking?.id,
        currentStatus: reservation.status,
        resultStatus: status,
        locationId: defaultLocationId,
        notes,
      });
      if (!result.success) Alert.alert("Could not process return", result.error);
      else await load();
      setSavingId(null);
    };

    if (status === "damaged") {
      Alert.alert(
        "Report damage",
        "This records the return as damaged and sends the unit for attention.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Report damage", style: "destructive", onPress: () => void submit() },
        ],
      );
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
      <Text style={styles.eyebrow}>WAREHOUSE WORKFLOW</Text>
      <Text style={styles.title}>Returns</Text>
      <Text style={styles.subtitle}>Receive equipment from a completed rental and send it to the next safe status.</Text>

      <View style={styles.summary}><Text style={styles.summaryValue}>{reservations.length}</Text><Text style={styles.summaryLabel}>RETURNS TO PROCESS</Text></View>
      {loading ? <View style={styles.state}><ActivityIndicator color="#23313f" /></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {!loading && !error && reservations.length === 0 ? <View style={styles.state}><Text style={styles.emptyTitle}>Nothing is waiting to be returned</Text><Text style={styles.emptyText}>Open rental equipment will appear here after pickup.</Text></View> : null}

      {reservations.map((reservation) => {
        const item = one(reservation.inventory_items);
        const unit = one(reservation.inventory_units);
        const booking = one(reservation.bookings);
        const customer = one(booking?.customers);
        const saving = savingId === reservation.id;
        return (
          <View key={reservation.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardCopy}><Text style={styles.itemName}>{item?.name || "Inventory item"}</Text><Text style={styles.meta}>{unit?.unit_code || item?.sku || "Unserialized item"} · Qty {reservation.quantity || 1}</Text></View>
              <View style={styles.status}><Text style={styles.statusText}>{pretty(reservation.status)}</Text></View>
            </View>
            <Text style={styles.booking}>Booking #{booking?.booking_number || "—"}{booking?.event_date ? ` · ${booking.event_date}` : ""}</Text>
            {customer?.full_name ? <Text style={styles.customer}>{customer.full_name}</Text> : null}
            {canDamage ? <TextInput
              value={damageNotes[reservation.id] || ""}
              onChangeText={(value) => setDamageNotes((current) => ({ ...current, [reservation.id]: value }))}
              placeholder="Damage details (required only for Damage)"
              placeholderTextColor="#9c9184"
              multiline
              maxLength={500}
              style={styles.notesInput}
            /> : null}
            {canEdit ? <View style={styles.actions}>
              <Action label="Available" disabled={saving} onPress={() => void process(reservation, "available")} />
              <Action label="Cleaning" primary disabled={saving} onPress={() => void process(reservation, "cleaning")} />
            </View> : null}
            {canEdit || canDamage ? <View style={styles.actions}>
              {canEdit ? <Action label="Maintenance" disabled={saving} onPress={() => void process(reservation, "maintenance")} /> : <View style={styles.actionSpacer} />}
              {canDamage ? <Action label="Damage" danger disabled={saving} onPress={() => void process(reservation, "damaged")} /> : <View style={styles.actionSpacer} />}
            </View> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Action({ label, onPress, disabled, primary = false, danger = false }: { label: string; onPress: () => void; disabled: boolean; primary?: boolean; danger?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.action, primary ? styles.actionPrimary : null, danger ? styles.actionDanger : null, disabled ? styles.disabled : null]}><Text style={[styles.actionText, primary || danger ? styles.actionTextOnColor : null]}>{label.toUpperCase()}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" }, content: { paddingTop: 54, paddingHorizontal: 18, paddingBottom: 120 },
  back: { alignSelf: "flex-start", paddingVertical: 7 }, backText: { color: "#b88645", fontSize: 10, fontWeight: "900" },
  eyebrow: { color: "#b88645", fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 }, title: { color: "#23313f", fontSize: 30, fontWeight: "900", marginTop: 5 }, subtitle: { color: "#81766a", fontSize: 12, lineHeight: 18, marginTop: 4 },
  summary: { alignItems: "center", backgroundColor: "#23313f", borderRadius: 20, flexDirection: "row", gap: 12, marginTop: 18, padding: 16 }, summaryValue: { color: "#f0c987", fontSize: 26, fontWeight: "900" }, summaryLabel: { color: "#ffffff", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  state: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, marginTop: 16, padding: 26 }, emptyTitle: { color: "#23313f", fontSize: 16, fontWeight: "900", textAlign: "center" }, emptyText: { color: "#81766a", fontSize: 11, marginTop: 4, textAlign: "center" }, error: { backgroundColor: "#fff1f0", borderRadius: 16, marginTop: 16, padding: 13 }, errorText: { color: "#8c2e2a", fontSize: 11 },
  card: { backgroundColor: "#ffffff", borderRadius: 19, marginTop: 10, padding: 14 }, cardTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, cardCopy: { flex: 1, paddingRight: 8 }, itemName: { color: "#23313f", fontSize: 15, fontWeight: "900" }, meta: { color: "#81766a", fontSize: 10, marginTop: 4 }, status: { backgroundColor: "#fff4d8", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 6 }, statusText: { color: "#856727", fontSize: 8, fontWeight: "900", textTransform: "uppercase" }, booking: { color: "#a2763a", fontSize: 10, marginTop: 10 }, customer: { color: "#6c6258", fontSize: 11, fontWeight: "700", marginTop: 4 },
  notesInput: { backgroundColor: "#fcfaf7", borderColor: "#e4ddd2", borderRadius: 13, borderWidth: 1, color: "#23313f", fontSize: 11, lineHeight: 16, marginTop: 12, minHeight: 54, paddingHorizontal: 11, paddingVertical: 9, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 }, action: { alignItems: "center", borderColor: "#d9cdbd", borderRadius: 12, borderWidth: 1, flex: 1, paddingVertical: 10 }, actionSpacer: { flex: 1 }, actionPrimary: { backgroundColor: "#23313f", borderColor: "#23313f" }, actionDanger: { backgroundColor: "#b4423a", borderColor: "#b4423a" }, actionText: { color: "#665d53", fontSize: 9, fontWeight: "900" }, actionTextOnColor: { color: "#ffffff" }, disabled: { opacity: 0.45 },
});

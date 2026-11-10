import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  loadMobileWarehouseOperations,
  updateMobileWarehouseOperation,
  type MobileInventoryAdjustment,
  type MobileReceiveOption,
  type MobileWarehouseUnit,
} from "../../lib/mobileApi";

type Mode = "transfer" | "write_off";
type WriteOffStatus = "retired" | "lost" | "damaged" | "maintenance";

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function pretty(value: string | null | undefined) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function AdminWarehouseOperationsScreen({
  grantedPermissions,
  onBack,
}: {
  grantedPermissions: string[];
  onBack: () => void;
}) {
  const unrestricted = grantedPermissions.length === 0;
  const canEdit = unrestricted || grantedPermissions.includes("inventory.edit");
  const canDamage = unrestricted || grantedPermissions.includes("inventory.mark_damaged");
  const [mode, setMode] = useState<Mode>(canEdit ? "transfer" : "write_off");
  const [units, setUnits] = useState<MobileWarehouseUnit[]>([]);
  const [locations, setLocations] = useState<MobileReceiveOption[]>([]);
  const [adjustments, setAdjustments] = useState<MobileInventoryAdjustment[]>([]);
  const [query, setQuery] = useState("");
  const [unitId, setUnitId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [toStatus, setToStatus] = useState<WriteOffStatus>(canDamage ? "damaged" : "retired");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await loadMobileWarehouseOperations();
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError("");
    setUnits(result.data.units || []);
    setLocations(result.data.locations || []);
    setAdjustments(result.data.adjustments || []);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const selected = units.find((unit) => unit.id === unitId) || null;
  const visibleUnits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return units.slice(0, 30);
    return units
      .filter((unit) => {
        const item = one(unit.inventory_items);
        const location = one(unit.warehouse_locations);
        return `${item?.name || ""} ${item?.sku || ""} ${unit.unit_code || ""} ${location?.name || ""}`
          .toLowerCase()
          .includes(needle);
      })
      .slice(0, 50);
  }, [query, units]);

  function resetForm() {
    setUnitId("");
    setLocationId("");
    setReason("");
    setNotes("");
    setQuery("");
  }

  function confirm() {
    if (!selected) {
      Alert.alert("Choose equipment", "Select the exact inventory unit first.");
      return;
    }
    if (mode === "transfer" && !locationId) {
      Alert.alert("Choose destination", "Select the warehouse location where this unit is moving.");
      return;
    }
    if (mode === "write_off" && !reason.trim()) {
      Alert.alert("Reason required", "Enter why this unit is being written off or sent to repair.");
      return;
    }
    const destination = locations.find((location) => location.id === locationId)?.name || "selected location";
    const message = mode === "transfer"
      ? `Move ${labelForUnit(selected)} to ${destination}?`
      : `Mark ${labelForUnit(selected)} as ${pretty(toStatus)}? This changes its warehouse availability.`;
    Alert.alert(mode === "transfer" ? "Confirm transfer" : "Confirm inventory action", message, [
      { text: "Back", style: "cancel" },
      { text: "Confirm", style: mode === "write_off" ? "destructive" : "default", onPress: () => void save() },
    ]);
  }

  async function save() {
    if (!selected || saving) return;
    setSaving(true);
    const result = await updateMobileWarehouseOperation({
      action: mode,
      unitId: selected.id,
      locationId: mode === "transfer" ? locationId : undefined,
      toStatus: mode === "write_off" ? toStatus : undefined,
      reason: reason.trim(),
      notes: notes.trim(),
    });
    if (!result.success) {
      Alert.alert("Could not update equipment", result.error);
    } else {
      Alert.alert(mode === "transfer" ? "Transfer recorded" : "Inventory updated", `${labelForUnit(selected)} was updated successfully.`);
      resetForm();
      await load();
    }
    setSaving(false);
  }

  const writeOffOptions: Array<{ value: WriteOffStatus; label: string; allowed: boolean }> = [
    { value: "damaged", label: "Damaged", allowed: canDamage },
    { value: "maintenance", label: "Send to repair", allowed: canDamage },
    { value: "lost", label: "Lost", allowed: canEdit },
    { value: "retired", label: "Retire / dispose", allowed: canEdit },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
    >
      <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ BACK</Text></Pressable>
      <Text style={styles.eyebrow}>WAREHOUSE CONTROL</Text>
      <Text style={styles.title}>Transfers & write-offs</Text>
      <Text style={styles.subtitle}>Move a tracked unit, report damage, or remove it from available stock.</Text>

      <View style={styles.modeRow}>
        {canEdit ? <ModeButton label="TRANSFER" selected={mode === "transfer"} onPress={() => setMode("transfer")} /> : null}
        {canEdit || canDamage ? <ModeButton label="WRITE-OFF / REPAIR" selected={mode === "write_off"} onPress={() => setMode("write_off")} /> : null}
      </View>

      {loading ? <View style={styles.state}><ActivityIndicator color="#23313f" /></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

      {!loading && !error ? <>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>1. Select equipment</Text>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search name, SKU, unit or location" placeholderTextColor="#9c9184" style={styles.input} />
          <View style={styles.unitList}>
            {visibleUnits.map((unit) => {
              const item = one(unit.inventory_items);
              const location = one(unit.warehouse_locations);
              const active = unit.id === unitId;
              return <Pressable key={unit.id} onPress={() => { setUnitId(unit.id); setLocationId(""); }} style={[styles.unit, active ? styles.unitOn : null]}>
                <View style={styles.unitCopy}>
                  <Text style={[styles.unitName, active ? styles.unitNameOn : null]}>{item?.name || "Inventory unit"}</Text>
                  <Text style={[styles.unitMeta, active ? styles.unitMetaOn : null]}>{unit.unit_code || item?.sku || "No code"} · {location?.name || "No location"}</Text>
                </View>
                <Text style={[styles.unitStatus, active ? styles.unitStatusOn : null]}>{pretty(unit.status)}</Text>
              </Pressable>;
            })}
            {visibleUnits.length === 0 ? <Text style={styles.empty}>No matching tracked equipment.</Text> : null}
          </View>
        </View>

        {selected ? <View style={styles.panel}>
          <Text style={styles.panelTitle}>2. {mode === "transfer" ? "Choose destination" : "Choose action"}</Text>
          <View style={styles.selectedCard}>
            <Text style={styles.selectedLabel}>SELECTED UNIT</Text>
            <Text style={styles.selectedTitle}>{labelForUnit(selected)}</Text>
            <Text style={styles.selectedMeta}>{one(selected.warehouse_locations)?.name || "No current location"} · {pretty(selected.status)}</Text>
          </View>

          {mode === "transfer" ? <View style={styles.wrap}>
            {locations.filter((location) => location.id !== selected.warehouse_location_id).map((location) => <Chip key={location.id} label={location.name || "Location"} selected={locationId === location.id} onPress={() => setLocationId(location.id)} />)}
          </View> : <View style={styles.wrap}>
            {writeOffOptions.filter((option) => option.allowed).map((option) => <Chip key={option.value} label={option.label} selected={toStatus === option.value} onPress={() => setToStatus(option.value)} />)}
          </View>}

          <TextInput value={reason} onChangeText={setReason} placeholder={mode === "transfer" ? "Transfer reason (optional)" : "Reason (required)"} placeholderTextColor="#9c9184" style={styles.input} />
          <TextInput value={notes} onChangeText={setNotes} placeholder="Additional note (optional)" placeholderTextColor="#9c9184" multiline style={[styles.input, styles.notes]} />
          <Pressable disabled={saving} onPress={confirm} style={[styles.primary, mode === "write_off" ? styles.danger : null]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{mode === "transfer" ? "CONFIRM TRANSFER" : "CONFIRM INVENTORY ACTION"}</Text>}
          </Pressable>
        </View> : null}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Recent write-offs & damage</Text>
          {adjustments.slice(0, 12).map((adjustment) => <AdjustmentRow key={adjustment.id} adjustment={adjustment} />)}
          {adjustments.length === 0 ? <Text style={styles.empty}>No recent inventory adjustments.</Text> : null}
        </View>
      </> : null}
    </ScrollView>
  );
}

function labelForUnit(unit: MobileWarehouseUnit) {
  const item = one(unit.inventory_items);
  return `${item?.name || "Inventory unit"} · ${unit.unit_code || item?.sku || "No code"}`;
}

function AdjustmentRow({ adjustment }: { adjustment: MobileInventoryAdjustment }) {
  const item = one(adjustment.inventory_items);
  const unit = one(adjustment.inventory_units);
  return <View style={styles.adjustment}>
    <View style={styles.adjustmentCopy}>
      <Text style={styles.adjustmentName}>{item?.name || "Inventory item"}</Text>
      <Text style={styles.adjustmentMeta}>{unit?.unit_code || item?.sku || "No code"} · {pretty(adjustment.adjustment_type)}</Text>
      <Text style={styles.adjustmentReason}>{adjustment.reason || "No reason recorded"}</Text>
    </View>
    <Text style={styles.adjustmentDate}>{dateTime(adjustment.created_at)}</Text>
  </View>;
}

function ModeButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.mode, selected ? styles.modeOn : null]}><Text style={[styles.modeText, selected ? styles.modeTextOn : null]}>{label}</Text></Pressable>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected ? styles.chipOn : null]}><Text style={[styles.chipText, selected ? styles.chipTextOn : null]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" }, content: { paddingTop: 54, paddingHorizontal: 18, paddingBottom: 120 },
  back: { alignSelf: "flex-start", paddingVertical: 7 }, backText: { color: "#b88645", fontSize: 10, fontWeight: "900" },
  eyebrow: { color: "#b88645", fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 }, title: { color: "#23313f", fontSize: 30, fontWeight: "900", marginTop: 5 }, subtitle: { color: "#81766a", fontSize: 12, lineHeight: 18, marginTop: 4 },
  modeRow: { flexDirection: "row", gap: 8, marginTop: 16 }, mode: { alignItems: "center", backgroundColor: "#fff", borderColor: "#ded4c6", borderRadius: 14, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 8 }, modeOn: { backgroundColor: "#23313f", borderColor: "#23313f" }, modeText: { color: "#6f655a", fontSize: 8, fontWeight: "900", textAlign: "center" }, modeTextOn: { color: "#fff" },
  state: { alignItems: "center", backgroundColor: "#fff", borderRadius: 20, marginTop: 16, padding: 26 }, error: { backgroundColor: "#fff1f0", borderRadius: 16, marginTop: 16, padding: 13 }, errorText: { color: "#8c2e2a", fontSize: 11 },
  panel: { backgroundColor: "#fff", borderRadius: 20, marginTop: 16, padding: 15 }, panelTitle: { color: "#23313f", fontSize: 16, fontWeight: "900" }, input: { backgroundColor: "#fcfaf7", borderColor: "#ded4c6", borderRadius: 12, borderWidth: 1, color: "#23313f", fontSize: 11, marginTop: 11, minHeight: 44, paddingHorizontal: 11 }, notes: { minHeight: 72, paddingTop: 12, textAlignVertical: "top" },
  unitList: { gap: 7, marginTop: 10 }, unit: { alignItems: "center", backgroundColor: "#f7f3ed", borderColor: "#ebe2d6", borderRadius: 14, borderWidth: 1, flexDirection: "row", minHeight: 57, padding: 11 }, unitOn: { backgroundColor: "#23313f", borderColor: "#23313f" }, unitCopy: { flex: 1 }, unitName: { color: "#23313f", fontSize: 11, fontWeight: "900" }, unitNameOn: { color: "#fff" }, unitMeta: { color: "#81766a", fontSize: 8, marginTop: 3 }, unitMetaOn: { color: "#ddd7ce" }, unitStatus: { color: "#9a743c", fontSize: 7, fontWeight: "900", marginLeft: 8 }, unitStatusOn: { color: "#e9bb76" }, empty: { color: "#81766a", fontSize: 10, paddingVertical: 13, textAlign: "center" },
  selectedCard: { backgroundColor: "#f7f3ed", borderRadius: 14, marginTop: 11, padding: 12 }, selectedLabel: { color: "#b88645", fontSize: 7, fontWeight: "900", letterSpacing: 1 }, selectedTitle: { color: "#23313f", fontSize: 13, fontWeight: "900", marginTop: 4 }, selectedMeta: { color: "#81766a", fontSize: 9, marginTop: 3 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 11 }, chip: { backgroundColor: "#f5efe6", borderColor: "#e2d7c8", borderRadius: 99, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 }, chipOn: { backgroundColor: "#23313f", borderColor: "#23313f" }, chipText: { color: "#6f655a", fontSize: 8, fontWeight: "900" }, chipTextOn: { color: "#fff" },
  primary: { alignItems: "center", backgroundColor: "#23313f", borderRadius: 14, justifyContent: "center", marginTop: 13, minHeight: 48 }, danger: { backgroundColor: "#9b3b34" }, primaryText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  adjustment: { borderBottomColor: "#eee5d9", borderBottomWidth: 1, flexDirection: "row", paddingVertical: 11 }, adjustmentCopy: { flex: 1, paddingRight: 8 }, adjustmentName: { color: "#23313f", fontSize: 11, fontWeight: "900" }, adjustmentMeta: { color: "#9a743c", fontSize: 8, fontWeight: "800", marginTop: 3 }, adjustmentReason: { color: "#81766a", fontSize: 9, marginTop: 4 }, adjustmentDate: { color: "#9c9184", fontSize: 7, maxWidth: 78, textAlign: "right" },
});

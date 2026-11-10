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
  loadMobileReceiveStock,
  receiveMobileInventoryStock,
  type MobileReceiveItem,
  type MobileReceiveOption,
} from "../../lib/mobileApi";

const CONDITIONS = ["good", "fair", "needs_attention"];

function pretty(value: string | null | undefined) {
  return String(value || "serialized").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AdminReceiveScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<MobileReceiveItem[]>([]);
  const [categories, setCategories] = useState<MobileReceiveOption[]>([]);
  const [locations, setLocations] = useState<MobileReceiveOption[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [locationId, setLocationId] = useState("");
  const [query, setQuery] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [serialPrefix, setSerialPrefix] = useState("");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await loadMobileReceiveStock();
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError("");
    setItems(result.data.items || []);
    setCategories(result.data.categories || []);
    setLocations(result.data.locations || []);
    setLocationId((current) => current || result.data.defaultLocationId || result.data.locations?.[0]?.id || "");
  }, []);

  useEffect(() => { void load().finally(() => setLoading(false)); }, [load]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || null,
    [items, selectedItemId],
  );
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const categoryMatch = selectedCategoryId === "all" || item.category_id === selectedCategoryId;
      const searchMatch = !needle || `${item.name || ""} ${item.sku || ""}`.toLowerCase().includes(needle);
      return categoryMatch && searchMatch;
    }).slice(0, 40);
  }, [items, query, selectedCategoryId]);
  const isBulk = selectedItem?.tracking_type === "quantity" || selectedItem?.tracking_type === "consumable";

  function selectItem(item: MobileReceiveItem) {
    setSelectedItemId(item.id);
    setPurchasePrice(String(Number(item.default_purchase_price || 0)));
    setSerialPrefix("");
    setNotes("");
  }

  async function submit() {
    if (!selectedItem || saving) return;
    const parsedQuantity = Number(quantity.replace(",", "."));
    const parsedPrice = Number(purchasePrice.replace(",", "."));
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1 || (!isBulk && !Number.isInteger(parsedQuantity))) {
      Alert.alert("Check quantity", isBulk ? "Enter a quantity of at least 1." : "Serialized items require a whole quantity of at least 1.");
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      Alert.alert("Check cost", "Enter a valid unit purchase cost.");
      return;
    }
    const locationName = locations.find((location) => location.id === locationId)?.name || "No location";
    Alert.alert(
      "Receive stock",
      `${selectedItem.name || "Inventory item"}\nQuantity: ${parsedQuantity}\nLocation: ${locationName}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Receive", onPress: () => void save(parsedQuantity, parsedPrice) },
      ],
    );
  }

  async function save(parsedQuantity: number, parsedPrice: number) {
    if (!selectedItem) return;
    setSaving(true);
    const result = await receiveMobileInventoryStock({
      itemId: selectedItem.id,
      locationId: locationId || null,
      quantity: parsedQuantity,
      purchasePrice: parsedPrice,
      serialPrefix: serialPrefix.trim(),
      condition,
      notes: notes.trim(),
    });
    if (!result.success) {
      Alert.alert("Could not receive stock", result.error);
      setSaving(false);
      return;
    }
    const codes = result.data.unitCodes || [];
    Alert.alert(
      "Stock received",
      codes.length ? `${result.data.received} unit(s) added.\n${codes.join(", ")}` : `${result.data.received} added to available stock.`,
    );
    setQuantity("1");
    setSerialPrefix("");
    setNotes("");
    await load();
    setSaving(false);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}
    >
      <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ BACK</Text></Pressable>
      <Text style={styles.eyebrow}>WAREHOUSE WORKFLOW</Text>
      <Text style={styles.title}>Receive stock</Text>
      <Text style={styles.subtitle}>Add delivered equipment to existing inventory records.</Text>

      {loading ? <View style={styles.state}><ActivityIndicator color="#23313f" /></View> : null}
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

      {!loading && !error ? <>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>1. Choose item</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search item or SKU"
            placeholderTextColor="#9c9184"
            style={styles.input}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="All" selected={selectedCategoryId === "all"} onPress={() => setSelectedCategoryId("all")} />
            {categories.map((category) => <Chip key={category.id} label={category.name || "Category"} selected={selectedCategoryId === category.id} onPress={() => setSelectedCategoryId(category.id)} />)}
          </ScrollView>
          <View style={styles.itemList}>
            {filteredItems.map((item) => (
              <Pressable key={item.id} onPress={() => selectItem(item)} style={[styles.item, selectedItemId === item.id ? styles.itemSelected : null]}>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemName}>{item.name || "Inventory item"}</Text>
                  <Text style={styles.itemMeta}>{item.sku || "No SKU"} · {pretty(item.tracking_type)} · {Number(item.quantity_available || 0)} available</Text>
                </View>
                <Text style={styles.itemCheck}>{selectedItemId === item.id ? "✓" : "›"}</Text>
              </Pressable>
            ))}
            {filteredItems.length === 0 ? <Text style={styles.emptyText}>No matching inventory item.</Text> : null}
          </View>
        </View>

        {selectedItem ? <View style={styles.panel}>
          <Text style={styles.panelTitle}>2. Receiving details</Text>
          <Text style={styles.selectedName}>{selectedItem.name}</Text>
          <Text style={styles.fieldLabel}>LOCATION</Text>
          <View style={styles.wrapChips}>
            {locations.map((location) => <Chip key={location.id} label={location.name || "Location"} selected={locationId === location.id} onPress={() => setLocationId(location.id)} />)}
          </View>
          <View style={styles.row}>
            <Field label="QUANTITY" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            <Field label="UNIT COST" value={purchasePrice} onChangeText={setPurchasePrice} keyboardType="decimal-pad" />
          </View>
          {!isBulk ? <>
            <Text style={styles.fieldLabel}>CONDITION</Text>
            <View style={styles.wrapChips}>{CONDITIONS.map((value) => <Chip key={value} label={pretty(value)} selected={condition === value} onPress={() => setCondition(value)} />)}</View>
            <Text style={styles.fieldLabel}>UNIT CODE PREFIX (OPTIONAL)</Text>
            <TextInput value={serialPrefix} onChangeText={setSerialPrefix} autoCapitalize="characters" placeholder="Auto from SKU if empty" placeholderTextColor="#9c9184" style={styles.input} />
          </> : null}
          <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
          <TextInput value={notes} onChangeText={setNotes} multiline maxLength={500} placeholder="Shipment or receiving note" placeholderTextColor="#9c9184" style={[styles.input, styles.notes]} />
          <Pressable disabled={saving} onPress={() => void submit()} style={[styles.submit, saving ? styles.disabled : null]}>
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>RECEIVE STOCK</Text>}
          </Pressable>
        </View> : null}
      </> : null}
    </ScrollView>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected ? styles.chipSelected : null]}><Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text></Pressable>;
}

function Field({ label, value, onChangeText, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType: "decimal-pad" }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" }, content: { paddingTop: 54, paddingHorizontal: 18, paddingBottom: 120 },
  back: { alignSelf: "flex-start", paddingVertical: 7 }, backText: { color: "#b88645", fontSize: 10, fontWeight: "900" },
  eyebrow: { color: "#b88645", fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 }, title: { color: "#23313f", fontSize: 30, fontWeight: "900", marginTop: 5 }, subtitle: { color: "#81766a", fontSize: 12, lineHeight: 18, marginTop: 4 },
  state: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, marginTop: 16, padding: 26 }, error: { backgroundColor: "#fff1f0", borderRadius: 16, marginTop: 16, padding: 13 }, errorText: { color: "#8c2e2a", fontSize: 11 },
  panel: { backgroundColor: "#ffffff", borderRadius: 20, marginTop: 16, padding: 15 }, panelTitle: { color: "#23313f", fontSize: 16, fontWeight: "900", marginBottom: 11 }, selectedName: { color: "#a2763a", fontSize: 12, fontWeight: "900", marginBottom: 4 },
  input: { backgroundColor: "#fcfaf7", borderColor: "#ded4c6", borderRadius: 13, borderWidth: 1, color: "#23313f", fontSize: 12, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 }, notes: { minHeight: 72, textAlignVertical: "top" },
  chips: { gap: 7, paddingVertical: 10 }, wrapChips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 3 }, chip: { backgroundColor: "#f5efe6", borderColor: "#e2d7c8", borderRadius: 99, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 }, chipSelected: { backgroundColor: "#23313f", borderColor: "#23313f" }, chipText: { color: "#6f655a", fontSize: 9, fontWeight: "800" }, chipTextSelected: { color: "#ffffff" },
  itemList: { gap: 7 }, item: { alignItems: "center", borderColor: "#ebe3d9", borderRadius: 14, borderWidth: 1, flexDirection: "row", padding: 11 }, itemSelected: { backgroundColor: "#eef5f0", borderColor: "#75a184" }, itemCopy: { flex: 1 }, itemName: { color: "#23313f", fontSize: 12, fontWeight: "900" }, itemMeta: { color: "#81766a", fontSize: 9, marginTop: 3 }, itemCheck: { color: "#a2763a", fontSize: 18, fontWeight: "900" }, emptyText: { color: "#81766a", fontSize: 11, padding: 14, textAlign: "center" },
  fieldLabel: { color: "#9a743c", fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 5, marginTop: 13 }, row: { flexDirection: "row", gap: 9 }, field: { flex: 1 }, submit: { alignItems: "center", backgroundColor: "#23313f", borderRadius: 15, marginTop: 18, minHeight: 50, justifyContent: "center" }, submitText: { color: "#ffffff", fontSize: 11, fontWeight: "900", letterSpacing: 1 }, disabled: { opacity: 0.5 },
});

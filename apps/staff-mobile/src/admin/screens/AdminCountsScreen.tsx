import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { loadMobileInventoryCounts, updateMobileInventoryCount, type MobileInventoryCount, type MobileInventoryCountLine, type MobileReceiveOption } from "../../lib/mobileApi";

function one<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] || null : value || null; }
function pretty(value: string | null | undefined) { return String(value || "none").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function problem(line: MobileInventoryCountLine) {
  return Number(line.difference_quantity || 0) !== 0 || Boolean(line.expected_status && line.counted_status && line.expected_status !== line.counted_status);
}

export function AdminCountsScreen({ grantedPermissions, onBack }: { grantedPermissions: string[]; onBack: () => void }) {
  const canEdit = grantedPermissions.length === 0 || grantedPermissions.includes("inventory.edit");
  const [counts, setCounts] = useState<MobileInventoryCount[]>([]);
  const [locations, setLocations] = useState<MobileReceiveOption[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [locationId, setLocationId] = useState("");
  const [startNotes, setStartNotes] = useState("");
  const [query, setQuery] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { quantity: string; status: string; notes: string }>>({});
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null); const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await loadMobileInventoryCounts();
    if (!result.success) { setError(result.error); return; }
    setError(""); setCounts(result.data.counts || []); setLocations(result.data.locations || []); setStatuses(result.data.statuses || []);
  }, []);
  useEffect(() => { void load().finally(() => setLoading(false)); }, [load]);

  const active = counts.find((count) => ["draft", "in_progress"].includes(String(count.status || ""))) || null;
  const lines = active?.inventory_count_lines || [];
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return lines.filter((line) => {
      const item = one(line.inventory_items); const unit = one(line.inventory_units);
      return (!needle || `${item?.name || ""} ${item?.sku || ""} ${unit?.unit_code || ""}`.toLowerCase().includes(needle)) && (!problemsOnly || problem(line));
    });
  }, [lines, problemsOnly, query]);

  function draft(line: MobileInventoryCountLine) {
    return drafts[line.id] || { quantity: String(Number(line.counted_quantity || 0)), status: line.counted_status || "", notes: line.notes || "" };
  }
  function change(line: MobileInventoryCountLine, patch: Partial<{ quantity: string; status: string; notes: string }>) {
    setDrafts((current) => ({ ...current, [line.id]: { ...draft(line), ...patch } }));
  }

  async function start() {
    setSavingId("start"); const result = await updateMobileInventoryCount({ action: "start", locationId: locationId || null, notes: startNotes.trim() });
    if (!result.success) Alert.alert("Could not start count", result.error); else { setStartNotes(""); await load(); }
    setSavingId(null);
  }
  async function saveLine(line: MobileInventoryCountLine) {
    if (!active) return; const value = draft(line); const quantity = Number(value.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) { Alert.alert("Check quantity", "Counted quantity must be zero or more."); return; }
    setSavingId(line.id); const result = await updateMobileInventoryCount({ action: "update_line", countId: active.id, lineId: line.id, expectedQuantity: Number(line.expected_quantity || 0), countedQuantity: quantity, countedStatus: value.status || null, notes: value.notes.trim() });
    if (!result.success) Alert.alert("Could not save line", result.error); else { setDrafts((current) => { const next = { ...current }; delete next[line.id]; return next; }); await load(); }
    setSavingId(null);
  }
  function finish(action: "complete" | "cancel") {
    if (!active || savingId) return;
    Alert.alert(action === "complete" ? "Complete inventory count" : "Cancel inventory count", action === "complete" ? "This applies counted quantities and statuses to inventory. Review all differences first." : "This closes the count without applying it.", [
      { text: "Back", style: "cancel" },
      { text: action === "complete" ? "Complete" : "Cancel count", style: action === "cancel" ? "destructive" : "default", onPress: () => void runFinish(action) },
    ]);
  }
  async function runFinish(action: "complete" | "cancel") {
    if (!active) return; setSavingId(action); const result = await updateMobileInventoryCount({ action, countId: active.id });
    if (!result.success) Alert.alert("Could not update count", result.error); else { setDrafts({}); await load(); }
    setSavingId(null);
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}>
    <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ BACK</Text></Pressable>
    <Text style={styles.eyebrow}>WAREHOUSE AUDIT</Text><Text style={styles.title}>Inventory count</Text>
    <Text style={styles.subtitle}>Compare expected stock with what is physically present.</Text>
    {loading ? <View style={styles.state}><ActivityIndicator color="#23313f" /></View> : null}
    {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

    {!loading && !error && !active ? <View style={styles.panel}>
      <Text style={styles.panelTitle}>Start a new count</Text><Text style={styles.hint}>Choose a location, or count the whole warehouse.</Text>
      <View style={styles.wrap}>{<Chip label="All warehouse" selected={!locationId} onPress={() => setLocationId("")} />}{locations.map((location) => <Chip key={location.id} label={location.name || "Location"} selected={locationId === location.id} onPress={() => setLocationId(location.id)} />)}</View>
      <TextInput value={startNotes} onChangeText={setStartNotes} placeholder="Count note (optional)" placeholderTextColor="#9c9184" style={styles.input} />
      {canEdit ? <Pressable disabled={savingId === "start"} onPress={() => void start()} style={styles.primary}>{savingId === "start" ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>START COUNT</Text>}</Pressable> : null}
      {!canEdit ? <Text style={styles.readOnly}>Your role has read-only inventory access.</Text> : null}
    </View> : null}

    {active ? <>
      <View style={styles.activeCard}><Text style={styles.activeLabel}>ACTIVE COUNT</Text><Text style={styles.activeTitle}>{active.count_number}</Text><Text style={styles.activeMeta}>{one(active.warehouse_locations)?.name || "All warehouse"} · {lines.length} lines</Text>
        {canEdit ? <View style={styles.actions}><Pressable onPress={() => finish("complete")} style={[styles.action, styles.complete]}><Text style={styles.actionOn}>COMPLETE</Text></Pressable><Pressable onPress={() => finish("cancel")} style={[styles.action, styles.cancel]}><Text style={styles.actionOn}>CANCEL</Text></Pressable></View> : null}
      </View>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search item, SKU or unit" placeholderTextColor="#9c9184" style={styles.search} />
      <Pressable onPress={() => setProblemsOnly((value) => !value)} style={[styles.problemToggle, problemsOnly ? styles.problemToggleOn : null]}><Text style={[styles.problemToggleText, problemsOnly ? styles.problemToggleTextOn : null]}>{problemsOnly ? "SHOWING DIFFERENCES" : `SHOW DIFFERENCES (${lines.filter(problem).length})`}</Text></Pressable>
      {visible.map((line) => {
        const item = one(line.inventory_items); const unit = one(line.inventory_units); const value = draft(line); const hasProblem = problem(line);
        return <View key={line.id} style={[styles.line, hasProblem ? styles.lineProblem : null]}>
          <View style={styles.lineTop}><View style={styles.lineCopy}><Text style={styles.itemName}>{item?.name || "Inventory item"}</Text><Text style={styles.meta}>{unit?.unit_code || item?.sku || item?.tracking_type || "Quantity item"}</Text></View>{hasProblem ? <Text style={styles.problemBadge}>DIFFERENCE</Text> : null}</View>
          <View style={styles.quantities}><View style={styles.expected}><Text style={styles.smallLabel}>EXPECTED</Text><Text style={styles.expectedValue}>{Number(line.expected_quantity || 0)}</Text></View><View style={styles.counted}><Text style={styles.smallLabel}>COUNTED</Text><TextInput value={value.quantity} onChangeText={(text) => change(line, { quantity: text })} editable={canEdit} keyboardType="decimal-pad" style={styles.quantityInput} /></View></View>
          {line.expected_status ? <><Text style={styles.statusHint}>Expected status: {pretty(line.expected_status)}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statuses}>{statuses.map((status) => <Chip key={status} label={pretty(status)} selected={value.status === status} onPress={() => canEdit && change(line, { status })} />)}</ScrollView></> : null}
          <TextInput value={value.notes} onChangeText={(text) => change(line, { notes: text })} editable={canEdit} placeholder="Missing, damaged, extra..." placeholderTextColor="#9c9184" style={styles.input} />
          {canEdit ? <Pressable disabled={savingId === line.id} onPress={() => void saveLine(line)} style={styles.save}>{savingId === line.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>SAVE LINE</Text>}</Pressable> : null}
        </View>;
      })}
    </> : null}
  </ScrollView>;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.chip, selected ? styles.chipOn : null]}><Text style={[styles.chipText, selected ? styles.chipTextOn : null]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#f5f1e8"},content:{paddingTop:54,paddingHorizontal:18,paddingBottom:120},back:{alignSelf:"flex-start",paddingVertical:7},backText:{color:"#b88645",fontSize:10,fontWeight:"900"},eyebrow:{color:"#b88645",fontSize:10,fontWeight:"900",letterSpacing:1.4,marginTop:4},title:{color:"#23313f",fontSize:30,fontWeight:"900",marginTop:5},subtitle:{color:"#81766a",fontSize:12,lineHeight:18,marginTop:4},
  state:{alignItems:"center",backgroundColor:"#fff",borderRadius:20,marginTop:16,padding:26},error:{backgroundColor:"#fff1f0",borderRadius:16,marginTop:16,padding:13},errorText:{color:"#8c2e2a",fontSize:11},panel:{backgroundColor:"#fff",borderRadius:20,marginTop:16,padding:15},panelTitle:{color:"#23313f",fontSize:17,fontWeight:"900"},hint:{color:"#81766a",fontSize:10,marginTop:4},wrap:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:13},chip:{backgroundColor:"#f5efe6",borderColor:"#e2d7c8",borderRadius:99,borderWidth:1,paddingHorizontal:10,paddingVertical:8},chipOn:{backgroundColor:"#23313f",borderColor:"#23313f"},chipText:{color:"#6f655a",fontSize:8,fontWeight:"900"},chipTextOn:{color:"#fff"},
  input:{backgroundColor:"#fcfaf7",borderColor:"#ded4c6",borderRadius:12,borderWidth:1,color:"#23313f",fontSize:11,marginTop:11,minHeight:43,paddingHorizontal:11},primary:{alignItems:"center",backgroundColor:"#23313f",borderRadius:14,justifyContent:"center",marginTop:13,minHeight:48},primaryText:{color:"#fff",fontSize:10,fontWeight:"900",letterSpacing:1},readOnly:{color:"#81766a",fontSize:10,marginTop:12},
  activeCard:{backgroundColor:"#23313f",borderRadius:20,marginTop:16,padding:16},activeLabel:{color:"#f0c987",fontSize:8,fontWeight:"900",letterSpacing:1.2},activeTitle:{color:"#fff",fontSize:18,fontWeight:"900",marginTop:5},activeMeta:{color:"rgba(255,255,255,.65)",fontSize:10,marginTop:4},actions:{flexDirection:"row",gap:8,marginTop:14},action:{alignItems:"center",borderRadius:12,flex:1,paddingVertical:10},complete:{backgroundColor:"#438463"},cancel:{backgroundColor:"#a94840"},actionOn:{color:"#fff",fontSize:9,fontWeight:"900"},search:{backgroundColor:"#fff",borderColor:"#ded4c6",borderRadius:14,borderWidth:1,color:"#23313f",fontSize:11,marginTop:12,minHeight:45,paddingHorizontal:12},problemToggle:{alignItems:"center",borderColor:"#d9cdbd",borderRadius:12,borderWidth:1,marginTop:8,padding:10},problemToggleOn:{backgroundColor:"#fff0ec",borderColor:"#dfada3"},problemToggleText:{color:"#766b60",fontSize:8,fontWeight:"900"},problemToggleTextOn:{color:"#9c3731"},
  line:{backgroundColor:"#fff",borderColor:"transparent",borderRadius:18,borderWidth:1,marginTop:9,padding:13},lineProblem:{borderColor:"#e3afa5"},lineTop:{flexDirection:"row",alignItems:"flex-start"},lineCopy:{flex:1},itemName:{color:"#23313f",fontSize:13,fontWeight:"900"},meta:{color:"#81766a",fontSize:9,marginTop:3},problemBadge:{color:"#a83d34",fontSize:7,fontWeight:"900"},quantities:{flexDirection:"row",gap:8,marginTop:11},expected:{backgroundColor:"#f7f3ed",borderRadius:12,flex:1,padding:10},counted:{backgroundColor:"#f7f3ed",borderRadius:12,flex:1,padding:10},smallLabel:{color:"#9a743c",fontSize:7,fontWeight:"900"},expectedValue:{color:"#23313f",fontSize:19,fontWeight:"900",marginTop:4},quantityInput:{borderBottomColor:"#cdbda9",borderBottomWidth:1,color:"#23313f",fontSize:18,fontWeight:"900",marginTop:1,paddingVertical:1},statusHint:{color:"#81766a",fontSize:9,marginTop:10},statuses:{gap:6,paddingVertical:8},save:{alignItems:"center",backgroundColor:"#23313f",borderRadius:12,justifyContent:"center",marginTop:10,minHeight:42},saveText:{color:"#fff",fontSize:9,fontWeight:"900"},
});

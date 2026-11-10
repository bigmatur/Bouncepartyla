import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { loadMobileInventoryMovements, type MobileInventoryMovement } from "../../lib/mobileApi";

type Filter = "all" | "receive" | "rental" | "return" | "attention" | "count";
function one<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] || null : value || null; }
function pretty(value: string | null | undefined) { return String(value || "movement").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string | null) { if (!value) return "—"; return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function group(type: string | null): Filter {
  const value = String(type || "");
  if (["receive", "purchase_receive"].includes(value)) return "receive";
  if (["reserve", "pick", "load", "install", "consume_inventory"].includes(value)) return "rental";
  if (["return", "return_to_warehouse", "send_to_cleaning"].includes(value)) return "return";
  if (["write_off", "lost", "send_to_repair", "damage"].includes(value)) return "attention";
  if (value === "inventory_count") return "count";
  return "all";
}

export function AdminMovementsScreen({ onBack }: { onBack: () => void }) {
  const [movements, setMovements] = useState<MobileInventoryMovement[]>([]); const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState(""); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async () => { const result = await loadMobileInventoryMovements(); if (!result.success) { setError(result.error); return; } setError(""); setMovements(result.data.movements || []); }, []);
  useEffect(() => { void load().finally(() => setLoading(false)); }, [load]);
  const visible = useMemo(() => { const needle = query.trim().toLowerCase(); return movements.filter((movement) => {
    const item = one(movement.inventory_items); const unit = one(movement.inventory_units); const booking = one(movement.bookings);
    const matchesText = !needle || `${item?.name || ""} ${item?.sku || ""} ${unit?.unit_code || ""} ${booking?.booking_number || ""} ${movement.notes || ""}`.toLowerCase().includes(needle);
    return matchesText && (filter === "all" || group(movement.movement_type) === filter);
  }); }, [filter, movements, query]);

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}>
    <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ BACK</Text></Pressable><Text style={styles.eyebrow}>AUDIT TRAIL</Text><Text style={styles.title}>Movements</Text><Text style={styles.subtitle}>Latest inventory activity across receiving, rentals, returns and counts.</Text>
    <View style={styles.summary}><Text style={styles.summaryValue}>{movements.length}</Text><Text style={styles.summaryText}>RECENT MOVEMENTS</Text></View>
    <TextInput value={query} onChangeText={setQuery} placeholder="Search item, unit or booking" placeholderTextColor="#9c9184" style={styles.search} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{(["all","receive","rental","return","attention","count"] as Filter[]).map((value) => <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value ? styles.filterOn : null]}><Text style={[styles.filterText, filter === value ? styles.filterTextOn : null]}>{pretty(value)}</Text></Pressable>)}</ScrollView>
    {loading ? <View style={styles.state}><ActivityIndicator color="#23313f" /></View> : null}{error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
    {!loading && !error && visible.length === 0 ? <View style={styles.state}><Text style={styles.empty}>No movements match this filter.</Text></View> : null}
    {visible.map((movement) => { const item = one(movement.inventory_items); const unit = one(movement.inventory_units); const booking = one(movement.bookings); const from = one(movement.from_location); const to = one(movement.to_location); return <View key={movement.id} style={styles.card}>
      <View style={styles.cardTop}><View style={styles.cardCopy}><Text style={styles.itemName}>{item?.name || "Inventory movement"}</Text><Text style={styles.meta}>{unit?.unit_code || item?.sku || `Quantity ${Number(movement.quantity || 0)}`}</Text></View><View style={[styles.badge, group(movement.movement_type) === "attention" ? styles.badgeAlert : null]}><Text style={[styles.badgeText, group(movement.movement_type) === "attention" ? styles.badgeTextAlert : null]}>{pretty(movement.movement_type)}</Text></View></View>
      {(from?.name || to?.name) ? <Text style={styles.route}>{from?.name || "—"}  →  {to?.name || "—"}</Text> : null}
      {(movement.from_status || movement.to_status) ? <Text style={styles.status}>{pretty(movement.from_status)}  →  {pretty(movement.to_status)}</Text> : null}
      {booking?.booking_number ? <Text style={styles.booking}>BOOKING #{booking.booking_number}</Text> : null}
      {movement.notes ? <Text style={styles.notes}>{movement.notes}</Text> : null}<Text style={styles.date}>{formatDate(movement.created_at)}</Text>
    </View>; })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#f5f1e8"},content:{paddingTop:54,paddingHorizontal:18,paddingBottom:120},back:{alignSelf:"flex-start",paddingVertical:7},backText:{color:"#b88645",fontSize:10,fontWeight:"900"},eyebrow:{color:"#b88645",fontSize:10,fontWeight:"900",letterSpacing:1.4,marginTop:4},title:{color:"#23313f",fontSize:30,fontWeight:"900",marginTop:5},subtitle:{color:"#81766a",fontSize:12,lineHeight:18,marginTop:4},summary:{alignItems:"center",backgroundColor:"#23313f",borderRadius:18,flexDirection:"row",gap:12,marginTop:16,padding:14},summaryValue:{color:"#f0c987",fontSize:25,fontWeight:"900"},summaryText:{color:"#fff",fontSize:9,fontWeight:"900",letterSpacing:1},search:{backgroundColor:"#fff",borderColor:"#ded4c6",borderRadius:14,borderWidth:1,color:"#23313f",fontSize:11,marginTop:11,minHeight:45,paddingHorizontal:12},filters:{gap:7,paddingVertical:10},filter:{backgroundColor:"#f9f5ef",borderColor:"#ded4c6",borderRadius:99,borderWidth:1,paddingHorizontal:11,paddingVertical:8},filterOn:{backgroundColor:"#23313f",borderColor:"#23313f"},filterText:{color:"#71675c",fontSize:8,fontWeight:"900"},filterTextOn:{color:"#fff"},state:{alignItems:"center",backgroundColor:"#fff",borderRadius:18,marginTop:8,padding:24},empty:{color:"#81766a",fontSize:11},error:{backgroundColor:"#fff1f0",borderRadius:16,marginTop:8,padding:13},errorText:{color:"#8c2e2a",fontSize:11},card:{backgroundColor:"#fff",borderRadius:17,marginTop:8,padding:13},cardTop:{alignItems:"flex-start",flexDirection:"row"},cardCopy:{flex:1,paddingRight:8},itemName:{color:"#23313f",fontSize:13,fontWeight:"900"},meta:{color:"#81766a",fontSize:9,marginTop:3},badge:{backgroundColor:"#eef4f8",borderRadius:99,paddingHorizontal:8,paddingVertical:5},badgeAlert:{backgroundColor:"#fff0ec"},badgeText:{color:"#3b617d",fontSize:7,fontWeight:"900"},badgeTextAlert:{color:"#a83d34"},route:{color:"#23313f",fontSize:10,fontWeight:"700",marginTop:10},status:{color:"#81766a",fontSize:9,marginTop:5},booking:{color:"#a2763a",fontSize:8,fontWeight:"900",letterSpacing:.6,marginTop:8},notes:{color:"#6c6258",fontSize:10,lineHeight:15,marginTop:7},date:{color:"#aaa096",fontSize:8,marginTop:8,textAlign:"right"},
});

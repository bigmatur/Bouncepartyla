import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { loadMobileCrmInbox, updateMobileCrmConversation, type MobileCrmConversation, type MobileCrmMessage } from "../../lib/mobileApi";

function when(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value); if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export function AdminCrmScreen({ onBack, canReply }: { onBack: () => void; canReply: boolean }) {
  const [conversations, setConversations] = useState<MobileCrmConversation[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "instagram" | "internal">("all");
  const [selected, setSelected] = useState<MobileCrmConversation | null>(null);
  const [messages, setMessages] = useState<MobileCrmMessage[]>([]);
  const [draft, setDraft] = useState(""); const [loading, setLoading] = useState(true); const [sending, setSending] = useState(false); const [error, setError] = useState("");
  const loadList = useCallback(async () => { const result = await loadMobileCrmInbox(); if (!result.success) setError(result.error); else { setError(""); setConversations(result.data.conversations || []); } }, []);
  const open = useCallback(async (conversation: MobileCrmConversation) => { setSelected(conversation); setMessages([]); const result = await loadMobileCrmInbox(conversation.id); if (!result.success) { setError(result.error); return; } setMessages(result.data.messages || []); void updateMobileCrmConversation({ action: "read", conversationId: conversation.id }); setConversations((list) => list.map((item) => item.id === conversation.id ? { ...item, unread_count: 0 } : item)); }, []);
  useEffect(() => {
    if (selected) return;
    void loadList().finally(() => setLoading(false));
    const id = setInterval(() => {
      if (AppState.currentState === "active") void loadList();
    }, 20_000);
    return () => clearInterval(id);
  }, [loadList, selected]);
  useEffect(() => {
    if (!selected) return;
    const refreshOpenConversation = async () => {
      const result = await loadMobileCrmInbox(selected.id);
      if (result.success) setMessages(result.data.messages || []);
    };
    const id = setInterval(() => {
      if (AppState.currentState === "active") void refreshOpenConversation();
    }, 12_000);
    return () => clearInterval(id);
  }, [selected]);
  const visibleConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const channel = String(conversation.last_channel || "").toLowerCase();
      if (filter === "unread" && Number(conversation.unread_count || 0) <= 0) return false;
      if (filter === "instagram" && channel !== "instagram") return false;
      if (filter === "internal" && !["internal", "staff"].includes(channel)) return false;
      if (normalized) {
        const haystack = `${conversation.display_name || ""} ${conversation.subject || ""} ${conversation.last_message || ""}`.toLowerCase();
        if (!haystack.includes(normalized)) return false;
      }
      return true;
    });
  }, [conversations, filter, query]);
  async function send() { if (!selected || !draft.trim() || sending) return; setSending(true); const result = await updateMobileCrmConversation({ action: "reply", conversationId: selected.id, body: draft.trim() }); if (!result.success) Alert.alert("Could not send reply", result.error); else { setDraft(""); await open(selected); await loadList(); } setSending(false); }
  if (selected) return <View style={styles.screen}><View style={styles.chatHead}><Pressable onPress={() => setSelected(null)}><Text style={styles.back}>‹ INBOX</Text></Pressable><Text style={styles.chatName} numberOfLines={1}>{selected.display_name || "Conversation"}</Text><Text style={styles.channel}>{String(selected.last_channel || "CRM").toUpperCase()}</Text></View><ScrollView style={styles.screen} contentContainerStyle={styles.chatContent}>{messages.map((message) => <View key={message.id} style={[styles.bubble, message.direction === "outbound" ? styles.outbound : styles.inbound]}><Text style={styles.bubbleLabel}>{message.direction === "outbound" ? "YOU" : (message.sender_identity || selected.display_name || "CUSTOMER")}</Text><Text style={styles.bubbleText}>{message.body_text || ""}</Text><Text style={styles.messageTime}>{when(message.sent_at || message.created_at)}</Text></View>)}</ScrollView>{canReply ? <View style={styles.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Write a reply…" placeholderTextColor="#9c9184" multiline style={styles.input}/><Pressable onPress={() => void send()} style={[styles.send, (!draft.trim() || sending) && styles.disabled]}><Text style={styles.sendText}>{sending ? "…" : "SEND"}</Text></Pressable></View> : <View style={styles.readOnly}><Text style={styles.readOnlyText}>Your role can view this conversation but cannot send replies.</Text></View>}</View>;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadList()} />}><Pressable onPress={onBack}><Text style={styles.back}>‹ BACK</Text></Pressable><Text style={styles.eyebrow}>COMMUNICATION HUB</Text><Text style={styles.title}>CRM Inbox</Text><Text style={styles.sub}>Customer messages from Instagram, SMS, email and internal support.</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search conversations" placeholderTextColor="#9c9184" style={styles.search}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{(["all", "unread", "instagram", "internal"] as const).map((value) => <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value.toUpperCase()}</Text></Pressable>)}</ScrollView>{error ? <Text style={styles.error}>{error}</Text> : null}{loading ? <ActivityIndicator color="#23313f" style={{ marginTop: 28 }} /> : visibleConversations.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No conversations</Text><Text style={styles.emptyText}>Try another filter or search.</Text></View> : visibleConversations.map((conversation) => <Pressable key={conversation.id} onPress={() => void open(conversation)} style={[styles.row, Number(conversation.unread_count || 0) > 0 && styles.rowUnread]}><View style={styles.avatar}><Text style={styles.avatarText}>{String(conversation.display_name || "C").slice(0, 2).toUpperCase()}</Text></View><View style={styles.rowText}><Text style={styles.name} numberOfLines={1}>{conversation.display_name || "Conversation"}</Text><Text style={styles.preview} numberOfLines={1}>{conversation.last_message || conversation.subject || "No messages yet"}</Text><Text style={styles.meta}>{String(conversation.last_channel || "CRM").toUpperCase()} · {when(conversation.last_message_at)}</Text></View>{Number(conversation.unread_count || 0) > 0 ? <View style={styles.count}><Text style={styles.countText}>{conversation.unread_count}</Text></View> : null}</Pressable>)}</ScrollView>;
}
const styles = StyleSheet.create({ screen:{flex:1,backgroundColor:"#f5f1e8"}, content:{paddingTop:54,paddingHorizontal:18,paddingBottom:120}, back:{color:"#b88645",fontSize:10,fontWeight:"900",paddingVertical:8}, eyebrow:{color:"#b88645",fontSize:10,fontWeight:"900",letterSpacing:1.4,marginTop:5}, title:{color:"#23313f",fontSize:30,fontWeight:"900",marginTop:5}, sub:{color:"#81766a",fontSize:12,lineHeight:18,marginTop:4},search:{backgroundColor:"#fff",borderRadius:15,color:"#23313f",fontSize:13,marginTop:14,minHeight:48,paddingHorizontal:14},filters:{gap:8,paddingBottom:2,paddingTop:9},filter:{backgroundColor:"#fff",borderColor:"#ded6c8",borderRadius:16,borderWidth:1,justifyContent:"center",minHeight:36,paddingHorizontal:12},filterActive:{backgroundColor:"#23313f",borderColor:"#23313f"},filterText:{color:"#81766a",fontSize:8,fontWeight:"900"},filterTextActive:{color:"#fff"},empty:{alignItems:"center",backgroundColor:"#fff",borderRadius:18,marginTop:12,padding:26},emptyTitle:{color:"#23313f",fontSize:15,fontWeight:"900"},emptyText:{color:"#81766a",fontSize:10,marginTop:4},error:{backgroundColor:"#fff1f0",borderRadius:14,color:"#8c2e2a",fontSize:11,marginTop:14,padding:12}, row:{alignItems:"center",backgroundColor:"#fff",borderRadius:18,flexDirection:"row",marginTop:10,padding:13},rowUnread:{backgroundColor:"#fff8eb",borderColor:"#d8c39b",borderWidth:1},avatar:{alignItems:"center",backgroundColor:"#23313f",borderRadius:99,height:42,justifyContent:"center",width:42},avatarText:{color:"#fff",fontSize:11,fontWeight:"900"},rowText:{flex:1,paddingHorizontal:10},name:{color:"#23313f",fontSize:13,fontWeight:"900"},preview:{color:"#6c6258",fontSize:11,marginTop:4},meta:{color:"#a29686",fontSize:8,fontWeight:"900",marginTop:5},count:{alignItems:"center",backgroundColor:"#23313f",borderRadius:99,height:23,justifyContent:"center",minWidth:23},countText:{color:"#fff",fontSize:9,fontWeight:"900"},chatHead:{backgroundColor:"#fff",paddingHorizontal:18,paddingTop:54,paddingBottom:13},chatName:{color:"#23313f",fontSize:18,fontWeight:"900",marginTop:8},channel:{color:"#b88645",fontSize:9,fontWeight:"900",marginTop:3},chatContent:{padding:18,paddingBottom:110},bubble:{borderRadius:18,marginBottom:9,maxWidth:"82%",padding:12},inbound:{alignSelf:"flex-start",backgroundColor:"#fff"},outbound:{alignSelf:"flex-end",backgroundColor:"#dbead7"},bubbleLabel:{color:"#a2763a",fontSize:8,fontWeight:"900"},bubbleText:{color:"#23313f",fontSize:13,lineHeight:18,marginTop:5},messageTime:{color:"#81766a",fontSize:8,marginTop:7},composer:{alignItems:"flex-end",backgroundColor:"#fff",borderTopColor:"#e5ddd1",borderTopWidth:1,flexDirection:"row",gap:8,padding:10},input:{backgroundColor:"#f7f4ef",borderRadius:14,color:"#23313f",flex:1,fontSize:13,maxHeight:100,minHeight:44,paddingHorizontal:12,paddingVertical:10},send:{backgroundColor:"#23313f",borderRadius:14,paddingHorizontal:14,paddingVertical:15},sendText:{color:"#fff",fontSize:9,fontWeight:"900"},disabled:{opacity:.45},readOnly:{backgroundColor:"#fff8eb",padding:14},readOnlyText:{color:"#6c6258",fontSize:11,textAlign:"center"} });

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { supabase } from "../lib/supabase";

type Message = { id: string; direction: string; body_text: string | null; sent_at: string | null; created_at: string };

function clientMessageId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function SupportChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    const result = await supabase.rpc("get_my_staff_support_messages", { p_limit: 100 });
    if (result.error) { setError(result.error.message); setLoading(false); return; }
    setMessages(Array.isArray(result.data) ? [...result.data].reverse() : []);
    setLoading(false);
    void supabase.rpc("mark_my_staff_support_read");
  }, []);

  useEffect(() => {
    void refresh();

    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        void refresh();
      }
    }, 8000);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refresh]);

  const send = useCallback(async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true); setError("");
    const result = await supabase.rpc("send_my_staff_support_message", {
      p_client_message_id: clientMessageId(), p_body: text,
    });
    if (result.error) setError(result.error.message);
    else { setBody(""); await refresh(); }
    setSending(false);
  }, [body, refresh, sending]);

  return <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : undefined}
    keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    style={styles.screen}
  >
    <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>
    <Text style={styles.title}>Support chat</Text>
    <Text style={styles.copy}>Message the operations team. They reply in CRM Inbox.</Text>
    {loading ? <ActivityIndicator color="#23313f" style={styles.loader} /> : <ScrollView contentContainerStyle={styles.messages}>
      {messages.length === 0 ? <Text style={styles.empty}>No messages yet. Start a conversation with support.</Text> : messages.map((message) => <View key={message.id} style={[styles.bubble, message.direction === "outbound" ? styles.reply : styles.sent]}>
        <Text style={styles.bubbleLabel}>{message.direction === "outbound" ? "Support" : "You"}</Text>
        <Text style={[styles.bubbleText, message.direction === "outbound" ? styles.replyText : null]}>{message.body_text || ""}</Text>
      </View>)}
    </ScrollView>}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <View style={styles.composer}><TextInput value={body} onChangeText={setBody} placeholder="Write a message…" multiline maxLength={4000} style={styles.input} /><Pressable disabled={sending || !body.trim()} onPress={() => void send()} style={[styles.send, sending || !body.trim() ? styles.disabled : null]}><Text style={styles.sendText}>{sending ? "Sending…" : "Send"}</Text></Pressable></View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#f6f1e7", flex: 1, padding: 24, paddingTop: 30 }, eyebrow: { color: "#bd8840", fontSize: 13, fontWeight: "900", letterSpacing: 2 }, title: { color: "#23313f", fontSize: 34, fontWeight: "900", marginTop: 8 }, copy: { color: "#6c6258", fontSize: 15, lineHeight: 22, marginTop: 8 }, loader: { marginTop: 48 }, messages: { gap: 10, paddingVertical: 24 }, empty: { color: "#6c6258", lineHeight: 22, textAlign: "center", marginTop: 48 }, bubble: { borderRadius: 18, padding: 13, maxWidth: "88%" }, sent: { backgroundColor: "#23313f", alignSelf: "flex-end" }, reply: { backgroundColor: "#fff", alignSelf: "flex-start" }, bubbleLabel: { color: "#c9964f", fontSize: 11, fontWeight: "900", marginBottom: 4 }, bubbleText: { color: "#fff", fontSize: 15, lineHeight: 21 }, replyText: { color: "#23313f" }, error: { color: "#9b3524", fontSize: 13, marginBottom: 8 }, composer: { flexDirection: "row", gap: 8, alignItems: "flex-end", borderTopColor: "#ded4c7", borderTopWidth: 1, paddingTop: 12 }, input: { backgroundColor: "#fff", borderColor: "#ded4c7", borderRadius: 16, borderWidth: 1, flex: 1, minHeight: 48, padding: 12, color: "#23313f" }, send: { backgroundColor: "#c9964f", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 15 }, disabled: { opacity: 0.45 }, sendText: { color: "#fff", fontWeight: "900" },
});

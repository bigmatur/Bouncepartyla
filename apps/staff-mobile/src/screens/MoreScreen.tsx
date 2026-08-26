import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase";

export function MoreScreen() {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>
      <Text style={styles.title}>More</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Driver App</Text>
        <Text style={styles.cardText}>
          Route navigation, live location and staff time are connected to your staff account.
        </Text>
      </View>

      <Pressable
        onPress={() => void supabase.auth.signOut()}
        style={({ pressed }) => [
          styles.signOutButton,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f1e8",
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 62,
    paddingBottom: 120,
  },

  eyebrow: {
    color: "#b88645",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.7,
  },

  title: {
    color: "#23313f",
    fontSize: 32,
    fontWeight: "900",
    marginTop: 6,
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    marginTop: 24,
    padding: 18,
  },

  cardTitle: {
    color: "#23313f",
    fontSize: 18,
    fontWeight: "900",
  },

  cardText: {
    color: "#81766a",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },

  signOutButton: {
    alignItems: "center",
    borderColor: "#cbbfaf",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 50,
  },

  signOutText: {
    color: "#23313f",
    fontSize: 14,
    fontWeight: "900",
  },

  pressed: {
    opacity: 0.7,
  },
});

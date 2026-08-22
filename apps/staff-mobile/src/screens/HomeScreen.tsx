import { Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase";

export function HomeScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>
      <Text style={styles.title}>Staff App</Text>
      <Text style={styles.subtitle}>
        Authentication is connected. Route data comes next.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>TODAY</Text>
        <Text style={styles.cardTitle}>Driver workspace</Text>
        <Text style={styles.cardText}>
          The next implementation step will load the signed-in driver profile and
          today&apos;s assigned route directly through the existing Supabase RLS.
        </Text>
      </View>

      <Pressable
        onPress={() => void supabase.auth.signOut()}
        style={({ pressed }) => [styles.signOut, pressed ? styles.pressed : null]}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f1e8",
    paddingHorizontal: 20,
    paddingTop: 72,
  },
  eyebrow: {
    color: "#b88645",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  title: {
    color: "#23313f",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 6,
  },
  subtitle: {
    color: "#6c6258",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    marginTop: 28,
    padding: 20,
  },
  cardLabel: {
    color: "#b88645",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  cardTitle: {
    color: "#23313f",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 8,
  },
  cardText: {
    color: "#6c6258",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  signOut: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "#cfc7ba",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  signOutText: {
    color: "#23313f",
    fontSize: 14,
    fontWeight: "700",
  },
});

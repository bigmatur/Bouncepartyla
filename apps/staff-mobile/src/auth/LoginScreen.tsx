import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../lib/supabase";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    }

    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>
        <Text style={styles.title}>Staff</Text>
        <Text style={styles.subtitle}>Sign in with your employee account.</Text>

        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          style={styles.input}
          value={email}
        />

        <TextInput
          autoCapitalize="none"
          autoComplete="password"
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          disabled={loading}
          onPress={() => void signIn()}
          style={({ pressed }) => [
            styles.button,
            pressed && !loading ? styles.buttonPressed : null,
            loading ? styles.buttonDisabled : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f1e8",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 28,
    backgroundColor: "#ffffff",
    padding: 24,
  },
  eyebrow: {
    color: "#b88645",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  title: {
    color: "#23313f",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 6,
  },
  subtitle: {
    color: "#6c6258",
    fontSize: 15,
    marginBottom: 24,
    marginTop: 6,
  },
  input: {
    borderColor: "#ddd6ca",
    borderRadius: 16,
    borderWidth: 1,
    color: "#23313f",
    fontSize: 16,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: {
    color: "#b42318",
    fontSize: 13,
    marginBottom: 14,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#23313f",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 52,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});

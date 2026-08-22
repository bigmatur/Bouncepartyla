import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";

import { LoginScreen } from "./src/auth/LoginScreen";
import { DriverLocationTracker } from "./src/features/location/DriverLocationTracker";
import { HomeScreen } from "./src/screens/HomeScreen";
import { supabase } from "./src/lib/supabase";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setBooting(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setBooting(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (booting) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#23313f" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {session ? (
        <>
          <DriverLocationTracker />
          <HomeScreen />
        </>
      ) : (
        <LoginScreen />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: "#f5f1e8",
    flex: 1,
    justifyContent: "center",
  },
});

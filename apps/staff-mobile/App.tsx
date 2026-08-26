import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";

import { LoginScreen } from "./src/auth/LoginScreen";
import { DriverLocationTracker } from "./src/features/location/DriverLocationTracker";
import { HomeScreen } from "./src/screens/HomeScreen";
import { MoreScreen } from "./src/screens/MoreScreen";
import { ShiftScreen } from "./src/screens/ShiftScreen";
import { supabase } from "./src/lib/supabase";

type AppTab = "route" | "shift" | "more";

function AppShell() {
  const [tab, setTab] =
    useState<AppTab>("route");

  const [immersive, setImmersive] =
    useState(false);

  return (
    <View style={styles.shell}>
      <View style={styles.screenArea}>
        {tab === "route" ? (
          <HomeScreen
            onImmersiveChange={
              setImmersive
            }
          />
        ) : tab === "shift" ? (
          <ShiftScreen />
        ) : (
          <MoreScreen />
        )}
      </View>

      {!immersive ? (
        <SafeAreaView
          style={styles.tabSafeArea}
        >
          <View style={styles.tabBar}>
            <Pressable
              onPress={() =>
                setTab("route")
              }
              style={({ pressed }) => [
                styles.tabButton,

                tab === "route"
                  ? styles.tabButtonActive
                  : null,

                pressed
                  ? styles.pressed
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.tabText,

                  tab === "route"
                    ? styles.tabTextActive
                    : null,
                ]}
              >
                Route
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                setTab("shift")
              }
              style={({ pressed }) => [
                styles.tabButton,

                tab === "shift"
                  ? styles.tabButtonActive
                  : null,

                pressed
                  ? styles.pressed
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.tabText,

                  tab === "shift"
                    ? styles.tabTextActive
                    : null,
                ]}
              >
                Shift
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                setTab("more")
              }
              style={({ pressed }) => [
                styles.tabButton,

                tab === "more"
                  ? styles.tabButtonActive
                  : null,

                pressed
                  ? styles.pressed
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.tabText,

                  tab === "more"
                    ? styles.tabTextActive
                    : null,
                ]}
              >
                More
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

export default function App() {
  const [session, setSession] =
    useState<Session | null>(null);

  const [booting, setBooting] =
    useState(true);

  useEffect(() => {
    let mounted = true;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) {
          return;
        }

        setSession(data.session);
        setBooting(false);
      });

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          nextSession,
        ) => {
          setSession(nextSession);
          setBooting(false);
        },
      );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (booting) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />

        <ActivityIndicator
          size="large"
          color="#23313f"
        />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />

      {session ? (
        <>
          <DriverLocationTracker />
          <AppShell />
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

  shell: {
    backgroundColor: "#f5f1e8",
    flex: 1,
  },

  screenArea: {
    flex: 1,
  },

  tabSafeArea: {
    backgroundColor:
      "rgba(245,241,232,0.98)",
  },

  tabBar: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
    marginHorizontal: 12,
    padding: 6,
  },

  tabButton: {
    alignItems: "center",
    borderRadius: 15,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },

  tabButtonActive: {
    backgroundColor: "#23313f",
  },

  tabText: {
    color: "#81766a",
    fontSize: 12,
    fontWeight: "900",
  },

  tabTextActive: {
    color: "#ffffff",
  },

  pressed: {
    opacity: 0.7,
  },
});
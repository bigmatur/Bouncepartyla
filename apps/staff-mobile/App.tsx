import { useCallback, useEffect, useRef, useState } from "react";
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

import { AdminShell } from "./src/admin/AdminShell";

import { LoginScreen } from "./src/auth/LoginScreen";
import { DriverLocationTracker } from "./src/features/location/DriverLocationTracker";
import { HomeScreen } from "./src/screens/HomeScreen";
import { MoreScreen } from "./src/screens/MoreScreen";
import { ShiftScreen } from "./src/screens/ShiftScreen";
import { loadMobileAccess, type MobileAccess } from "./src/lib/mobileAccess";
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

  const [access, setAccess] =
    useState<MobileAccess | null>(null);

  const [booting, setBooting] =
    useState(true);

  const [bootError, setBootError] =
    useState("");

  const bootAttemptRef = useRef(0);

  const applySession = useCallback(
    async (
      nextSession: Session | null,
      attempt: number,
    ) => {
      if (attempt !== bootAttemptRef.current) {
        return;
      }

      setSession(nextSession);

      if (!nextSession?.user) {
        setAccess(null);
        setBootError("");
        setBooting(false);
        return;
      }

      try {
        const nextAccess =
          await loadMobileAccess(
            nextSession.user,
          );

        if (
          attempt !==
          bootAttemptRef.current
        ) {
          return;
        }

        setAccess(nextAccess);
        setBootError("");
      } catch (accessError) {
        if (
          attempt !==
          bootAttemptRef.current
        ) {
          return;
        }

        console.error(
          "[App] Failed to load mobile access:",
          accessError,
        );

        setAccess(null);
        setBootError(
          accessError instanceof Error
            ? accessError.message
            : "Could not load your staff access.",
        );
      } finally {
        if (
          attempt ===
          bootAttemptRef.current
        ) {
          setBooting(false);
        }
      }
    },
    [],
  );

  const bootstrapSession =
    useCallback(async () => {
      const attempt =
        ++bootAttemptRef.current;

      setBooting(true);
      setBootError("");

      try {
        const {
          data,
          error: sessionError,
        } =
          await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        await applySession(
          data.session,
          attempt,
        );
      } catch (sessionError) {
        if (
          attempt !==
          bootAttemptRef.current
        ) {
          return;
        }

        console.error(
          "[App] Failed to restore session:",
          sessionError,
        );

        setSession(null);
        setAccess(null);
        setBooting(false);

        setBootError(
          sessionError instanceof Error
            ? sessionError.message
            : "Could not start the app.",
        );
      }
    }, [applySession]);

  useEffect(() => {
    void bootstrapSession();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          nextSession,
        ) => {
          const attempt =
            ++bootAttemptRef.current;

          setBooting(true);
          setBootError("");

          void applySession(
            nextSession,
            attempt,
          );
        },
      );

    return () => {
      ++bootAttemptRef.current;
      subscription.unsubscribe();
    };
  }, [
    applySession,
    bootstrapSession,
  ]);

  if (booting) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />

        <ActivityIndicator
          size="large"
          color="#23313f"
        />

        <Text style={styles.loadingText}>
          Starting app…
        </Text>
      </View>
    );
  }

  if (bootError) {
    return (
      <SafeAreaView
        style={styles.bootErrorScreen}
      >
        <StatusBar style="dark" />

        <View style={styles.bootErrorCard}>
          <Text style={styles.bootErrorTitle}>
            Could not start the app
          </Text>

          <Text style={styles.bootErrorText}>
            {bootError}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void bootstrapSession()
            }
            style={({ pressed }) => [
              styles.retryButton,
              pressed
                ? styles.pressed
                : null,
            ]}
          >
            <Text
              style={
                styles.retryButtonText
              }
            >
              Try Again
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar style="dark" />

      {session ? (
        access?.interface === "admin" ? (
          <AdminShell access={access} />
        ) : (
          <>
            <DriverLocationTracker />
            <AppShell />
          </>
        )
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
    gap: 12,
    justifyContent: "center",
  },

  loadingText: {
    color: "#6c6258",
    fontSize: 13,
    fontWeight: "700",
  },

  bootErrorScreen: {
    backgroundColor: "#f5f1e8",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  bootErrorCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 22,
  },

  bootErrorTitle: {
    color: "#23313f",
    fontSize: 20,
    fontWeight: "900",
  },

  bootErrorText: {
    color: "#6c6258",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },

  retryButton: {
    alignItems: "center",
    backgroundColor: "#23313f",
    borderRadius: 14,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 18,
  },

  retryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
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
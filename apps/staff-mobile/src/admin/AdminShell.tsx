import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { MobileAccess } from "../lib/mobileAccess";

import { AdminDashboardScreen } from "./screens/AdminDashboardScreen";
import { AdminBookingsScreen } from "./screens/AdminBookingsScreen";
import { AdminRoutesScreen } from "./screens/AdminRoutesScreen";
import { AdminInventoryScreen } from "./screens/AdminInventoryScreen";
import { AdminMoreScreen } from "./screens/AdminMoreScreen";
import { AdminNewBookingScreen } from "./screens/AdminNewBookingScreen";

type AdminTab =
  | "dashboard"
  | "bookings"
  | "routes"
  | "inventory"
  | "more";

const TABS: Array<{
  key: AdminTab;
  label: string;
}> = [
  {
    key: "dashboard",
    label: "Home",
  },
  {
    key: "bookings",
    label: "Bookings",
  },
  {
    key: "routes",
    label: "Routes",
  },
  {
    key: "inventory",
    label: "Inventory",
  },
  {
    key: "more",
    label: "More",
  },
];

export function AdminShell({
  access,
}: {
  access: MobileAccess;
}) {
  const [tab, setTab] =
    useState<AdminTab>("dashboard");

  const [newBookingOpen, setNewBookingOpen] =
    useState(false);

  if (newBookingOpen) {
    return (
      <View style={styles.shell}>
        <AdminNewBookingScreen
          onClose={() =>
            setNewBookingOpen(false)
          }
        />
      </View>
    );
  }

  const showNewBookingButton =
    tab === "dashboard" ||
    tab === "bookings";

  return (
    <View style={styles.shell}>
      <View style={styles.screenArea}>
        {tab === "dashboard" ? (
          <AdminDashboardScreen
            displayName={access.displayName}
          />
        ) : tab === "bookings" ? (
          <AdminBookingsScreen />
        ) : tab === "routes" ? (
          <AdminRoutesScreen />
        ) : tab === "inventory" ? (
          <AdminInventoryScreen />
        ) : tab === "more" ? (
          <AdminMoreScreen
            role={access.role}
          />
        ) : (
          <ComingSoon
            title={
              TABS.find(
                (item) =>
                  item.key === tab,
              )?.label || "Admin"
            }
          />
        )}

        {showNewBookingButton ? (
          <Pressable
            onPress={() =>
              setNewBookingOpen(true)
            }
            style={({ pressed }) => [
              styles.newBookingButton,
              pressed
                ? styles.pressed
                : null,
            ]}
          >
            <Text
              style={
                styles.newBookingPlus
              }
            >
              +
            </Text>

            <Text
              style={
                styles.newBookingText
              }
            >
              New Booking
            </Text>
          </Pressable>
        ) : null}
      </View>

      <SafeAreaView
        style={styles.tabSafeArea}
      >
        <View style={styles.tabBar}>
          {TABS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() =>
                setTab(item.key)
              }
              style={({ pressed }) => [
                styles.tabButton,
                tab === item.key
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
                  tab === item.key
                    ? styles.tabTextActive
                    : null,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

function ComingSoon({
  title,
}: {
  title: string;
}) {
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={
        styles.pageContent
      }
    >
      <Text style={styles.eyebrow}>
        BOUNCE PARTY LA
      </Text>

      <Text style={styles.title}>
        {title}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {title} mobile
        </Text>

        <Text style={styles.cardText}>
          The admin navigation is
          connected. This screen is the
          next implementation step.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    gap: 4,
    marginBottom: 4,
    marginHorizontal: 8,
    padding: 5,
  },

  tabButton: {
    alignItems: "center",
    borderRadius: 15,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 2,
  },

  tabButtonActive: {
    backgroundColor: "#23313f",
  },

  tabText: {
    color: "#81766a",
    fontSize: 10,
    fontWeight: "900",
  },

  tabTextActive: {
    color: "#ffffff",
  },

  pressed: {
    opacity: 0.7,
  },

  newBookingButton: {
    position: "absolute",
    right: 18,
    bottom: 14,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 26,
    backgroundColor: "#23313f",

    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 5,
  },

  newBookingPlus: {
    color: "#f0c987",
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 25,
    marginRight: 7,
  },

  newBookingText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  page: {
    backgroundColor: "#f5f1e8",
    flex: 1,
  },

  pageContent: {
    paddingBottom: 120,
    paddingHorizontal: 18,
    paddingTop: 62,
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
});
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";
import { AdminCalendarScreen } from "./AdminCalendarScreen";
import { AdminCustomersScreen } from "./AdminCustomersScreen";
import { AdminHandoversScreen } from "./AdminHandoversScreen";
import { AdminStaffScreen } from "./AdminStaffScreen";
import { AdminTasksScreen } from "./AdminTasksScreen";

type MoreSection = "menu" | "staff" | "customers" | "calendar" | "tasks" | "handovers";

type Props = {
  role: string;
};

export function AdminMoreScreen({ role }: Props) {
  const [section, setSection] = useState<MoreSection>("menu");

  if (section === "staff") {
    return <AdminStaffScreen onBack={() => setSection("menu")} />;
  }

  if (section === "customers") {
    return <AdminCustomersScreen onBack={() => setSection("menu")} />;
  }

  if (section === "calendar") {
    return <AdminCalendarScreen onBack={() => setSection("menu")} />;
  }

  if (section === "tasks") {
    return <AdminTasksScreen onBack={() => setSection("menu")} />;
  }

  if (section === "handovers") {
    return <AdminHandoversScreen onBack={() => setSection("menu")} />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>
      <Text style={styles.title}>More</Text>
      <Text style={styles.subtitle}>
        Team, customers and daily operations
      </Text>

      <View style={styles.accountCard}>
        <View>
          <Text style={styles.accountLabel}>SIGNED IN AS</Text>
          <Text style={styles.accountRole}>{pretty(role)}</Text>
        </View>
        <View style={styles.accountBadge}>
          <Text style={styles.accountBadgeText}>ADMIN</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Operations</Text>

      <MenuCard
        title="Staff"
        description="Drivers, staff contacts and access roles"
        badge="TEAM"
        onPress={() => setSection("staff")}
      />
      <MenuCard
        title="Customers / CRM"
        description="Customer records, booking history and balances"
        badge="CRM"
        onPress={() => setSection("customers")}
      />
      <MenuCard
        title="Calendar"
        description="Day schedule and booking timeline"
        badge="DATE"
        onPress={() => setSection("calendar")}
      />
      <MenuCard
        title="Tasks"
        description="Deposits, contracts, COI and follow-ups"
        badge="TODO"
        onPress={() => setSection("tasks")}
      />
      <MenuCard
        title="Handovers"
        description="Packing slips, delivery acknowledgements and signatures"
        badge="SIGN"
        onPress={() => setSection("handovers")}
      />

      <View style={styles.futureCard}>
        <Text style={styles.futureTitle}>Next in More</Text>
        <Text style={styles.futureText}>
          Analytics and settings will plug into this same mobile hub.
        </Text>
      </View>

      <Pressable
        onPress={() => void supabase.auth.signOut()}
        style={({ pressed }) => [
          styles.signOutButton,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={styles.signOutText}>SIGN OUT</Text>
      </Pressable>
    </ScrollView>
  );
}

function MenuCard({
  title,
  description,
  badge,
  onPress,
}: {
  title: string;
  description: string;
  badge: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuCard,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuDescription}>{description}</Text>
      </View>
      <View style={styles.menuBadge}>
        <Text style={styles.menuBadgeText}>{badge}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function pretty(value: string) {
  return String(value || "staff")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: {
    paddingTop: 62,
    paddingHorizontal: 18,
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
  subtitle: {
    color: "#81766a",
    fontSize: 12,
    marginTop: 3,
  },
  accountCard: {
    backgroundColor: "#23313f",
    borderRadius: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 22,
    padding: 18,
  },
  accountLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  accountRole: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  accountBadge: {
    backgroundColor: "#f0c987",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  accountBadgeText: {
    color: "#23313f",
    fontSize: 9,
    fontWeight: "900",
  },
  sectionTitle: {
    color: "#23313f",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 22,
    marginBottom: 9,
  },
  menuCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
    minHeight: 82,
    padding: 15,
  },
  menuText: { flex: 1, paddingRight: 9 },
  menuTitle: {
    color: "#23313f",
    fontSize: 15,
    fontWeight: "900",
  },
  menuDescription: {
    color: "#81766a",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  menuBadge: {
    backgroundColor: "#f7ead0",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  menuBadgeText: {
    color: "#8a6437",
    fontSize: 8,
    fontWeight: "900",
  },
  chevron: {
    color: "#b88645",
    fontSize: 27,
    marginLeft: 8,
  },
  futureCard: {
    backgroundColor: "#eee7dc",
    borderRadius: 18,
    marginTop: 9,
    padding: 15,
  },
  futureTitle: {
    color: "#23313f",
    fontSize: 13,
    fontWeight: "900",
  },
  futureText: {
    color: "#81766a",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  signOutButton: {
    borderColor: "#cbbfaf",
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    marginTop: 18,
  },
  signOutText: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  pressed: { opacity: 0.7 },
});

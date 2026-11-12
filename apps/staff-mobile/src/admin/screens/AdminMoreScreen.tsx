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
import { AdminCleaningScreen } from "./AdminCleaningScreen";
import { AdminCountsScreen } from "./AdminCountsScreen";
import { AdminDamageReportsScreen } from "./AdminDamageReportsScreen";
import { AdminCustomersScreen } from "./AdminCustomersScreen";
import { AdminCrmScreen } from "./AdminCrmScreen";
import { AdminHandoversScreen } from "./AdminHandoversScreen";
import { AdminInventorySetupScreen } from "./AdminInventorySetupScreen";
import { AdminInventoryScreen } from "./AdminInventoryScreen";
import { AdminMovementsScreen } from "./AdminMovementsScreen";
import { AdminNotificationsScreen } from "./AdminNotificationsScreen";
import { AdminPickingScreen } from "./AdminPickingScreen";
import { AdminReceiveScreen } from "./AdminReceiveScreen";
import { AdminReturnsScreen } from "./AdminReturnsScreen";
import { AdminStaffScreen } from "./AdminStaffScreen";
import { AdminSuppliesScreen } from "./AdminSuppliesScreen";
import { AdminTasksScreen } from "./AdminTasksScreen";
import { AdminWarehouseOperationsScreen } from "./AdminWarehouseOperationsScreen";

type MoreSection = "menu" | "staff" | "customers" | "calendar" | "tasks" | "handovers" | "notifications" | "inventory" | "picking" | "counts" | "movements" | "warehouse_operations" | "inventory_setup" | "supplies" | "cleaning" | "receive" | "returns" | "damages" | "crm";

type Props = {
  role: string;
  grantedPermissions: string[];
  initialSection?: "menu" | "notifications";
  onOpenBooking?: (bookingId: string) => void;
};

export function AdminMoreScreen({ role, grantedPermissions, initialSection = "menu", onOpenBooking }: Props) {
  const [section, setSection] = useState<MoreSection>(initialSection);
  const can = (permission: string) =>
    grantedPermissions.length === 0 ||
    grantedPermissions.includes(permission);

  if (section === "staff") {
    return <AdminStaffScreen onBack={() => setSection("menu")} />;
  }

  if (section === "customers") {
    return <AdminCustomersScreen onBack={() => setSection("menu")} onOpenBooking={onOpenBooking} />;
  }

  if (section === "calendar") {
    return <AdminCalendarScreen onBack={() => setSection("menu")} onOpenBooking={onOpenBooking} />;
  }

  if (section === "tasks") {
    return <AdminTasksScreen onBack={() => setSection("menu")} onOpenBooking={onOpenBooking} />;
  }

  if (section === "handovers") {
    return <AdminHandoversScreen onBack={() => setSection("menu")} onOpenBooking={onOpenBooking} />;
  }

  if (section === "notifications") {
    return <AdminNotificationsScreen onBack={() => setSection("menu")} onOpenBooking={onOpenBooking} />;
  }

  if (section === "inventory") {
    return <AdminInventoryScreen onBack={() => setSection("menu")} />;
  }

  if (section === "picking") {
    return <AdminPickingScreen onBack={() => setSection("menu")} />;
  }

  if (section === "cleaning") {
    return <AdminCleaningScreen grantedPermissions={grantedPermissions} onBack={() => setSection("menu")} />;
  }

  if (section === "returns") {
    return <AdminReturnsScreen grantedPermissions={grantedPermissions} onBack={() => setSection("menu")} />;
  }

  if (section === "receive") {
    return <AdminReceiveScreen onBack={() => setSection("menu")} />;
  }

  if (section === "counts") {
    return <AdminCountsScreen grantedPermissions={grantedPermissions} onBack={() => setSection("menu")} />;
  }

  if (section === "movements") {
    return <AdminMovementsScreen onBack={() => setSection("menu")} />;
  }

  if (section === "warehouse_operations") {
    return <AdminWarehouseOperationsScreen grantedPermissions={grantedPermissions} onBack={() => setSection("menu")} />;
  }

  if (section === "supplies") {
    return <AdminSuppliesScreen grantedPermissions={grantedPermissions} onBack={() => setSection("menu")} />;
  }

  if (section === "inventory_setup") {
    return <AdminInventorySetupScreen grantedPermissions={grantedPermissions} onBack={() => setSection("menu")} />;
  }

  if (section === "damages") {
    return <AdminDamageReportsScreen grantedPermissions={grantedPermissions} onBack={() => setSection("menu")} />;
  }

  if (section === "crm") {
    return <AdminCrmScreen onBack={() => setSection("menu")} canReply={can("customers.edit")} />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>
      <Text style={styles.title}>More</Text>
      <Text style={styles.subtitle}>Tools available to your role</Text>

      <View style={styles.accountCard}>
        <View>
          <Text style={styles.accountLabel}>SIGNED IN AS</Text>
          <Text style={styles.accountRole}>{pretty(role)}</Text>
        </View>
        <View style={styles.accountBadge}>
          <Text style={styles.accountBadgeText}>MOBILE ACCESS</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Operations</Text>

      {can("staff.view") ? (
        <MenuCard
          title="Staff"
          description="Drivers, staff contacts and access roles"
          badge="TEAM"
          onPress={() => setSection("staff")}
        />
      ) : null}
      {can("customers.view") ? (
        <MenuCard
          title="CRM Inbox"
          description="Live customer conversations and replies"
          badge="CHAT"
          onPress={() => setSection("crm")}
        />
      ) : null}
      {can("customers.view") ? (
        <MenuCard
          title="Customers / CRM"
          description="Customer records, booking history and balances"
          badge="CRM"
          onPress={() => setSection("customers")}
        />
      ) : null}
      {can("bookings.view") ? (
        <MenuCard
          title="Calendar"
          description="Day, week and month booking schedule"
          badge="DATE"
          onPress={() => setSection("calendar")}
        />
      ) : null}
      {can("dashboard.view") ? (
        <MenuCard
          title="Notifications"
          description="Payments, bookings and operational updates"
          badge="ALERT"
          onPress={() => setSection("notifications")}
        />
      ) : null}
      {can("dashboard.view") ? (
        <MenuCard
          title="Tasks"
          description="Deposits, contracts, COI and follow-ups"
          badge="TODO"
          onPress={() => setSection("tasks")}
        />
      ) : null}
      {can("routes.view") ? (
        <MenuCard
          title="Handovers"
          description="Packing slips, delivery acknowledgements and signatures"
          badge="SIGN"
          onPress={() => setSection("handovers")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Inventory overview"
          description="Live stock, equipment condition and warehouse location"
          badge="STOCK"
          onPress={() => setSection("inventory")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Order picking"
          description="Load each vehicle in route order with the driver's shared checklist"
          badge="PICK"
          onPress={() => setSection("picking")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Inventory movements"
          description="Audit receiving, rentals, returns and stock counts"
          badge="LOG"
          onPress={() => setSection("movements")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Transfers & write-offs"
          description="Move tracked equipment, report damage or retire a unit"
          badge="MOVE"
          onPress={() => setSection("warehouse_operations")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Inventory count"
          description="Count physical stock and review differences"
          badge="COUNT"
          onPress={() => setSection("counts")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Receive stock"
          description="Add delivered equipment to existing inventory"
          badge="IN"
          onPress={() => setSection("receive")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Supplies"
          description="Create itemized delivery documents and receive them to stock"
          badge="SUP"
          onPress={() => setSection("supplies")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Returns"
          description="Receive equipment and send it to cleaning, repair or ready stock"
          badge="RETURN"
          onPress={() => setSection("returns")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Cleaning queue"
          description="Start, complete or report returned equipment"
          badge="CLEAN"
          onPress={() => setSection("cleaning")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Damage reports"
          description="Open damage, repair status and resolved equipment"
          badge="RISK"
          onPress={() => setSection("damages")}
        />
      ) : null}
      {can("inventory.view") ? (
        <MenuCard
          title="Categories & locations"
          description="Maintain item groups and warehouse storage zones"
          badge="SETUP"
          onPress={() => setSection("inventory_setup")}
        />
      ) : null}

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

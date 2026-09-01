import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";

type InventoryCategory = {
  id: string;
  name: string;
  slug?: string | null;
};

type WarehouseLocation = {
  id: string;
  name: string;
  slug?: string | null;
  location_type?: string | null;
};

type InventoryUnit = {
  id: string;
  unit_code?: string | null;
  status?: string | null;
  warehouse_location_id?: string | null;
  condition?: string | null;
  last_cleaned_at?: string | null;
  last_inspected_at?: string | null;
  warehouse_locations?: WarehouseLocation | WarehouseLocation[] | null;
};

type InventoryItem = {
  id: string;
  name: string;
  sku?: string | null;
  description?: string | null;
  tracking_type?: string | null;
  category_id?: string | null;
  unit_label?: string | null;
  quantity_on_hand?: number | string | null;
  quantity_available?: number | string | null;
  minimum_stock?: number | string | null;
  reorder_point?: number | string | null;
  active?: boolean | null;
  sort_order?: number | null;
  notes?: string | null;
  inventory_categories?: InventoryCategory | InventoryCategory[] | null;
  inventory_units?: InventoryUnit[] | null;
};

type InventoryFilter =
  | "all"
  | "available"
  | "out"
  | "cleaning"
  | "repair"
  | "attention";

const OUT_STATUSES = ["reserved", "picked", "loaded", "installed"];
const AVAILABLE_STATUSES = ["available", "returned"];
const REPAIR_STATUSES = ["maintenance", "damaged"];
const LOST_STATUSES = ["lost", "retired"];

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function isQuantityTracked(item: InventoryItem) {
  return ["quantity", "consumable"].includes(
    String(item.tracking_type || "").toLowerCase(),
  );
}

function units(item: InventoryItem) {
  return item.inventory_units || [];
}

function countUnits(item: InventoryItem, statuses: string[]) {
  return units(item).filter((unit) =>
    statuses.includes(String(unit.status || "").toLowerCase()),
  ).length;
}

function total(item: InventoryItem) {
  return isQuantityTracked(item)
    ? Number(item.quantity_on_hand || 0)
    : units(item).length;
}

function available(item: InventoryItem) {
  return isQuantityTracked(item)
    ? Number(item.quantity_available || 0)
    : countUnits(item, AVAILABLE_STATUSES);
}

function out(item: InventoryItem) {
  return isQuantityTracked(item) ? 0 : countUnits(item, OUT_STATUSES);
}

function cleaning(item: InventoryItem) {
  return countUnits(item, ["cleaning"]);
}

function repair(item: InventoryItem) {
  return countUnits(item, REPAIR_STATUSES);
}

function lost(item: InventoryItem) {
  return countUnits(item, LOST_STATUSES);
}

function needsAttention(item: InventoryItem) {
  if (isQuantityTracked(item)) {
    return (
      Number(item.quantity_available || 0) <= Number(item.reorder_point || 0)
    );
  }

  return cleaning(item) > 0 || repair(item) > 0 || lost(item) > 0;
}

function categoryName(item: InventoryItem) {
  return firstRelation(item.inventory_categories)?.name || "Uncategorized";
}

function primaryLocation(item: InventoryItem) {
  const counts = new Map<string, number>();

  for (const unit of units(item)) {
    const location = firstRelation(unit.warehouse_locations)?.name;
    if (!location) continue;
    counts.set(location, (counts.get(location) || 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) return "—";
  if (sorted.length === 1) return sorted[0][0];
  return `${sorted[0][0]} +${sorted.length - 1}`;
}

function pretty(value: string | null | undefined) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactNumber(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function AdminInventoryScreen() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadInventory = useCallback(async () => {
    setError("");

    const [categoriesResult, itemsResult] = await Promise.all([
      supabase
        .from("inventory_categories")
        .select("id, name, slug")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),

      supabase
        .from("inventory_items")
        .select(`
          id,
          name,
          sku,
          description,
          tracking_type,
          category_id,
          unit_label,
          quantity_on_hand,
          quantity_available,
          minimum_stock,
          reorder_point,
          active,
          sort_order,
          notes,
          inventory_categories (
            id,
            name,
            slug
          ),
          inventory_units (
            id,
            unit_code,
            status,
            warehouse_location_id,
            condition,
            last_cleaned_at,
            last_inspected_at,
            warehouse_locations (
              id,
              name,
              slug,
              location_type
            )
          )
        `)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (categoriesResult.error) {
      throw new Error(categoriesResult.error.message);
    }

    if (itemsResult.error) {
      throw new Error(itemsResult.error.message);
    }

    setCategories((categoriesResult.data || []) as InventoryCategory[]);
    setItems((itemsResult.data || []) as InventoryItem[]);
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadInventory()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load inventory.",
        );
      })
      .finally(() => setLoading(false));
  }, [loadInventory]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void loadInventory()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not refresh inventory.",
        );
      })
      .finally(() => setRefreshing(false));
  }, [loadInventory]);

  const allSerializedUnits = useMemo(
    () => items.flatMap((item) => units(item)),
    [items],
  );

  const stats = useMemo(() => {
    const availableUnits = allSerializedUnits.filter((unit) =>
      AVAILABLE_STATUSES.includes(String(unit.status || "").toLowerCase()),
    ).length;

    const outUnits = allSerializedUnits.filter((unit) =>
      OUT_STATUSES.includes(String(unit.status || "").toLowerCase()),
    ).length;

    const cleaningUnits = allSerializedUnits.filter(
      (unit) => String(unit.status || "").toLowerCase() === "cleaning",
    ).length;

    const repairUnits = allSerializedUnits.filter((unit) =>
      REPAIR_STATUSES.includes(String(unit.status || "").toLowerCase()),
    ).length;

    return {
      items: items.length,
      serializedUnits: allSerializedUnits.length,
      availableUnits,
      outUnits,
      notReady: cleaningUnits + repairUnits,
      attention: items.filter(needsAttention).length,
    };
  }, [allSerializedUnits, items]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return items.filter((item) => {
      if (category !== "all" && item.category_id !== category) {
        return false;
      }

      if (filter === "available" && available(item) <= 0) return false;
      if (filter === "out" && out(item) <= 0) return false;
      if (filter === "cleaning" && cleaning(item) <= 0) return false;
      if (filter === "repair" && repair(item) <= 0) return false;
      if (filter === "attention" && !needsAttention(item)) return false;

      if (!normalized) return true;

      const haystack = [
        item.name,
        item.sku,
        item.description,
        categoryName(item),
        primaryLocation(item),
        ...units(item).map((unit) => unit.unit_code),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [category, filter, items, query]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <Text style={styles.eyebrow}>BOUNCE PARTY LA</Text>

        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Inventory</Text>
            <Text style={styles.subtitle}>
              Warehouse availability and equipment condition
            </Text>
          </View>

          <Pressable
            onPress={() => {
              setQuery("");
              setCategory("all");
              setFilter("all");
            }}
            style={({ pressed }) => [
              styles.resetButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.resetButtonText}>RESET</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          <StatCard label="Items" value={stats.items} />
          <StatCard label="Units" value={stats.serializedUnits} />
          <StatCard label="Available" value={stats.availableUnits} success />
          <StatCard label="Out" value={stats.outUnits} />
          <StatCard label="Not ready" value={stats.notReady} />
          <StatCard
            label="Attention"
            value={stats.attention}
            danger={stats.attention > 0}
          />
        </ScrollView>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search item, SKU, unit or location"
          placeholderTextColor="#9c9184"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {([
            ["all", "All"],
            ["available", "Available"],
            ["out", "Out"],
            ["cleaning", "Cleaning"],
            ["repair", "Repair"],
            ["attention", `Attention ${stats.attention}`],
          ] as Array<[InventoryFilter, string]>).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={({ pressed }) => [
                styles.filterButton,
                filter === key ? styles.filterButtonActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === key ? styles.filterTextActive : null,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categories}
          >
            <Pressable
              onPress={() => setCategory("all")}
              style={({ pressed }) => [
                styles.categoryButton,
                category === "all" ? styles.categoryButtonActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  category === "all" ? styles.categoryTextActive : null,
                ]}
              >
                All categories
              </Text>
            </Pressable>

            {categories.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setCategory(item.id)}
                style={({ pressed }) => [
                  styles.categoryButton,
                  category === item.id ? styles.categoryButtonActive : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    category === item.id ? styles.categoryTextActive : null,
                  ]}
                >
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle}>Warehouse items</Text>
          <Text style={styles.resultCount}>{filteredItems.length}</Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color="#23313f" />
            <Text style={styles.stateText}>Loading inventory…</Text>
          </View>
        ) : error ? (
          <View style={[styles.stateCard, styles.errorCard]}>
            <Text style={styles.errorTitle}>Could not load inventory</Text>
            <Text style={styles.errorText}>{error}</Text>

            <Pressable
              onPress={() => {
                setLoading(true);
                void loadInventory().finally(() => setLoading(false));
              }}
              style={({ pressed }) => [
                styles.retryButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.retryText}>TRY AGAIN</Text>
            </Pressable>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.emptyTitle}>Nothing found</Text>
            <Text style={styles.stateText}>
              Try another search, category or inventory filter.
            </Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setSelectedItem(item)}
              style={({ pressed }) => [
                styles.itemCard,
                needsAttention(item) ? styles.itemCardAttention : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.itemHeader}>
                <View style={styles.itemHeaderText}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.sku || "No SKU"} · {categoryName(item)}
                  </Text>
                </View>

                {needsAttention(item) ? (
                  <View style={styles.attentionBadge}>
                    <Text style={styles.attentionBadgeText}>ATTENTION</Text>
                  </View>
                ) : (
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>
                      {pretty(item.tracking_type)}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.itemStats}>
                <MiniStat label="Available" value={available(item)} success />
                <MiniStat label="Total" value={total(item)} />
                {!isQuantityTracked(item) ? (
                  <>
                    <MiniStat label="Out" value={out(item)} />
                    <MiniStat
                      label="Service"
                      value={cleaning(item) + repair(item)}
                      danger={repair(item) > 0}
                    />
                  </>
                ) : (
                  <>
                    <MiniStat
                      label="Reorder"
                      value={Number(item.reorder_point || 0)}
                    />
                    <MiniStat
                      label="Min"
                      value={Number(item.minimum_stock || 0)}
                    />
                  </>
                )}
              </View>

              <View style={styles.itemFooter}>
                <Text style={styles.locationText} numberOfLines={1}>
                  {isQuantityTracked(item)
                    ? item.unit_label || "Quantity stock"
                    : primaryLocation(item)}
                </Text>
                <Text style={styles.openText}>DETAILS ›</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <InventoryDetails
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </View>
  );
}

function StatCard({
  label,
  value,
  danger = false,
  success = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <View
      style={[
        styles.statCard,
        danger ? styles.statCardDanger : null,
      ]}
    >
      <Text
        style={[
          styles.statValue,
          danger ? styles.statValueDanger : null,
          success ? styles.statValueSuccess : null,
        ]}
      >
        {compactNumber(value)}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniStat({
  label,
  value,
  danger = false,
  success = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <View style={styles.miniStat}>
      <Text
        style={[
          styles.miniValue,
          danger ? styles.miniValueDanger : null,
          success ? styles.miniValueSuccess : null,
        ]}
      >
        {compactNumber(value)}
      </Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

function InventoryDetails({
  item,
  onClose,
}: {
  item: InventoryItem | null;
  onClose: () => void;
}) {
  if (!item) return null;

  const serialized = !isQuantityTracked(item);
  const itemUnits = [...units(item)].sort((a, b) => {
    const aStatus = String(a.status || "");
    const bStatus = String(b.status || "");
    if (aStatus !== bStatus) return aStatus.localeCompare(bStatus);
    return String(a.unit_code || "").localeCompare(String(b.unit_code || ""));
  });

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalEyebrow}>{categoryName(item)}</Text>
                <Text style={styles.modalTitle}>{item.name}</Text>
                <Text style={styles.modalSku}>
                  {item.sku || "No SKU"} · {pretty(item.tracking_type)}
                </Text>
              </View>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.detailGrid}>
              <Detail label="Available">{compactNumber(available(item))}</Detail>
              <Detail label="Total">{compactNumber(total(item))}</Detail>
              {serialized ? (
                <>
                  <Detail label="Out">{compactNumber(out(item))}</Detail>
                  <Detail label="Cleaning">{compactNumber(cleaning(item))}</Detail>
                  <Detail label="Repair">{compactNumber(repair(item))}</Detail>
                  <Detail label="Lost / retired">{compactNumber(lost(item))}</Detail>
                </>
              ) : (
                <>
                  <Detail label="Reorder point">
                    {compactNumber(Number(item.reorder_point || 0))}
                  </Detail>
                  <Detail label="Minimum stock">
                    {compactNumber(Number(item.minimum_stock || 0))}
                  </Detail>
                </>
              )}
            </View>

            {item.description ? (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>DESCRIPTION</Text>
                <Text style={styles.sectionValue}>{item.description}</Text>
              </View>
            ) : null}

            {item.notes ? (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>INTERNAL NOTES</Text>
                <Text style={styles.sectionValue}>{item.notes}</Text>
              </View>
            ) : null}

            {serialized ? (
              <View style={styles.unitsSection}>
                <View style={styles.unitsHeader}>
                  <Text style={styles.unitsTitle}>Serialized units</Text>
                  <Text style={styles.unitsCount}>{itemUnits.length}</Text>
                </View>

                {itemUnits.length === 0 ? (
                  <View style={styles.noUnitsCard}>
                    <Text style={styles.stateText}>
                      No serialized units are attached to this item.
                    </Text>
                  </View>
                ) : (
                  itemUnits.map((unit) => {
                    const location =
                      firstRelation(unit.warehouse_locations)?.name || "—";
                    const status = String(unit.status || "").toLowerCase();

                    return (
                      <View key={unit.id} style={styles.unitCard}>
                        <View style={styles.unitTop}>
                          <View style={styles.unitTitleBlock}>
                            <Text style={styles.unitCode}>
                              {unit.unit_code || "Unit"}
                            </Text>
                            <Text style={styles.unitLocation}>{location}</Text>
                          </View>

                          <View
                            style={[
                              styles.unitStatus,
                              AVAILABLE_STATUSES.includes(status)
                                ? styles.unitStatusAvailable
                                : REPAIR_STATUSES.includes(status) ||
                                    LOST_STATUSES.includes(status)
                                  ? styles.unitStatusDanger
                                  : status === "cleaning"
                                    ? styles.unitStatusCleaning
                                    : styles.unitStatusOut,
                            ]}
                          >
                            <Text
                              style={[
                                styles.unitStatusText,
                                AVAILABLE_STATUSES.includes(status)
                                  ? styles.unitStatusTextAvailable
                                  : REPAIR_STATUSES.includes(status) ||
                                      LOST_STATUSES.includes(status)
                                    ? styles.unitStatusTextDanger
                                    : status === "cleaning"
                                      ? styles.unitStatusTextCleaning
                                      : styles.unitStatusTextOut,
                              ]}
                            >
                              {pretty(unit.status)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.unitMetaRow}>
                          <Text style={styles.unitMeta}>
                            Condition: {pretty(unit.condition)}
                          </Text>
                          <Text style={styles.unitMeta}>
                            Cleaned: {shortDate(unit.last_cleaned_at)}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            ) : (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>QUANTITY STOCK</Text>
                <Text style={styles.sectionValue}>
                  {compactNumber(Number(item.quantity_available || 0))} available
                  {" · "}
                  {compactNumber(Number(item.quantity_on_hand || 0))} on hand
                  {item.unit_label ? ` ${item.unit_label}` : ""}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{children}</Text>
    </View>
  );
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
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 6,
  },
  titleBlock: { flex: 1, paddingRight: 12 },
  title: { color: "#23313f", fontSize: 32, fontWeight: "900" },
  subtitle: { color: "#81766a", fontSize: 12, lineHeight: 17, marginTop: 3 },
  resetButton: {
    backgroundColor: "#23313f",
    borderRadius: 12,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  resetButtonText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  statsRow: { gap: 9, paddingVertical: 14 },
  statCard: {
    minWidth: 94,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  statCardDanger: { borderWidth: 1, borderColor: "#d9b6b2" },
  statValue: { color: "#23313f", fontSize: 22, fontWeight: "900" },
  statValueDanger: { color: "#8c2e2a" },
  statValueSuccess: { color: "#5f735c" },
  statLabel: {
    color: "#81766a",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderRadius: 17,
    color: "#23313f",
    fontSize: 14,
    minHeight: 50,
    paddingHorizontal: 15,
  },
  filters: { gap: 8, paddingTop: 12, paddingBottom: 10 },
  filterButton: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 38,
    justifyContent: "center",
  },
  filterButtonActive: { backgroundColor: "#23313f" },
  filterText: { color: "#81766a", fontSize: 11, fontWeight: "900" },
  filterTextActive: { color: "#ffffff" },
  categories: { gap: 7, paddingBottom: 15 },
  categoryButton: {
    borderWidth: 1,
    borderColor: "#d8cec0",
    borderRadius: 999,
    paddingHorizontal: 13,
    minHeight: 35,
    justifyContent: "center",
  },
  categoryButtonActive: {
    backgroundColor: "#f0c987",
    borderColor: "#f0c987",
  },
  categoryText: { color: "#6c6258", fontSize: 10, fontWeight: "800" },
  categoryTextActive: { color: "#23313f" },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
    paddingHorizontal: 2,
  },
  resultTitle: { color: "#23313f", fontSize: 17, fontWeight: "900" },
  resultCount: {
    backgroundColor: "#e9e2d8",
    color: "#6c6258",
    overflow: "hidden",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stateCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    alignItems: "center",
    padding: 28,
    marginTop: 8,
  },
  errorCard: { backgroundColor: "#fff1f0", alignItems: "flex-start" },
  stateText: {
    color: "#81766a",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 9,
  },
  emptyTitle: { color: "#23313f", fontSize: 17, fontWeight: "900" },
  errorTitle: { color: "#8c2e2a", fontSize: 16, fontWeight: "900" },
  errorText: {
    color: "#8c2e2a",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  retryButton: {
    backgroundColor: "#23313f",
    borderRadius: 12,
    minHeight: 40,
    justifyContent: "center",
    marginTop: 14,
    paddingHorizontal: 16,
  },
  retryText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },
  itemCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    marginBottom: 10,
    padding: 15,
  },
  itemCardAttention: { borderWidth: 1, borderColor: "#e4c1bd" },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  itemHeaderText: { flex: 1 },
  itemName: {
    color: "#23313f",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  itemMeta: { color: "#81766a", fontSize: 10, marginTop: 4 },
  attentionBadge: {
    backgroundColor: "#fff1f0",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  attentionBadgeText: { color: "#8c2e2a", fontSize: 8, fontWeight: "900" },
  typeBadge: {
    backgroundColor: "#f7ead0",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  typeBadgeText: { color: "#8a6437", fontSize: 8, fontWeight: "900" },
  itemStats: {
    flexDirection: "row",
    gap: 6,
    marginTop: 13,
  },
  miniStat: {
    flex: 1,
    backgroundColor: "#f8f5f0",
    borderRadius: 13,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  miniValue: { color: "#23313f", fontSize: 14, fontWeight: "900" },
  miniValueSuccess: { color: "#5f735c" },
  miniValueDanger: { color: "#8c2e2a" },
  miniLabel: { color: "#81766a", fontSize: 8, fontWeight: "800", marginTop: 2 },
  itemFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5ddd1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 11,
  },
  locationText: { color: "#6c6258", flex: 1, fontSize: 10, paddingRight: 12 },
  openText: { color: "#b88645", fontSize: 9, fontWeight: "900" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(35,49,63,0.28)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#f5f1e8",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "90%",
    minHeight: "62%",
    paddingTop: 8,
  },
  modalHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#cbbfaf",
    marginBottom: 3,
  },
  modalContent: {
    paddingHorizontal: 18,
    paddingBottom: 38,
    paddingTop: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  modalHeaderText: { flex: 1, paddingRight: 12 },
  modalEyebrow: {
    color: "#b88645",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  modalTitle: {
    color: "#23313f",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 4,
  },
  modalSku: {
    color: "#81766a",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: { color: "#23313f", fontSize: 25, lineHeight: 27 },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
  },
  detailCell: {
    width: "31.7%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 12,
  },
  detailLabel: {
    color: "#81766a",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#23313f",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4,
  },
  modalSection: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    marginTop: 10,
    padding: 15,
  },
  sectionLabel: {
    color: "#b88645",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionValue: {
    color: "#23313f",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  unitsSection: { marginTop: 18 },
  unitsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  unitsTitle: { color: "#23313f", fontSize: 17, fontWeight: "900" },
  unitsCount: {
    backgroundColor: "#23313f",
    color: "#ffffff",
    overflow: "hidden",
    borderRadius: 999,
    fontSize: 9,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  noUnitsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
  },
  unitCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    marginBottom: 8,
    padding: 13,
  },
  unitTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  unitTitleBlock: { flex: 1 },
  unitCode: { color: "#23313f", fontSize: 14, fontWeight: "900" },
  unitLocation: { color: "#81766a", fontSize: 10, marginTop: 3 },
  unitStatus: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  unitStatusAvailable: { backgroundColor: "#eaf1e6" },
  unitStatusOut: { backgroundColor: "#fff4d8" },
  unitStatusCleaning: { backgroundColor: "#eaf2f9" },
  unitStatusDanger: { backgroundColor: "#fff1f0" },
  unitStatusText: { fontSize: 8, fontWeight: "900" },
  unitStatusTextAvailable: { color: "#5f735c" },
  unitStatusTextOut: { color: "#8a6b20" },
  unitStatusTextCleaning: { color: "#355879" },
  unitStatusTextDanger: { color: "#8c2e2a" },
  unitMetaRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5ddd1",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
    paddingTop: 9,
  },
  unitMeta: { color: "#81766a", flex: 1, fontSize: 9 },
  pressed: { opacity: 0.7 },
});

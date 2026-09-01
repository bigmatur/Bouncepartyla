import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
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

type Customer = {
  id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type Booking = {
  id?: string | null;
  booking_number?: string | null;
  event_date?: string | null;
  setup_address?: string | null;
  setup_city?: string | null;
  setup_state?: string | null;
  setup_zip?: string | null;
  customers?: Customer | Customer[] | null;
};

type Handover = {
  id: string;
  booking_id?: string | null;
  status?: string | null;
  items_snapshot?: {
    products?: unknown[];
    components?: unknown[];
    options?: unknown[];
  } | null;
  booking_snapshot?: Record<string, unknown> | null;
  delivery_notes?: string | null;
  acknowledged?: boolean | null;
  signer_name?: string | null;
  signer_email?: string | null;
  signature_storage_path?: string | null;
  pdf_storage_path?: string | null;
  viewed_at?: string | null;
  signed_at?: string | null;
  voided_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  bookings?: Booking | Booking[] | null;
};

type Filter = "all" | "ready" | "viewed" | "signed" | "unsigned" | "void";

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function pretty(value: string | null | undefined) {
  return String(value || "draft")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function address(booking: Booking | null) {
  return [
    booking?.setup_address,
    booking?.setup_city,
    booking?.setup_state,
    booking?.setup_zip,
  ]
    .filter(Boolean)
    .join(", ");
}

function snapshotText(
  snapshot: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = snapshot?.[key];
  return typeof value === "string" ? value : "";
}

function productCount(row: Handover) {
  return Array.isArray(row.items_snapshot?.products)
    ? row.items_snapshot?.products.length || 0
    : 0;
}

function componentCount(row: Handover) {
  return Array.isArray(row.items_snapshot?.components)
    ? row.items_snapshot?.components.length || 0
    : 0;
}

function optionCount(row: Handover) {
  return Array.isArray(row.items_snapshot?.options)
    ? row.items_snapshot?.options.length || 0
    : 0;
}

function bookingNumber(row: Handover) {
  const booking = first(row.bookings);
  return (
    booking?.booking_number ||
    snapshotText(row.booking_snapshot, "booking_number") ||
    row.booking_id?.slice(0, 8) ||
    "—"
  );
}

function customerName(row: Handover) {
  const booking = first(row.bookings);
  const customer = first(booking?.customers);
  return (
    customer?.full_name ||
    snapshotText(row.booking_snapshot, "customer_name") ||
    row.signer_name ||
    "Customer"
  );
}

function customerPhone(row: Handover) {
  const booking = first(row.bookings);
  const customer = first(booking?.customers);
  return (
    customer?.phone ||
    snapshotText(row.booking_snapshot, "customer_phone") ||
    ""
  );
}

function customerEmail(row: Handover) {
  const booking = first(row.bookings);
  const customer = first(booking?.customers);
  return (
    customer?.email ||
    snapshotText(row.booking_snapshot, "customer_email") ||
    row.signer_email ||
    ""
  );
}

function eventDate(row: Handover) {
  const booking = first(row.bookings);
  return booking?.event_date || snapshotText(row.booking_snapshot, "event_date");
}

function statusTone(status: string | null | undefined) {
  const value = String(status || "").toLowerCase();

  if (value === "signed") return "success";
  if (value === "void") return "danger";
  if (value === "ready" || value === "viewed") return "gold";
  return "neutral";
}

export function AdminHandoversScreen({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Handover[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Handover | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");

    const result = await supabase
      .from("handover_documents")
      .select(`
        id,
        booking_id,
        status,
        items_snapshot,
        booking_snapshot,
        delivery_notes,
        acknowledged,
        signer_name,
        signer_email,
        signature_storage_path,
        pdf_storage_path,
        viewed_at,
        signed_at,
        voided_at,
        created_at,
        updated_at,
        bookings (
          id,
          booking_number,
          event_date,
          setup_address,
          setup_city,
          setup_state,
          setup_zip,
          customers (
            id,
            full_name,
            email,
            phone
          )
        )
      `)
      .order("created_at", { ascending: false })
      .limit(250);

    if (result.error) {
      throw new Error(result.error.message);
    }

    setRows((result.data || []) as unknown as Handover[]);
  }, []);

  useEffect(() => {
    void load().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load handovers.",
      );
    });
  }, [load]);

  const stats = useMemo(() => {
    const signed = rows.filter((row) => row.status === "signed").length;
    const ready = rows.filter((row) => row.status === "ready").length;
    const viewed = rows.filter((row) => row.status === "viewed").length;
    const unsigned = rows.filter(
      (row) => row.status !== "signed" && row.status !== "void",
    ).length;

    return {
      total: rows.length,
      signed,
      ready,
      viewed,
      unsigned,
    };
  }, [rows]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (filter === "signed" && row.status !== "signed") return false;
      if (filter === "ready" && row.status !== "ready") return false;
      if (filter === "viewed" && row.status !== "viewed") return false;
      if (filter === "void" && row.status !== "void") return false;
      if (
        filter === "unsigned" &&
        (row.status === "signed" || row.status === "void")
      ) {
        return false;
      }

      if (!normalized) return true;

      const booking = first(row.bookings);
      const searchable = [
        row.id,
        row.status,
        row.signer_name,
        row.signer_email,
        bookingNumber(row),
        customerName(row),
        customerPhone(row),
        customerEmail(row),
        booking?.setup_address,
        booking?.setup_city,
        snapshotText(row.booking_snapshot, "setup_address"),
        snapshotText(row.booking_snapshot, "setup_city"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalized);
    });
  }, [filter, query, rows]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load()
                .catch((loadError) => {
                  setError(
                    loadError instanceof Error
                      ? loadError.message
                      : "Could not refresh handovers.",
                  );
                })
                .finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ BACK</Text>
        </Pressable>

        <Text style={styles.eyebrow}>DELIVERY DOCUMENTS</Text>
        <Text style={styles.title}>Handovers</Text>
        <Text style={styles.subtitle}>
          Delivery packing slips and customer signatures
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          <Stat label="All" value={stats.total} />
          <Stat label="Ready" value={stats.ready} />
          <Stat label="Viewed" value={stats.viewed} />
          <Stat label="Unsigned" value={stats.unsigned} danger={stats.unsigned > 0} />
          <Stat label="Signed" value={stats.signed} success />
        </ScrollView>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search customer, booking or signer"
          placeholderTextColor="#9c9184"
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {(["all", "ready", "viewed", "unsigned", "signed", "void"] as Filter[]).map(
            (item) => (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={[
                  styles.filter,
                  filter === item ? styles.filterActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === item ? styles.filterTextActive : null,
                  ]}
                >
                  {pretty(item)}
                </Text>
              </Pressable>
            ),
          )}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle}>Documents</Text>
          <Text style={styles.resultCount}>{visible.length}</Text>
        </View>

        {visible.length === 0 && !error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No handovers</Text>
            <Text style={styles.emptyText}>
              No documents match the current filter.
            </Text>
          </View>
        ) : (
          visible.map((row) => {
            const tone = statusTone(row.status);
            const signed = row.status === "signed";

            return (
              <Pressable
                key={row.id}
                onPress={() => setSelected(row)}
                style={({ pressed }) => [
                  styles.card,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardText}>
                    <Text style={styles.customer} numberOfLines={1}>
                      {customerName(row)}
                    </Text>
                    <Text style={styles.booking}>
                      #{bookingNumber(row)} · {shortDate(eventDate(row))}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      tone === "success"
                        ? styles.statusSuccess
                        : tone === "danger"
                          ? styles.statusDanger
                          : tone === "gold"
                            ? styles.statusGold
                            : styles.statusNeutral,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        tone === "success"
                          ? styles.statusTextSuccess
                          : tone === "danger"
                            ? styles.statusTextDanger
                            : tone === "gold"
                              ? styles.statusTextGold
                              : styles.statusTextNeutral,
                      ]}
                    >
                      {pretty(row.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryRow}>
                  <Summary label="Products" value={productCount(row)} />
                  <Summary label="Components" value={componentCount(row)} />
                  <Summary label="Options" value={optionCount(row)} />
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.footerText}>
                    {signed
                      ? `Signed ${dateTime(row.signed_at)}`
                      : row.viewed_at
                        ? `Viewed ${dateTime(row.viewed_at)}`
                        : `Created ${dateTime(row.created_at)}`}
                  </Text>
                  <Text style={styles.detailsText}>DETAILS ›</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <HandoverDetails row={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function HandoverDetails({
  row,
  onClose,
}: {
  row: Handover | null;
  onClose: () => void;
}) {
  if (!row) return null;

  const booking = first(row.bookings);
  const customer = first(booking?.customers);
  const fullAddress =
    address(booking) ||
    [
      snapshotText(row.booking_snapshot, "setup_address"),
      snapshotText(row.booking_snapshot, "setup_city"),
      snapshotText(row.booking_snapshot, "setup_state"),
      snapshotText(row.booking_snapshot, "setup_zip"),
    ]
      .filter(Boolean)
      .join(", ");

  const phone = customerPhone(row);
  const email = customerEmail(row);

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <ScrollView
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalEyebrow}>HANDOVER</Text>
                <Text style={styles.modalTitle}>{customerName(row)}</Text>
                <Text style={styles.modalBooking}>
                  #{bookingNumber(row)} · {shortDate(eventDate(row))}
                </Text>
              </View>

              <Pressable onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.detailGrid}>
              <Detail label="Status">{pretty(row.status)}</Detail>
              <Detail label="Acknowledged">
                {row.acknowledged ? "Yes" : "No"}
              </Detail>
              <Detail label="Products">{String(productCount(row))}</Detail>
              <Detail label="Components">{String(componentCount(row))}</Detail>
              <Detail label="Options">{String(optionCount(row))}</Detail>
              <Detail label="Signed">
                {row.signed_at ? shortDate(row.signed_at) : "—"}
              </Detail>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>DELIVERY ADDRESS</Text>
              <Text style={styles.sectionValue}>
                {fullAddress || "Address not available"}
              </Text>

              {fullAddress ? (
                <Pressable
                  onPress={() =>
                    void Linking.openURL(
                      `http://maps.apple.com/?q=${encodeURIComponent(fullAddress)}`,
                    )
                  }
                  style={styles.primaryAction}
                >
                  <Text style={styles.primaryActionText}>OPEN IN MAPS</Text>
                </Pressable>
              ) : null}
            </View>

            {row.delivery_notes ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>DELIVERY NOTES</Text>
                <Text style={styles.sectionValue}>{row.delivery_notes}</Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>CUSTOMER</Text>
              <Text style={styles.sectionValue}>{customerName(row)}</Text>
              {phone ? <Text style={styles.secondaryValue}>{phone}</Text> : null}
              {email ? <Text style={styles.secondaryValue}>{email}</Text> : null}

              <View style={styles.actionRow}>
                {phone ? (
                  <Pressable
                    onPress={() => void Linking.openURL(`tel:${phone}`)}
                    style={styles.secondaryAction}
                  >
                    <Text style={styles.secondaryActionText}>CALL</Text>
                  </Pressable>
                ) : null}

                {email ? (
                  <Pressable
                    onPress={() => void Linking.openURL(`mailto:${email}`)}
                    style={styles.secondaryAction}
                  >
                    <Text style={styles.secondaryActionText}>EMAIL</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SIGNATURE</Text>
              <Text style={styles.sectionValue}>
                {row.status === "signed"
                  ? row.signer_name || customerName(row)
                  : "Not signed yet"}
              </Text>
              {row.signer_email ? (
                <Text style={styles.secondaryValue}>{row.signer_email}</Text>
              ) : null}
              <Text style={styles.secondaryValue}>
                {row.status === "signed"
                  ? `Signed ${dateTime(row.signed_at)}`
                  : row.viewed_at
                    ? `Viewed ${dateTime(row.viewed_at)}`
                    : `Created ${dateTime(row.created_at)}`}
              </Text>
            </View>

            <View style={styles.readOnlyNotice}>
              <Text style={styles.readOnlyTitle}>Admin view</Text>
              <Text style={styles.readOnlyText}>
                Signing remains in the existing Driver handover flow. Mobile
                Admin is read-only here to avoid duplicating signature logic.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Stat({
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
    <View style={styles.stat}>
      <Text
        style={[
          styles.statValue,
          danger ? styles.statValueDanger : null,
          success ? styles.statValueSuccess : null,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
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
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingRight: 12,
  },
  backText: {
    color: "#b88645",
    fontSize: 10,
    fontWeight: "900",
  },
  eyebrow: {
    color: "#b88645",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 4,
  },
  title: {
    color: "#23313f",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 5,
  },
  subtitle: {
    color: "#81766a",
    fontSize: 12,
    marginTop: 3,
  },
  statsRow: {
    gap: 8,
    paddingTop: 16,
    paddingBottom: 12,
  },
  stat: {
    minWidth: 92,
    backgroundColor: "#ffffff",
    borderRadius: 17,
    padding: 13,
  },
  statValue: {
    color: "#23313f",
    fontSize: 20,
    fontWeight: "900",
  },
  statValueDanger: { color: "#8c2e2a" },
  statValueSuccess: { color: "#5f735c" },
  statLabel: {
    color: "#81766a",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },
  search: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    color: "#23313f",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  filters: {
    gap: 8,
    paddingVertical: 12,
  },
  filter: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    minHeight: 37,
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  filterActive: {
    backgroundColor: "#23313f",
  },
  filterText: {
    color: "#81766a",
    fontSize: 10,
    fontWeight: "900",
  },
  filterTextActive: { color: "#ffffff" },
  error: {
    color: "#8c2e2a",
    backgroundColor: "#fff1f0",
    borderRadius: 16,
    padding: 12,
    marginBottom: 9,
    fontSize: 11,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  resultTitle: {
    color: "#23313f",
    fontSize: 16,
    fontWeight: "900",
  },
  resultCount: {
    color: "#6c6258",
    backgroundColor: "#e9e2d8",
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 9,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    alignItems: "center",
    padding: 28,
  },
  emptyTitle: {
    color: "#23313f",
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: "#81766a",
    fontSize: 11,
    marginTop: 4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 19,
    marginBottom: 9,
    padding: 14,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  cardText: { flex: 1 },
  customer: {
    color: "#23313f",
    fontSize: 14,
    fontWeight: "900",
  },
  booking: {
    color: "#81766a",
    fontSize: 10,
    marginTop: 3,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  statusSuccess: { backgroundColor: "#eaf1e6" },
  statusDanger: { backgroundColor: "#fff1f0" },
  statusGold: { backgroundColor: "#f7ead0" },
  statusNeutral: { backgroundColor: "#eee7dc" },
  statusText: {
    fontSize: 8,
    fontWeight: "900",
  },
  statusTextSuccess: { color: "#5f735c" },
  statusTextDanger: { color: "#8c2e2a" },
  statusTextGold: { color: "#8a6437" },
  statusTextNeutral: { color: "#6c6258" },
  summaryRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },
  summary: {
    flex: 1,
    backgroundColor: "#f8f5f0",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  summaryValue: {
    color: "#23313f",
    fontSize: 13,
    fontWeight: "900",
  },
  summaryLabel: {
    color: "#81766a",
    fontSize: 8,
    marginTop: 2,
  },
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5ddd1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 11,
    paddingTop: 10,
  },
  footerText: {
    color: "#81766a",
    fontSize: 9,
    flex: 1,
  },
  detailsText: {
    color: "#b88645",
    fontSize: 8,
    fontWeight: "900",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(35,49,63,0.28)",
  },
  modalSheet: {
    backgroundColor: "#f5f1e8",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "90%",
    minHeight: "65%",
    paddingTop: 8,
  },
  modalHandle: {
    alignSelf: "center",
    backgroundColor: "#cbbfaf",
    borderRadius: 999,
    width: 42,
    height: 5,
    marginBottom: 3,
  },
  modalContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 38,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  modalHeaderText: {
    flex: 1,
    paddingRight: 12,
  },
  modalEyebrow: {
    color: "#b88645",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  modalTitle: {
    color: "#23313f",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 4,
  },
  modalBooking: {
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
  closeText: {
    color: "#23313f",
    fontSize: 25,
    lineHeight: 27,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
  },
  detailCell: {
    width: "31.7%",
    backgroundColor: "#ffffff",
    borderRadius: 15,
    padding: 11,
  },
  detailLabel: {
    color: "#81766a",
    fontSize: 7,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4,
  },
  section: {
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
  secondaryValue: {
    color: "#81766a",
    fontSize: 10,
    marginTop: 4,
  },
  primaryAction: {
    backgroundColor: "#23313f",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: 12,
  },
  primaryActionText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 11,
  },
  secondaryAction: {
    backgroundColor: "#f7ead0",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryActionText: {
    color: "#8a6437",
    fontSize: 8,
    fontWeight: "900",
  },
  readOnlyNotice: {
    backgroundColor: "#eee7dc",
    borderRadius: 17,
    marginTop: 10,
    padding: 14,
  },
  readOnlyTitle: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "900",
  },
  readOnlyText: {
    color: "#81766a",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  pressed: { opacity: 0.7 },
});

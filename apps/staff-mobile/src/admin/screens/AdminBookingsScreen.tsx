import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import {
  addBookingPaymentFromMobile,
  cancelBookingFromMobile,
  loadBookingPaymentSettingsFromMobile,
  type MobileBookingPaymentSettings,
} from "../../lib/mobileApi";

type BookingCustomer = {
  id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type BookingProduct = {
  id?: string | null;
  name?: string | null;
  image_url?: string | null;
};

type BookingItem = {
  id?: string | null;
  quantity?: number | null;
  unit_price?: number | string | null;
  subtotal?: number | string | null;
  products?: BookingProduct | BookingProduct[] | null;
};

type MobileAdminBooking = {
  id: string;
  booking_number?: string | null;
  status?: string | null;
  event_date?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  setup_address?: string | null;
  setup_city?: string | null;
  setup_state?: string | null;
  setup_zip?: string | null;
  internal_notes?: string | null;
  subtotal?: number | string | null;
  delivery_fee?: number | string | null;
  tax_rate?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  deposit_amount?: number | string | null;
  amount_paid?: number | string | null;
  balance_due?: number | string | null;
  discount_amount?: number | string | null;
  payment_status?: string | null;
  archived_at?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  customers?: BookingCustomer | BookingCustomer[] | null;
  booking_items?: BookingItem[] | null;
};

type MobilePayment = {
  id: string;
  amount?: number | string | null;
  method?: string | null;
  status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

type BookingFilter = "active" | "today" | "upcoming" | "archived" | "all";

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function localDateISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Date not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date not set";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--";

  const [hourRaw, minuteRaw] = value.split(":");
  const hours = Number(hourRaw);
  const minutes = Number(minuteRaw || 0);

  if (!Number.isFinite(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function money(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "$0.00";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function titleCase(value: string | null | undefined) {
  return String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function bookingLabel(booking: MobileAdminBooking) {
  return `#${booking.booking_number || booking.id.slice(0, 8)}`;
}

function addressText(booking: MobileAdminBooking) {
  return [
    booking.setup_address,
    booking.setup_city,
    booking.setup_state,
    booking.setup_zip,
  ]
    .filter(Boolean)
    .join(", ");
}

function productSummary(booking: MobileAdminBooking) {
  const items = booking.booking_items || [];

  if (items.length === 0) return "No products";

  return items
    .slice(0, 2)
    .map((item) => {
      const product = firstRelation(item.products);
      const quantity = Math.max(1, Number(item.quantity || 1));
      const quantityLabel = quantity > 1 ? ` × ${quantity}` : "";
      return `${product?.name || "Product"}${quantityLabel}`;
    })
    .join(" · ");
}

function firstProductImage(booking: MobileAdminBooking) {
  for (const item of booking.booking_items || []) {
    const product = firstRelation(item.products);
    if (product?.image_url) return product.image_url;
  }

  return null;
}

function isInactiveStatus(value: string | null | undefined) {
  return ["cancelled", "refunded", "closed"].includes(
    String(value || "").toLowerCase(),
  );
}

export function AdminBookingsScreen() {
  const today = useMemo(localDateISO, []);
  const [bookings, setBookings] = useState<MobileAdminBooking[]>([]);
  const [selectedBooking, setSelectedBooking] =
    useState<MobileAdminBooking | null>(null);
  const [filter, setFilter] = useState<BookingFilter>("active");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadBookings = useCallback(async () => {
    setError("");

    const result = await supabase
      .from("bookings")
      .select(`
        id,
        booking_number,
        status,
        event_date,
        event_start_time,
        event_end_time,
        setup_address,
        setup_city,
        setup_state,
        setup_zip,
        internal_notes,
        subtotal,
        delivery_fee,
        tax_rate,
        tax_amount,
        total_amount,
        deposit_amount,
        amount_paid,
        balance_due,
        discount_amount,
        payment_status,
        archived_at,
        customers (
          id,
          full_name,
          phone,
          email
        ),
        booking_items (
          id,
          quantity,
          unit_price,
          subtotal,
          products (
            id,
            name,
            image_url
          )
        )
      `)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250);

    if (result.error) {
      throw new Error(result.error.message);
    }

    setBookings((result.data || []) as MobileAdminBooking[]);
  }, []);

  useEffect(() => {
    void loadBookings()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load bookings.",
        );
      })
      .finally(() => setLoading(false));
  }, [loadBookings]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void loadBookings()
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not refresh bookings.",
        );
      })
      .finally(() => setRefreshing(false));
  }, [loadBookings]);

  const filteredBookings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return bookings.filter((booking) => {
      const archived = Boolean(booking.archived_at);
      const inactive = isInactiveStatus(booking.status);
      const date = String(booking.event_date || "");

      if (filter === "active" && (archived || inactive)) return false;
      if (filter === "today" && date !== today) return false;
      if (filter === "upcoming" && (date < today || archived || inactive)) {
        return false;
      }
      if (filter === "archived" && !archived) return false;

      if (!normalizedQuery) return true;

      const customer = firstRelation(booking.customers);
      const searchable = [
        booking.booking_number,
        booking.status,
        booking.setup_address,
        booking.setup_city,
        booking.setup_zip,
        customer?.full_name,
        customer?.phone,
        customer?.email,
        productSummary(booking),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [bookings, filter, query, today]);

  const totalBalance = useMemo(
    () =>
      filteredBookings.reduce(
        (sum, booking) => sum + Number(booking.balance_due || 0),
        0,
      ),
    [filteredBookings],
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#23313f"
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>BOOKING OPERATIONS</Text>
            <Text style={styles.title}>Bookings</Text>
            <Text style={styles.subtitle}>
              Search and open booking details.
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countBadgeValue}>{filteredBookings.length}</Text>
            <Text style={styles.countBadgeLabel}>shown</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryLabel}>BALANCE DUE</Text>
            <Text style={styles.summaryValue}>{money(totalBalance)}</Text>
          </View>
          <Text style={styles.summaryMeta}>{bookings.length} loaded</Text>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Customer, booking, phone, address..."
            placeholderTextColor="#9a8d7e"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {query ? (
            <Pressable
              onPress={() => setQuery("")}
              style={({ pressed }) => [
                styles.clearButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.clearButtonText}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          <FilterChip
            label="Active"
            selected={filter === "active"}
            onPress={() => setFilter("active")}
          />
          <FilterChip
            label="Today"
            selected={filter === "today"}
            onPress={() => setFilter("today")}
          />
          <FilterChip
            label="Upcoming"
            selected={filter === "upcoming"}
            onPress={() => setFilter("upcoming")}
          />
          <FilterChip
            label="Archived"
            selected={filter === "archived"}
            onPress={() => setFilter("archived")}
          />
          <FilterChip
            label="All"
            selected={filter === "all"}
            onPress={() => setFilter("all")}
          />
        </ScrollView>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#23313f" />
            <Text style={styles.loadingText}>Loading bookings…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Could not load bookings</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={refresh}
              style={({ pressed }) => [
                styles.retryButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : filteredBookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No bookings found</Text>
            <Text style={styles.emptyText}>
              Try another search or filter.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredBookings.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                onPress={() => setSelectedBooking(booking)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <BookingDetailsModal
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onBookingChanged={(nextBooking) => {
          setSelectedBooking(nextBooking);
          setBookings((current) =>
            current.map((item) =>
              item.id === nextBooking.id ? nextBooking : item,
            ),
          );
        }}
      />
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        selected ? styles.filterChipSelected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text
        style={[
          styles.filterChipText,
          selected ? styles.filterChipTextSelected : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function BookingRow({
  booking,
  onPress,
}: {
  booking: MobileAdminBooking;
  onPress: () => void;
}) {
  const customer = firstRelation(booking.customers);
  const imageUrl = firstProductImage(booking);
  const balanceDue = Number(booking.balance_due || 0);
  const status = String(booking.status || "").toLowerCase();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.bookingRow,
        pressed ? styles.pressed : null,
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.thumbnailPlaceholder}>
          <Text style={styles.thumbnailPlaceholderText}>BP</Text>
        </View>
      )}

      <View style={styles.bookingCopy}>
        <View style={styles.bookingTopRow}>
          <Text style={styles.bookingNumber}>{bookingLabel(booking)}</Text>
          <StatusBadge status={status} />
        </View>

        <Text style={styles.productTitle} numberOfLines={1}>
          {productSummary(booking)}
        </Text>

        <Text style={styles.customerText} numberOfLines={1}>
          {customer?.full_name || "Customer"}
        </Text>

        <Text style={styles.addressText} numberOfLines={1}>
          {addressText(booking) || "Address not available"}
        </Text>

        <View style={styles.bookingFooter}>
          <View>
            <Text style={styles.eventDate}>{formatDate(booking.event_date)}</Text>
            <Text style={styles.eventTime}>
              {formatTime(booking.event_start_time)} – {formatTime(booking.event_end_time)}
            </Text>
          </View>

          <View style={styles.balanceCopy}>
            <Text style={styles.totalText}>{money(booking.total_amount)}</Text>
            {balanceDue > 0 ? (
              <Text style={styles.balanceText}>Balance {money(balanceDue)}</Text>
            ) : (
              <Text style={styles.paidText}>Paid</Text>
            )}
          </View>
        </View>
      </View>

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: string }) {
  const positive = [
    "booked",
    "scheduled",
    "inventory_reserved",
    "installed",
    "pickup_scheduled",
  ].includes(status);

  const destructive = ["cancelled", "refunded"].includes(status);

  return (
    <View
      style={[
        styles.statusBadge,
        positive ? styles.statusBadgePositive : null,
        destructive ? styles.statusBadgeDestructive : null,
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          positive ? styles.statusBadgeTextPositive : null,
          destructive ? styles.statusBadgeTextDestructive : null,
        ]}
        numberOfLines={1}
      >
        {titleCase(status)}
      </Text>
    </View>
  );
}

function BookingDetailsModal({
  booking,
  onClose,
  onBookingChanged,
}: {
  booking: MobileAdminBooking | null;
  onClose: () => void;
  onBookingChanged: (booking: MobileAdminBooking) => void;
}) {
  const [savingArchive, setSavingArchive] = useState(false);
  const [savingCancel, setSavingCancel] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [payments, setPayments] = useState<MobilePayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");
  const [paymentEditorOpen, setPaymentEditorOpen] = useState(false);
  const [paymentSettings, setPaymentSettings] =
    useState<MobileBookingPaymentSettings | null>(null);
  const [paymentSettingsLoading, setPaymentSettingsLoading] = useState(false);
  const [paymentSettingsError, setPaymentSettingsError] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    let active = true;
    const bookingId = booking?.id;

    if (!bookingId) {
      setPayments([]);
      setPaymentsError("");
      setPaymentsLoading(false);

      return () => {
        active = false;
      };
    }

    const loadPayments = async () => {
      setPaymentsLoading(true);
      setPaymentsError("");

      const result = await supabase
        .from("payments")
        .select("id, amount, method, status, paid_at, created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false });

      if (!active) return;

      if (result.error) {
        setPayments([]);
        setPaymentsError(result.error.message);
      } else {
        setPayments((result.data || []) as MobilePayment[]);
      }

      setPaymentsLoading(false);
    };

    void loadPayments();

    return () => {
      active = false;
    };
  }, [booking?.id]);

  useEffect(() => {
    setPaymentEditorOpen(false);
    setPaymentSettings(null);
    setPaymentSettingsError("");
    setPaymentAmount("");
    setPaymentMethod("");
    setPaymentNote("");
    setSavingPayment(false);
  }, [booking?.id]);

  if (!booking) return null;

  const customer = firstRelation(booking.customers);
  const balanceDue = Number(booking.balance_due || 0);
  const totalPaid = payments.reduce((sum, payment) => {
    if (String(payment.status || "") !== "paid") return sum;
    return sum + Number(payment.amount || 0);
  }, 0);

  const openPaymentEditor = async () => {
    if (savingPayment) return;

    setPaymentEditorOpen(true);
    setPaymentAmount(balanceDue.toFixed(2));
    setPaymentNote("");
    setPaymentSettingsError("");

    if (paymentSettings) {
      if (!paymentMethod && paymentSettings.paymentMethods[0]?.method) {
        setPaymentMethod(paymentSettings.paymentMethods[0].method);
      }
      return;
    }

    setPaymentSettingsLoading(true);
    const result = await loadBookingPaymentSettingsFromMobile();
    setPaymentSettingsLoading(false);

    if (!result.success || !result.data) {
      setPaymentSettingsError(
        result.error || "Could not load payment settings.",
      );
      return;
    }

    setPaymentSettings(result.data);

    if (result.data.paymentMethods[0]?.method) {
      setPaymentMethod(result.data.paymentMethods[0].method);
    }
  };

  const submitPayment = async () => {
    if (savingPayment) return;

    const normalizedAmount = Number(
      String(paymentAmount || "").replace(",", "."),
    );

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      Alert.alert(
        "Invalid amount",
        "Payment amount must be greater than 0.",
      );
      return;
    }

    if (!paymentMethod) {
      Alert.alert(
        "Payment method required",
        "Choose a payment method.",
      );
      return;
    }

    setSavingPayment(true);

    const result = await addBookingPaymentFromMobile({
      bookingId: booking.id,
      amount: normalizedAmount,
      baseAmount: normalizedAmount,
      tipAmount: 0,
      method: paymentMethod,
      note: paymentNote,
      discountAmount: Number(booking.discount_amount || 0),
    });

    setSavingPayment(false);

    if (!result.success || !result.data) {
      Alert.alert(
        "Payment not added",
        result.error || "Could not add payment.",
      );
      return;
    }

    if (result.data.stripeCheckoutUrl) {
      const url = result.data.stripeCheckoutUrl;

      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          "Stripe checkout",
          "Could not open the Stripe checkout page.",
        );
      }

      setPaymentEditorOpen(false);
      return;
    }

    const nextBooking: MobileAdminBooking = {
      ...booking,
      balance_due: result.data.balanceDue,
      discount_amount: result.data.discountAmount,
      tax_amount: result.data.taxAmount,
      total_amount: result.data.totalAmount,
    };

    onBookingChanged(nextBooking);

    if (result.data.paymentId) {
      setPayments((current) => [
        {
          id: result.data!.paymentId!,
          amount: result.data!.amount,
          method: result.data!.method,
          status: "paid",
          paid_at: result.data!.paidAt,
          created_at: result.data!.paidAt,
        },
        ...current.filter(
          (payment) => payment.id !== result.data!.paymentId,
        ),
      ]);
    }

    setPaymentEditorOpen(false);
    setPaymentAmount("");
    setPaymentNote("");

    Alert.alert(
      "Payment added",
      `${money(result.data.amount)} was recorded. Remaining balance: ${money(result.data.balanceDue)}.`,
    );
  };

  const callCustomer = async () => {
    const phone = String(customer?.phone || "")
      .replace(/[^0-9+]/g, "")
      .trim();
    if (!phone) return;

    const url = `tel:${phone}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  const emailCustomer = async () => {
    const email = String(customer?.email || "").trim();
    if (!email) return;

    const url = `mailto:${email}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  const openMaps = async () => {
    const address = addressText(booking);
    if (!address) return;

    const url = `http://maps.apple.com/?q=${encodeURIComponent(address)}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  const setArchived = async (archived: boolean) => {
    if (savingArchive) return;

    if (!archived && !booking.archived_at) return;
    if (archived && booking.archived_at) return;

    if (
      archived &&
      String(booking.status || "").toLowerCase() === "cancelled"
    ) {
      Alert.alert(
        "Cannot archive",
        "Cancelled bookings must be handled through the existing cancellation workflow.",
      );
      return;
    }

    setSavingArchive(true);

    const now = new Date().toISOString();
    const payload = archived
      ? {
          archived_at: now,
          archive_reason: "Archived from mobile Admin",
          updated_at: now,
        }
      : {
          archived_at: null,
          archive_reason: null,
          updated_at: now,
        };

    const result = await supabase
      .from("bookings")
      .update(payload)
      .eq("id", booking.id);

    if (result.error) {
      setSavingArchive(false);
      Alert.alert(
        archived ? "Booking not archived" : "Booking not restored",
        result.error.message,
      );
      return;
    }

    const nextBooking: MobileAdminBooking = {
      ...booking,
      archived_at: archived ? now : null,
    };

    onBookingChanged(nextBooking);
    setSavingArchive(false);

    Alert.alert(
      archived ? "Booking archived" : "Booking restored",
      archived
        ? "The booking was moved to Archive."
        : "The booking was restored to the active booking list.",
    );
  };

  const confirmArchiveChange = () => {
    if (booking.archived_at) {
      Alert.alert(
        "Restore booking?",
        `${bookingLabel(booking)} will return to the active booking list.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            onPress: () => void setArchived(false),
          },
        ],
      );
      return;
    }

    Alert.alert(
      "Archive booking?",
      "Archiving does not cancel the booking and does not change inventory or route stops.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => void setArchived(true),
        },
      ],
    );
  };

  const cancelBooking = async () => {
    if (savingCancel) return;

    setSavingCancel(true);

    const result = await cancelBookingFromMobile(
      booking.id,
      cancellationReason,
    );

    if (!result.success || !result.data) {
      setSavingCancel(false);
      Alert.alert(
        "Booking not cancelled",
        result.error || "Could not cancel booking.",
      );
      return;
    }

    const now = new Date().toISOString();
    const nextBooking: MobileAdminBooking = {
      ...booking,
      status: "cancelled",
      archived_at: null,
      cancellation_reason: cancellationReason || null,
      cancelled_at: now,
    };

    onBookingChanged(nextBooking);
    setSavingCancel(false);

    Alert.alert(
      result.data.alreadyCancelled
        ? "Already cancelled"
        : "Booking cancelled",
      result.data.alreadyCancelled
        ? "This booking was already cancelled."
        : "Inventory reservations were released and active route stops were cancelled.",
    );
  };

  const confirmCancel = () => {
    const status = String(booking.status || "").toLowerCase();

    if (status === "cancelled") {
      Alert.alert("Booking cancelled", "This booking is already cancelled.");
      return;
    }

    if (status === "closed") {
      Alert.alert(
        "Cannot cancel",
        "Closed booking must be reopened in Admin before it can be cancelled.",
      );
      return;
    }

    Alert.alert(
      "Cancel booking?",
      "This releases inventory reservations and cancels active delivery/pickup route stops. This is not the same as Archive.",
      [
        { text: "Keep booking", style: "cancel" },
        {
          text: "Cancel booking",
          style: "destructive",
          onPress: () => void cancelBooking(),
        },
      ],
    );
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalDismissArea} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text style={styles.sheetEyebrow}>BOOKING DETAILS</Text>
              <Text style={styles.sheetTitle}>{customer?.full_name || "Customer"}</Text>
              <Text style={styles.sheetSubtitle}>{bookingLabel(booking)}</Text>
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.detailHero}>
              <View style={styles.detailHeroTop}>
                <StatusBadge status={String(booking.status || "").toLowerCase()} />
                <Text style={styles.detailHeroTotal}>{money(booking.total_amount)}</Text>
              </View>
              <Text style={styles.detailDate}>{formatDate(booking.event_date)}</Text>
              <Text style={styles.detailTime}>
                {formatTime(booking.event_start_time)} – {formatTime(booking.event_end_time)}
              </Text>
              <Text style={styles.detailAddress}>
                {addressText(booking) || "Address not available"}
              </Text>
            </View>

            <Text style={styles.detailSectionTitle}>Customer</Text>
            <View style={styles.detailCard}>
              <DetailRow label="Name" value={customer?.full_name || "—"} />
              <View style={styles.detailDivider} />
              <DetailRow label="Phone" value={customer?.phone || "—"} />
              <View style={styles.detailDivider} />
              <DetailRow label="Email" value={customer?.email || "—"} />
            </View>

            <View style={styles.contactButtons}>
              <Pressable
                disabled={!addressText(booking)}
                onPress={() => void openMaps()}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  !addressText(booking) ? styles.disabledButton : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Maps</Text>
              </Pressable>

              <Pressable
                disabled={!customer?.phone}
                onPress={() => void callCustomer()}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  !customer?.phone ? styles.disabledButton : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Call</Text>
              </Pressable>

              <Pressable
                disabled={!customer?.email}
                onPress={() => void emailCustomer()}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  !customer?.email ? styles.disabledButton : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Email</Text>
              </Pressable>
            </View>

            <Text style={styles.detailSectionTitle}>Products</Text>
            <View style={styles.detailCard}>
              {(booking.booking_items || []).length > 0 ? (
                (booking.booking_items || []).map((item, index) => {
                  const product = firstRelation(item.products);
                  return (
                    <View key={item.id || `${product?.id || "item"}-${index}`}>
                      {index > 0 ? <View style={styles.detailDivider} /> : null}
                      <View style={styles.productDetailRow}>
                        <View style={styles.productDetailCopy}>
                          <Text style={styles.productDetailName}>
                            {product?.name || "Product"}
                          </Text>
                          <Text style={styles.productDetailMeta}>
                            Qty {Math.max(1, Number(item.quantity || 1))}
                          </Text>
                        </View>
                        <Text style={styles.productDetailPrice}>
                          {money(item.subtotal || item.unit_price || 0)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.emptyProducts}>No products recorded.</Text>
              )}
            </View>

            <Text style={styles.detailSectionTitle}>Payment</Text>
            <View style={styles.detailCard}>
              <DetailRow label="Subtotal" value={money(booking.subtotal)} />
              <View style={styles.detailDivider} />
              <DetailRow label="Discount" value={`-${money(booking.discount_amount)}`} />
              <View style={styles.detailDivider} />
              <DetailRow label="Delivery" value={money(booking.delivery_fee)} />
              <View style={styles.detailDivider} />
              <DetailRow label="Tax" value={money(booking.tax_amount)} />
              <View style={styles.detailDivider} />
              <DetailRow label="Total" value={money(booking.total_amount)} strong />
              <View style={styles.detailDivider} />
              <DetailRow
                label="Balance due"
                value={money(balanceDue)}
                strong
                danger={balanceDue > 0}
              />
              <View style={styles.detailDivider} />
              <DetailRow
                label="Paid"
                value={paymentsLoading ? "Loading..." : money(totalPaid)}
                strong
              />

              {balanceDue > 0 ? (
                <>
                  <View style={styles.detailDivider} />

                  <Pressable
                    disabled={savingPayment}
                    onPress={() => void openPaymentEditor()}
                    style={({ pressed }) => [
                      styles.mobilePaymentPrimaryButton,
                      savingPayment ? styles.disabledButton : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    {savingPayment ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.mobilePaymentPrimaryButtonText}>
                        PAY REMAINING BALANCE
                      </Text>
                    )}
                  </Pressable>

                  {paymentEditorOpen ? (
                    <View style={styles.mobilePaymentEditor}>
                      <Text style={styles.mobilePaymentEditorTitle}>
                        Add payment
                      </Text>
                      <Text style={styles.mobilePaymentHint}>
                        Balance due {money(balanceDue)}
                      </Text>

                      <View style={styles.mobilePaymentField}>
                        <Text style={styles.mobilePaymentLabel}>AMOUNT</Text>
                        <TextInput
                          value={paymentAmount}
                          onChangeText={setPaymentAmount}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor="#9c9184"
                          style={styles.mobilePaymentInput}
                        />
                      </View>

                      <View style={styles.mobilePaymentField}>
                        <Text style={styles.mobilePaymentLabel}>
                          PAYMENT METHOD
                        </Text>

                        {paymentSettingsLoading ? (
                          <ActivityIndicator size="small" color="#23313f" />
                        ) : paymentSettingsError ? (
                          <View style={styles.mobilePaymentErrorBox}>
                            <Text style={styles.mobilePaymentErrorText}>
                              {paymentSettingsError}
                            </Text>
                            <Pressable
                              onPress={() => {
                                setPaymentSettings(null);
                                void openPaymentEditor();
                              }}
                              style={({ pressed }) => [
                                styles.mobilePaymentRetryButton,
                                pressed ? styles.pressed : null,
                              ]}
                            >
                              <Text style={styles.mobilePaymentRetryButtonText}>
                                RETRY
                              </Text>
                            </Pressable>
                          </View>
                        ) : (
                          <View style={styles.mobilePaymentMethodWrap}>
                            {(paymentSettings?.paymentMethods || []).map(
                              (method) => {
                                const selected =
                                  paymentMethod === method.method;

                                return (
                                  <Pressable
                                    key={method.method}
                                    onPress={() =>
                                      setPaymentMethod(method.method)
                                    }
                                    style={({ pressed }) => [
                                      styles.mobilePaymentMethodChip,
                                      selected
                                        ? styles.mobilePaymentMethodChipSelected
                                        : null,
                                      pressed ? styles.pressed : null,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.mobilePaymentMethodChipText,
                                        selected
                                          ? styles.mobilePaymentMethodChipTextSelected
                                          : null,
                                      ]}
                                    >
                                      {method.displayName}
                                    </Text>
                                  </Pressable>
                                );
                              },
                            )}
                          </View>
                        )}
                      </View>

                      <View style={styles.mobilePaymentField}>
                        <Text style={styles.mobilePaymentLabel}>NOTE</Text>
                        <TextInput
                          value={paymentNote}
                          onChangeText={setPaymentNote}
                          placeholder="Optional payment note"
                          placeholderTextColor="#9c9184"
                          style={styles.mobilePaymentInput}
                        />
                      </View>

                      <View style={styles.mobilePaymentActions}>
                        <Pressable
                          disabled={savingPayment}
                          onPress={() => setPaymentEditorOpen(false)}
                          style={({ pressed }) => [
                            styles.mobilePaymentSecondaryButton,
                            pressed ? styles.pressed : null,
                          ]}
                        >
                          <Text style={styles.mobilePaymentSecondaryButtonText}>
                            CANCEL
                          </Text>
                        </Pressable>

                        <Pressable
                          disabled={
                            savingPayment ||
                            paymentSettingsLoading ||
                            Boolean(paymentSettingsError) ||
                            !paymentMethod
                          }
                          onPress={() => void submitPayment()}
                          style={({ pressed }) => [
                            styles.mobilePaymentSaveButton,
                            savingPayment ||
                            paymentSettingsLoading ||
                            Boolean(paymentSettingsError) ||
                            !paymentMethod
                              ? styles.disabledButton
                              : null,
                            pressed ? styles.pressed : null,
                          ]}
                        >
                          {savingPayment ? (
                            <ActivityIndicator
                              size="small"
                              color="#ffffff"
                            />
                          ) : (
                            <Text style={styles.mobilePaymentSaveButtonText}>
                              {paymentMethod === "stripe"
                                ? "OPEN STRIPE"
                                : "RECORD PAYMENT"}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}

              {paymentsError ? (
                <>
                  <View style={styles.detailDivider} />
                  <Text style={styles.notesText}>Payment history unavailable: {paymentsError}</Text>
                </>
              ) : null}

              {!paymentsLoading && !paymentsError && payments.length === 0 ? (
                <>
                  <View style={styles.detailDivider} />
                  <Text style={styles.notesText}>No payment records yet.</Text>
                </>
              ) : null}

              {!paymentsLoading && !paymentsError && payments.length > 0 ? (
                <>
                  <View style={styles.detailDivider} />
                  <Text style={styles.detailSectionTitle}>Payment history</Text>
                  {payments.map((payment) => (
                    <View key={payment.id}>
                      <View style={styles.detailDivider} />
                      <DetailRow
                        label={`${titleCase(payment.method)} · ${titleCase(payment.status)}\n${formatDateTime(payment.paid_at || payment.created_at)}`}
                        value={money(payment.amount)}
                      />
                    </View>
                  ))}
                </>
              ) : null}
            </View>

            <Text style={styles.detailSectionTitle}>Booking actions</Text>
            <View style={styles.actionCard}>
              <Text style={styles.actionCardTitle}>
                {booking.archived_at ? "Archived booking" : "Archive"}
              </Text>
              <Text style={styles.actionCardText}>
                {booking.archived_at
                  ? "Restore this booking to the active booking list."
                  : "Archive only hides the booking from active lists. It does not cancel the event, release inventory or change route stops."}
              </Text>

              <Pressable
                disabled={savingArchive}
                onPress={confirmArchiveChange}
                style={({ pressed }) => [
                  booking.archived_at
                    ? styles.restoreButton
                    : styles.archiveButton,
                  savingArchive ? styles.disabledButton : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                {savingArchive ? (
                  <ActivityIndicator
                    size="small"
                    color={booking.archived_at ? "#23313f" : "#ffffff"}
                  />
                ) : (
                  <Text
                    style={
                      booking.archived_at
                        ? styles.restoreButtonText
                        : styles.archiveButtonText
                    }
                  >
                    {booking.archived_at
                      ? "RESTORE FROM ARCHIVE"
                      : "ARCHIVE BOOKING"}
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.cancelCard}>
              <Text style={styles.cancelCardTitle}>Cancel booking</Text>
              <Text style={styles.cancelCardText}>
                Cancellation releases reserved inventory and cancels active
                delivery/pickup stops. Use Archive only when you want to hide a
                booking without changing operations.
              </Text>

              {String(booking.status || "").toLowerCase() === "cancelled" ? (
                <View style={styles.cancelledNotice}>
                  <Text style={styles.cancelledNoticeTitle}>CANCELLED</Text>
                  {booking.cancellation_reason ? (
                    <Text style={styles.cancelledNoticeText}>
                      {booking.cancellation_reason}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <>
                  <TextInput
                    value={cancellationReason}
                    onChangeText={setCancellationReason}
                    placeholder="Cancellation reason (optional)"
                    placeholderTextColor="#9c9184"
                    style={styles.cancelInput}
                    multiline
                    maxLength={500}
                  />

                  <Pressable
                    disabled={savingCancel}
                    onPress={confirmCancel}
                    style={({ pressed }) => [
                      styles.cancelButton,
                      savingCancel ? styles.disabledButton : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    {savingCancel ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.cancelButtonText}>
                        CANCEL BOOKING
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>

            {booking.internal_notes ? (
              <>
                <Text style={styles.detailSectionTitle}>Internal notes</Text>
                <View style={styles.notesCard}>
                  <Text style={styles.notesText}>{booking.internal_notes}</Text>
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  strong = false,
  danger = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailRowLabel, strong ? styles.detailRowStrong : null]}>
        {label}
      </Text>
      <Text
        style={[
          styles.detailRowValue,
          strong ? styles.detailRowStrong : null,
          danger ? styles.detailRowDanger : null,
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: { paddingHorizontal: 18, paddingTop: 62, paddingBottom: 120 },
  headerRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#b88645", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: "#23313f", fontSize: 31, fontWeight: "900", marginTop: 5 },
  subtitle: { color: "#81766a", fontSize: 12, lineHeight: 17, marginTop: 4 },
  countBadge: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 16, minWidth: 62, paddingHorizontal: 10, paddingVertical: 9 },
  countBadgeValue: { color: "#23313f", fontSize: 17, fontWeight: "900" },
  countBadgeLabel: { color: "#9a8d7e", fontSize: 8, fontWeight: "800", marginTop: 1, textTransform: "uppercase" },
  summaryCard: { alignItems: "center", backgroundColor: "#23313f", borderRadius: 20, flexDirection: "row", justifyContent: "space-between", marginTop: 20, padding: 16 },
  summaryLabel: { color: "#f0c987", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  summaryValue: { color: "#ffffff", fontSize: 22, fontWeight: "900", marginTop: 3 },
  summaryMeta: { color: "rgba(255,255,255,0.62)", fontSize: 10, fontWeight: "800" },
  searchBox: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e0d8cc", borderRadius: 16, borderWidth: 1, flexDirection: "row", marginTop: 14, minHeight: 50, paddingHorizontal: 13 },
  searchIcon: { color: "#81766a", fontSize: 20, marginRight: 8 },
  searchInput: { color: "#23313f", flex: 1, fontSize: 13, minHeight: 48, paddingVertical: 0 },
  clearButton: { alignItems: "center", backgroundColor: "#eee8df", borderRadius: 999, height: 28, justifyContent: "center", marginLeft: 8, width: 28 },
  clearButtonText: { color: "#6c6258", fontSize: 20, fontWeight: "700", lineHeight: 22 },
  filters: { gap: 8, paddingRight: 18, paddingTop: 12 },
  filterChip: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#ddd4c8", borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 38, paddingHorizontal: 16 },
  filterChipSelected: { backgroundColor: "#23313f", borderColor: "#23313f" },
  filterChipText: { color: "#6c6258", fontSize: 11, fontWeight: "900" },
  filterChipTextSelected: { color: "#ffffff" },
  list: { marginTop: 14 },
  bookingRow: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#e4ddd2", borderRadius: 19, borderWidth: 1, flexDirection: "row", marginBottom: 10, minHeight: 118, padding: 11 },
  thumbnail: { backgroundColor: "#ebe5dc", borderRadius: 13, height: 62, width: 62 },
  thumbnailPlaceholder: { alignItems: "center", backgroundColor: "#23313f", borderRadius: 13, height: 62, justifyContent: "center", width: 62 },
  thumbnailPlaceholderText: { color: "#f0c987", fontSize: 15, fontWeight: "900" },
  bookingCopy: { flex: 1, marginLeft: 11, minWidth: 0 },
  bookingTopRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  bookingNumber: { color: "#23313f", fontSize: 11, fontWeight: "900" },
  statusBadge: { backgroundColor: "#eee8df", borderRadius: 999, flexShrink: 1, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgePositive: { backgroundColor: "#e1f3e8" },
  statusBadgeDestructive: { backgroundColor: "#fde7e5" },
  statusBadgeText: { color: "#81766a", fontSize: 7, fontWeight: "900" },
  statusBadgeTextPositive: { color: "#35745a" },
  statusBadgeTextDestructive: { color: "#9d3f39" },
  productTitle: { color: "#23313f", fontSize: 13, fontWeight: "900", marginTop: 5 },
  customerText: { color: "#6c6258", fontSize: 10, fontWeight: "700", marginTop: 2 },
  addressText: { color: "#9a8d7e", fontSize: 9, marginTop: 2 },
  bookingFooter: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginTop: 7 },
  eventDate: { color: "#23313f", fontSize: 9, fontWeight: "900" },
  eventTime: { color: "#81766a", fontSize: 8, fontWeight: "700", marginTop: 1 },
  balanceCopy: { alignItems: "flex-end", marginLeft: 8 },
  totalText: { color: "#23313f", fontSize: 10, fontWeight: "900" },
  balanceText: { color: "#c64d42", fontSize: 8, fontWeight: "900", marginTop: 1 },
  paidText: { color: "#5f735c", fontSize: 8, fontWeight: "900", marginTop: 1 },
  chevron: { color: "#b88645", fontSize: 24, fontWeight: "700", marginLeft: 5 },
  loadingCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, justifyContent: "center", marginTop: 16, minHeight: 150 },
  loadingText: { color: "#81766a", fontSize: 11, fontWeight: "700", marginTop: 8 },
  errorCard: { backgroundColor: "#fff1f0", borderRadius: 20, marginTop: 16, padding: 17 },
  errorTitle: { color: "#8c2e2a", fontSize: 16, fontWeight: "900" },
  errorText: { color: "#7a4844", fontSize: 12, lineHeight: 18, marginTop: 5 },
  retryButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#23313f", borderRadius: 13, justifyContent: "center", marginTop: 12, minHeight: 40, paddingHorizontal: 17 },
  retryText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  emptyCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, marginTop: 16, paddingHorizontal: 18, paddingVertical: 36 },
  emptyTitle: { color: "#23313f", fontSize: 17, fontWeight: "900" },
  emptyText: { color: "#81766a", fontSize: 11, marginTop: 4 },
  pressed: { opacity: 0.68 },
  modalBackdrop: { backgroundColor: "rgba(20,27,34,0.48)", flex: 1, justifyContent: "flex-end" },
  modalDismissArea: { flex: 1 },
  sheet: { backgroundColor: "#f5f1e8", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "90%", minHeight: "70%", overflow: "hidden" },
  sheetHandle: { alignSelf: "center", backgroundColor: "#c7bfb4", borderRadius: 999, height: 5, marginTop: 9, width: 42 },
  sheetHeader: { alignItems: "center", borderBottomColor: "#dfd8ce", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 14, paddingHorizontal: 18, paddingTop: 12 },
  sheetHeaderCopy: { flex: 1, minWidth: 0 },
  sheetEyebrow: { color: "#b88645", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  sheetTitle: { color: "#23313f", fontSize: 21, fontWeight: "900", marginTop: 3 },
  sheetSubtitle: { color: "#81766a", fontSize: 10, fontWeight: "800", marginTop: 2 },
  closeButton: { alignItems: "center", borderColor: "#d1c8bb", borderRadius: 12, borderWidth: 1, justifyContent: "center", marginLeft: 12, minHeight: 38, paddingHorizontal: 13 },
  closeButtonText: { color: "#23313f", fontSize: 11, fontWeight: "900" },
  sheetScroll: { flexGrow: 0 },
  sheetContent: { paddingBottom: 36, paddingHorizontal: 18, paddingTop: 14 },
  detailHero: { backgroundColor: "#23313f", borderRadius: 21, padding: 16 },
  detailHeroTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  detailHeroTotal: { color: "#ffffff", fontSize: 18, fontWeight: "900" },
  detailDate: { color: "#f0c987", fontSize: 16, fontWeight: "900", marginTop: 14 },
  detailTime: { color: "#ffffff", fontSize: 13, fontWeight: "800", marginTop: 3 },
  detailAddress: { color: "rgba(255,255,255,0.72)", fontSize: 11, lineHeight: 16, marginTop: 7 },
  detailSectionTitle: { color: "#23313f", fontSize: 16, fontWeight: "900", marginBottom: 8, marginTop: 20 },
  detailCard: { backgroundColor: "#ffffff", borderRadius: 18, paddingHorizontal: 14 },
  detailRow: { alignItems: "center", flexDirection: "row", gap: 16, justifyContent: "space-between", minHeight: 48 },
  detailRowLabel: { color: "#81766a", flex: 1, fontSize: 11, fontWeight: "700" },
  detailRowValue: { color: "#23313f", flex: 1.3, fontSize: 11, fontWeight: "800", textAlign: "right" },
  detailRowStrong: { fontWeight: "900" },
  detailRowDanger: { color: "#c64d42" },
  detailDivider: { backgroundColor: "#ece6dd", height: 1 },
  contactButtons: { flexDirection: "row", gap: 9, marginTop: 10 },
  secondaryButton: { alignItems: "center", backgroundColor: "#ffffff", borderColor: "#d1c8bb", borderRadius: 14, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 44 },
  secondaryButtonText: { color: "#23313f", fontSize: 12, fontWeight: "900" },
  disabledButton: { opacity: 0.4 },
  productDetailRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 58, paddingVertical: 7 },
  productDetailCopy: { flex: 1, minWidth: 0 },
  productDetailName: { color: "#23313f", fontSize: 12, fontWeight: "900" },
  productDetailMeta: { color: "#81766a", fontSize: 9, fontWeight: "700", marginTop: 2 },
  productDetailPrice: { color: "#23313f", fontSize: 11, fontWeight: "900", marginLeft: 12 },
  emptyProducts: { color: "#81766a", fontSize: 11, paddingVertical: 16, textAlign: "center" },
  actionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 14,
  },
  actionCardTitle: {
    color: "#23313f",
    fontSize: 13,
    fontWeight: "900",
  },
  actionCardText: {
    color: "#81766a",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  archiveButton: {
    alignItems: "center",
    backgroundColor: "#8c2e2a",
    borderRadius: 13,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 44,
  },
  archiveButtonText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  restoreButton: {
    alignItems: "center",
    borderColor: "#cbbfaf",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 44,
  },
  restoreButtonText: {
    color: "#23313f",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  cancelCard: {
    backgroundColor: "#fff1f0",
    borderColor: "#e4c1bd",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
  },
  cancelCardTitle: {
    color: "#8c2e2a",
    fontSize: 13,
    fontWeight: "900",
  },
  cancelCardText: {
    color: "#6c6258",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  cancelInput: {
    backgroundColor: "#ffffff",
    borderColor: "#e4c1bd",
    borderWidth: 1,
    borderRadius: 13,
    color: "#23313f",
    minHeight: 70,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  cancelButton: {
    alignItems: "center",
    backgroundColor: "#8c2e2a",
    borderRadius: 13,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 44,
  },
  cancelButtonText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  cancelledNotice: {
    backgroundColor: "#ffffff",
    borderRadius: 13,
    marginTop: 12,
    padding: 12,
  },
  cancelledNoticeTitle: {
    color: "#8c2e2a",
    fontSize: 9,
    fontWeight: "900",
  },
  cancelledNoticeText: {
    color: "#6c6258",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  notesCard: { backgroundColor: "#ffffff", borderRadius: 18, padding: 14 },
  notesText: { color: "#6c6258", fontSize: 11, lineHeight: 17 },
  mobilePaymentPrimaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#23313f",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 4,
  },
  mobilePaymentPrimaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  mobilePaymentEditor: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: "#f5f1e8",
    padding: 14,
    gap: 12,
  },
  mobilePaymentEditorTitle: {
    color: "#23313f",
    fontSize: 16,
    fontWeight: "800",
  },
  mobilePaymentHint: {
    color: "#6c6258",
    fontSize: 13,
    lineHeight: 18,
  },
  mobilePaymentField: {
    gap: 6,
  },
  mobilePaymentLabel: {
    color: "#81766a",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  mobilePaymentInput: {
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6dccf",
    paddingHorizontal: 12,
    color: "#23313f",
    fontSize: 14,
  },
  mobilePaymentMethodWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mobilePaymentMethodChip: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ddd2c4",
  },
  mobilePaymentMethodChipSelected: {
    backgroundColor: "#23313f",
    borderColor: "#23313f",
  },
  mobilePaymentMethodChipText: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "700",
  },
  mobilePaymentMethodChipTextSelected: {
    color: "#ffffff",
  },
  mobilePaymentActions: {
    flexDirection: "row",
    gap: 8,
  },
  mobilePaymentSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ddd2c4",
    alignItems: "center",
    justifyContent: "center",
  },
  mobilePaymentSecondaryButtonText: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "800",
  },
  mobilePaymentSaveButton: {
    flex: 1.4,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: "#b88645",
    alignItems: "center",
    justifyContent: "center",
  },
  mobilePaymentSaveButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  mobilePaymentErrorBox: {
    gap: 8,
  },
  mobilePaymentErrorText: {
    color: "#8c2e2a",
    fontSize: 12,
    lineHeight: 17,
  },
  mobilePaymentRetryButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ddd2c4",
  },
  mobilePaymentRetryButtonText: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "800",
  },

});

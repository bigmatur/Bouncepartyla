import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";

type CalendarView = "day" | "week" | "month";

type Booking = {
  id: string;
  booking_number?: string | null;
  status?: string | null;
  event_date?: string | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  total_amount?: number | string | null;
  setup_city?: string | null;
  customers?: { full_name?: string | null } | { full_name?: string | null }[] | null;
  booking_items?: Array<{
    products?: { name?: string | null } | { name?: string | null }[] | null;
  }> | null;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function shiftDate(value: string, days: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return localDateISO(date);
}

function shiftMonth(value: string, months: number) {
  const date = parseDate(value);
  date.setMonth(date.getMonth() + months);
  return localDateISO(date);
}

function startOfWeek(value: string) {
  return shiftDate(value, -parseDate(value).getDay());
}

function rangeFor(view: CalendarView, anchorDate: string) {
  if (view === "day") {
    return { start: anchorDate, end: anchorDate };
  }

  if (view === "week") {
    const start = startOfWeek(anchorDate);
    return { start, end: shiftDate(start, 6) };
  }

  const anchor = parseDate(anchorDate);
  const firstOfMonth = localDateISO(new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12));
  const start = startOfWeek(firstOfMonth);
  const lastOfMonth = localDateISO(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12));
  return { start, end: shiftDate(lastOfMonth, 6 - parseDate(lastOfMonth).getDay()) };
}

function datesBetween(start: string, end: string) {
  const dates: string[] = [];
  for (let value = start; value <= end; value = shiftDate(value, 1)) dates.push(value);
  return dates;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function time(value: string | null | undefined) {
  if (!value) return "—";
  const [h, m = "00"] = value.split(":");
  const hour = Number(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

function shortDate(value: string) {
  return parseDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function titleFor(view: CalendarView, anchorDate: string, range: { start: string; end: string }) {
  if (view === "day") return parseDate(anchorDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  if (view === "week") return `${shortDate(range.start)} – ${shortDate(range.end)}`;
  return parseDate(anchorDate).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function AdminCalendarScreen({ onBack, onOpenBooking }: { onBack: () => void; onOpenBooking?: (bookingId: string) => void }) {
  const today = localDateISO();
  const [view, setView] = useState<CalendarView>("month");
  const [anchorDate, setAnchorDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const range = useMemo(() => rangeFor(view, anchorDate), [anchorDate, view]);
  const visibleDates = useMemo(() => datesBetween(range.start, range.end), [range.end, range.start]);

  const load = useCallback(async () => {
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
        total_amount,
        setup_city,
        customers (full_name),
        booking_items (products (name))
      `)
      .gte("event_date", range.start)
      .lte("event_date", range.end)
      .order("event_date", { ascending: true })
      .order("event_start_time", { ascending: true });

    if (result.error) throw new Error(result.error.message);
    setBookings((result.data || []) as Booking[]);
  }, [range.end, range.start]);

  useEffect(() => {
    void load().catch((loadError) =>
      setError(loadError instanceof Error ? loadError.message : "Could not load calendar."),
    );
  }, [load]);

  const bookingsByDate = useMemo(() => {
    const grouped = new Map<string, Booking[]>();
    bookings.forEach((booking) => {
      if (!booking.event_date) return;
      grouped.set(booking.event_date, [...(grouped.get(booking.event_date) || []), booking]);
    });
    return grouped;
  }, [bookings]);

  const selectedBookings = bookingsByDate.get(selectedDate) || [];
  const selectedRevenue = selectedBookings.reduce((sum, booking) => sum + Number(booking.total_amount || 0), 0);

  function setCalendarView(nextView: CalendarView) {
    setView(nextView);
    setSelectedDate(anchorDate);
  }

  function navigate(direction: -1 | 1) {
    const next = view === "month"
      ? shiftMonth(anchorDate, direction)
      : shiftDate(anchorDate, direction * (view === "week" ? 7 : 1));
    setAnchorDate(next);
    setSelectedDate(next);
  }

  function chooseDate(value: string) {
    setSelectedDate(value);
    if (view === "day") setAnchorDate(value);
  }

  const currentMonth = parseDate(anchorDate).getMonth();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }} />}
    >
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>‹ BACK</Text>
      </Pressable>

      <Text style={styles.eyebrow}>BOOKING CALENDAR</Text>
      <Text style={styles.title}>Calendar</Text>

      <View style={styles.viewSwitch}>
        {(["day", "week", "month"] as CalendarView[]).map((option) => (
          <Pressable
            key={option}
            onPress={() => setCalendarView(option)}
            style={[styles.viewButton, view === option ? styles.viewButtonActive : null]}
          >
            <Text style={[styles.viewText, view === option ? styles.viewTextActive : null]}>
              {option.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.dateCard}>
        <Pressable onPress={() => navigate(-1)} style={styles.arrowButton}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <View style={styles.dateTextWrap}>
          <Text style={styles.dateText}>{titleFor(view, anchorDate, range)}</Text>
          <Text style={styles.dateSub}>{bookings.length} booking{bookings.length === 1 ? "" : "s"} in view</Text>
        </View>
        <Pressable onPress={() => navigate(1)} style={styles.arrowButton}>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => { setAnchorDate(today); setSelectedDate(today); }} style={styles.todayButton}>
        <Text style={styles.todayText}>TODAY</Text>
      </Pressable>

      <View style={view === "month" ? styles.monthGrid : styles.weekGrid}>
        {view === "month" ? DAY_LABELS.map((label) => <Text key={label} style={styles.weekday}>{label}</Text>) : null}
        {visibleDates.map((date) => {
          const count = (bookingsByDate.get(date) || []).length;
          const inMonth = view !== "month" || parseDate(date).getMonth() === currentMonth;
          return (
            <Pressable
              key={date}
              onPress={() => chooseDate(date)}
              style={[
                view === "month" ? styles.monthDay : styles.weekDay,
                date === selectedDate ? styles.daySelected : null,
                date === today ? styles.dayToday : null,
              ]}
            >
              <Text style={[styles.dayNumber, !inMonth ? styles.dayMuted : null, date === selectedDate ? styles.dayNumberSelected : null]}>
                {view === "month" ? parseDate(date).getDate() : `${DAY_LABELS[parseDate(date).getDay()]}\n${parseDate(date).getDate()}`}
              </Text>
              {count ? <Text style={[styles.dayCount, date === selectedDate ? styles.dayCountSelected : null]}>{count}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.agendaHeader}>
        <View>
          <Text style={styles.agendaTitle}>{selectedDate === today ? "Today’s schedule" : shortDate(selectedDate)}</Text>
          <Text style={styles.agendaSub}>{selectedBookings.length} booking{selectedBookings.length === 1 ? "" : "s"} · ${selectedRevenue.toFixed(0)} total</Text>
        </View>
      </View>

      {selectedBookings.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No bookings</Text>
          <Text style={styles.emptyText}>Nothing is scheduled for this day.</Text>
        </View>
      ) : selectedBookings.map((booking) => {
        const customer = first(booking.customers)?.full_name || "Customer";
        const products = (booking.booking_items || []).map((item) => first(item.products)?.name).filter(Boolean).join(", ");
        return (
          <Pressable key={booking.id} onPress={() => onOpenBooking?.(booking.id)} style={styles.card}>
            <View style={styles.timeColumn}>
              <Text style={styles.startTime}>{time(booking.event_start_time)}</Text>
              <Text style={styles.endTime}>{time(booking.event_end_time)}</Text>
            </View>
            <View style={styles.bookingBody}>
              <Text style={styles.customer}>{customer}</Text>
              <Text style={styles.bookingNumber}>#{booking.booking_number || booking.id.slice(0, 8)}</Text>
              <Text style={styles.product} numberOfLines={2}>{products || "No products"}</Text>
              <Text style={styles.city}>{booking.setup_city || "City not set"} · {String(booking.status || "").replace(/_/g, " ")}</Text>
            </View>
            <Text style={styles.openChevron}>›</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f1e8" },
  content: { paddingTop: 54, paddingHorizontal: 18, paddingBottom: 120 },
  backButton: { alignSelf: "flex-start", paddingVertical: 7, paddingRight: 12 },
  backText: { color: "#b88645", fontSize: 10, fontWeight: "900" },
  eyebrow: { color: "#b88645", fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: 4 },
  title: { color: "#23313f", fontSize: 30, fontWeight: "900", marginTop: 5 },
  viewSwitch: { backgroundColor: "#eee7dc", borderRadius: 16, flexDirection: "row", marginTop: 17, padding: 4 },
  viewButton: { alignItems: "center", borderRadius: 12, flex: 1, paddingVertical: 10 },
  viewButtonActive: { backgroundColor: "#23313f" },
  viewText: { color: "#81766a", fontSize: 9, fontWeight: "900" },
  viewTextActive: { color: "#ffffff" },
  dateCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, flexDirection: "row", marginTop: 12, minHeight: 72 },
  arrowButton: { alignItems: "center", height: 52, justifyContent: "center", width: 52 },
  arrow: { color: "#23313f", fontSize: 34 },
  dateTextWrap: { alignItems: "center", flex: 1 },
  dateText: { color: "#23313f", fontSize: 15, fontWeight: "900", textAlign: "center" },
  dateSub: { color: "#81766a", fontSize: 10, marginTop: 3 },
  todayButton: { alignSelf: "center", backgroundColor: "#23313f", borderRadius: 999, marginVertical: 11, paddingHorizontal: 16, paddingVertical: 9 },
  todayText: { color: "#ffffff", fontSize: 9, fontWeight: "900" },
  weekGrid: { flexDirection: "row", gap: 5, marginBottom: 15 },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 15 },
  weekday: { color: "#81766a", fontSize: 9, fontWeight: "900", paddingBottom: 6, textAlign: "center", width: "14.2857%" },
  weekDay: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 13, flex: 1, minHeight: 58, paddingTop: 8 },
  monthDay: { alignItems: "center", borderRadius: 12, minHeight: 47, paddingTop: 6, width: "14.2857%" },
  daySelected: { backgroundColor: "#23313f" },
  dayToday: { borderColor: "#d6a24a", borderWidth: 1 },
  dayNumber: { color: "#23313f", fontSize: 11, fontWeight: "900", textAlign: "center" },
  dayMuted: { color: "#b9afa2" },
  dayNumberSelected: { color: "#ffffff" },
  dayCount: { color: "#b88645", fontSize: 9, fontWeight: "900", marginTop: 4 },
  dayCountSelected: { color: "#f0c987" },
  error: { backgroundColor: "#fff1f0", borderRadius: 16, color: "#8c2e2a", fontSize: 11, marginBottom: 9, padding: 12 },
  agendaHeader: { marginBottom: 9, marginTop: 4 },
  agendaTitle: { color: "#23313f", fontSize: 17, fontWeight: "900" },
  agendaSub: { color: "#81766a", fontSize: 10, marginTop: 3 },
  emptyCard: { alignItems: "center", backgroundColor: "#ffffff", borderRadius: 20, padding: 28 },
  emptyTitle: { color: "#23313f", fontSize: 16, fontWeight: "900" },
  emptyText: { color: "#81766a", fontSize: 11, marginTop: 4 },
  card: { backgroundColor: "#ffffff", borderRadius: 19, flexDirection: "row", marginBottom: 9, padding: 14 },
  timeColumn: { paddingRight: 10, width: 74 },
  startTime: { color: "#23313f", fontSize: 12, fontWeight: "900" },
  endTime: { color: "#81766a", fontSize: 9, marginTop: 3 },
  bookingBody: { borderLeftColor: "#e5ddd1", borderLeftWidth: StyleSheet.hairlineWidth, flex: 1, paddingLeft: 12 },
  customer: { color: "#23313f", fontSize: 14, fontWeight: "900" },
  bookingNumber: { color: "#b88645", fontSize: 9, fontWeight: "900", marginTop: 2 },
  product: { color: "#6c6258", fontSize: 10, lineHeight: 15, marginTop: 5 },
  city: { color: "#81766a", fontSize: 9, marginTop: 6, textTransform: "capitalize" },
  openChevron: { alignSelf: "center", color: "#b88645", fontSize: 26, marginLeft: 8 },
});

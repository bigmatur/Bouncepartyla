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
import * as ImagePicker from "expo-image-picker";



import {
  isCompletedStop,
  loadDriverRoute,
  loadMobileChecklistForBooking,
  loadMyDriverRouteCalendar,
  localDateISO,
  type MobileChecklistItem,
  type MobileDriverRouteDateSummary,
  type MobileRouteStop,
  type TodayDriverRoute,
} from "../features/routes/driverRoutes";



import {
  finishMyDriverShift,
  markMyRouteStopPaymentCollected,
  nextRouteAction,
  resumeMyStaffWork,
  saveMyRouteStopNotes,
  startMyStaffBreak,
  toggleMyChecklistItem,
  updateMyRouteStopStatus,
  uploadMyRouteStopProofPhoto,
  type MobilePaymentMethod,
} from "../features/routes/routeActions";

import { supabase } from "../lib/supabase";
import { HandoverModal } from "./HandoverModal";
import { RouteCalendarModal } from "./RouteCalendarModal";


function formatRouteDate(value: string) {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTime(value: string | null) {
  if (!value) {
    return "--";
  }

  const parts = value.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1] || 0);

  if (!Number.isFinite(hours)) {
    return value;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;

  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function stopLabel(stop: MobileRouteStop) {
  const type = String(
    stop.stop_type || "",
  ).toLowerCase();

  if (type === "pickup") {
    return "Pickup";
  }

  if (type === "break") {
    return "Break";
  }

  return "Delivery";
}

function isBreakStop(stop: MobileRouteStop) {
  return (
    String(
      stop.stop_type || "",
    ).toLowerCase() === "break"
  );
}

function addressText(stop: MobileRouteStop) {
  return [stop.address, stop.city, stop.state, stop.zip]
    .filter(Boolean)
    .join(", ");
}

function privateDriverNote(stop: MobileRouteStop) {
  const type = String(
    stop.stop_type || "",
  ).toLowerCase();

  if (type === "pickup") {
    return (
      String(
        stop.pickup_notes ||
          stop.setup_notes ||
          "",
      ).trim() || null
    );
  }

  return (
    String(
      stop.setup_notes ||
        stop.pickup_notes ||
        "",
    ).trim() || null
  );
}

type StaffTimeBreak = {
  id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  break_type?: string | null;
};

type StaffTimeDashboard = {
  current?: {
    id?: string | null;
    clock_in_at?: string | null;
    clock_out_at?: string | null;
    source?: string | null;
    status?: string | null;
    staff_time_breaks?: StaffTimeBreak[] | null;
  } | null;

  stale_open?: {
    id?: string | null;
    clock_in_at?: string | null;
    needs_review?: boolean | null;
  } | null;
};

function moneyText(value: number | string | null) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "$0.00";
  }

  return `$${amount.toFixed(2)}`;
}

function hasOpenShift(dashboard: StaffTimeDashboard | null) {
  return Boolean(
    dashboard?.current?.id &&
      !dashboard.current.clock_out_at,
  );
}

function currentOpenBreak(
  dashboard: StaffTimeDashboard | null,
) {
  const breaks =
    dashboard?.current?.staff_time_breaks || [];

  return (
    [...breaks]
      .reverse()
      .find(
        (item) =>
          item?.started_at &&
          !item?.ended_at,
      ) || null
  );
}

function durationMinutes(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  nowMs: number,
) {
  if (!startedAt) {
    return 0;
  }

  const start = new Date(startedAt).getTime();

  const end = endedAt
    ? new Date(endedAt).getTime()
    : nowMs;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor((end - start) / 60000),
  );
}

function formatDuration(totalMinutes: number) {
  const minutes = Math.max(
    0,
    Math.floor(totalMinutes),
  );

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours <= 0) {
    return `${remainder}m`;
  }

  return `${hours}h ${remainder}m`;
}

function paidShiftMinutes(
  dashboard: StaffTimeDashboard | null,
  nowMs: number,
) {
  const current = dashboard?.current;

  if (
    !current?.clock_in_at ||
    current.clock_out_at
  ) {
    return 0;
  }

  const gross = durationMinutes(
    current.clock_in_at,
    current.clock_out_at,
    nowMs,
  );

  const breakMinutes = (
    current.staff_time_breaks || []
  ).reduce(
    (sum, item) =>
      sum +
      durationMinutes(
        item.started_at,
        item.ended_at,
        nowMs,
      ),
    0,
  );

  return Math.max(0, gross - breakMinutes);
}

type HomeScreenProps = {
  onImmersiveChange?: (active: boolean) => void;
};

export function HomeScreen({
  onImmersiveChange,
}: HomeScreenProps = {}) {
  const today = localDateISO();

  const [selectedDate, setSelectedDate] =
    useState(today);

 const [
  routeCalendar,
  setRouteCalendar,
] = useState<
  MobileDriverRouteDateSummary[]
>([]);

const [
  routeCalendarOpen,
  setRouteCalendarOpen,
] = useState(false);

  const [selectedStopId, setSelectedStopId] =
    useState<string | null>(null);

  const [route, setRoute] =
    useState<TodayDriverRoute | null>(null);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [actionPending, setActionPending] =
    useState(false);

  const [navigationStop, setNavigationStop] =
    useState<MobileRouteStop | null>(null);

  const [error, setError] = useState("");

  const [
    shiftDashboard,
    setShiftDashboard,
  ] =
    useState<StaffTimeDashboard | null>(
      null,
    );

  const [shiftPending, setShiftPending] =
    useState(false);

  const [nowMs, setNowMs] = useState(() =>
    Date.now(),
  );

  const [
    stopToolPending,
    setStopToolPending,
  ] = useState<
    "photo" | "payment" | "notes" | null
  >(null);

  const [
    driverNotesDraft,
    setDriverNotesDraft,
  ] = useState("");

  const [
    checklistItems,
    setChecklistItems,
  ] = useState<MobileChecklistItem[]>([]);

  const [
    checklistLoading,
    setChecklistLoading,
  ] = useState(false);

  const [
    checklistPendingId,
    setChecklistPendingId,
  ] = useState<string | null>(null);
    
  const [
    checklistOpen,
    setChecklistOpen,
  ] = useState(false);

  const [handoverOpen, setHandoverOpen] =
    useState(false);

  const loadRoute = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
    ) => {
      if (mode === "refresh") {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        setRoute(
          await loadDriverRoute(selectedDate),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load today's route.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedDate],
  );

  const loadRouteCalendar =
  useCallback(async () => {
    try {
      setRouteCalendar(
        await loadMyDriverRouteCalendar(),
      );
    } catch (calendarError) {
      console.warn(
        "[Route] Could not load driver route calendar:",
        calendarError,
      );
    }
  }, []);

  const loadShiftDashboard =
    useCallback(async () => {
      const result = await supabase.rpc(
        "get_my_staff_time_dashboard",
        {
          p_limit: 1,
        },
      );

      if (result.error) {
        throw new Error(
          result.error.message,
        );
      }

      setShiftDashboard(
        (result.data ||
          null) as StaffTimeDashboard | null,
      );
    }, []);

  useEffect(() => {
  void loadRoute();
  void loadRouteCalendar();

  void loadShiftDashboard().catch(
    (shiftError) => {
      console.warn(
        "[StaffTime] Could not load shift dashboard:",
        shiftError,
      );
    },
  );
}, [
  loadRoute,
  loadRouteCalendar,
  loadShiftDashboard,
]);

  useEffect(() => {
    setSelectedStopId(null);
  }, [selectedDate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    onImmersiveChange?.(
      Boolean(navigationStop),
    );

    return () => {
      onImmersiveChange?.(false);
    };
  }, [
    navigationStop,
    onImmersiveChange,
  ]);

  const deliveryPointStops = useMemo(
    () =>
      route?.stops.filter(
        (stop) =>
          !isBreakStop(stop),
      ) || [],
    [route],
  );

  const deliveryPointCount =
    deliveryPointStops.length;

  const completedCount = useMemo(
    () =>
      deliveryPointStops.filter(
        isCompletedStop,
      ).length,
    [deliveryPointStops],
  );

  const deliverySequenceByStopId =
    useMemo(() => {
      const sequence = new Map<
        string,
        number
      >();

      deliveryPointStops.forEach(
        (stop, index) => {
          sequence.set(
            stop.id,
            index + 1,
          );
        },
      );

      return sequence;
    }, [deliveryPointStops]);

  const nextScheduledStop = useMemo(
    () =>
      route?.stops.find(
        (stop) =>
          !isCompletedStop(stop),
      ) || null,
    [route],
  );

  const activeStop = useMemo(() => {
    if (!route) {
      return null;
    }

    const selectedStop = selectedStopId
      ? route.stops.find(
          (stop) =>
            stop.id === selectedStopId,
        ) || null
      : null;

    return (
      selectedStop ||
      nextScheduledStop
    );
  }, [
    nextScheduledStop,
    route,
    selectedStopId,
  ]);

 const isManualStopSelection =
  Boolean(
    activeStop &&
      nextScheduledStop &&
      activeStop.id !==
        nextScheduledStop.id,
  );

const activeStopPosition =
  activeStop
    ? deliverySequenceByStopId.get(
        activeStop.id,
      ) || null
    : null;

useEffect(() => {
    setDriverNotesDraft(
      String(
        activeStop?.driver_notes || "",
      ),
    );

    setChecklistOpen(false);
  }, [
    activeStop?.id,
    activeStop?.driver_notes,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadChecklist() {
      const bookingId = String(
        activeStop?.booking_id || "",
      );

      if (!bookingId) {
        setChecklistItems([]);
        setChecklistLoading(false);
        return;
      }

      setChecklistLoading(true);

      try {
        const items =
          await loadMobileChecklistForBooking(
            bookingId,
          );

        if (!cancelled) {
          setChecklistItems(items);
        }
      } catch (checklistError) {
        if (!cancelled) {
          console.warn(
            "[Route] Could not load mobile checklist:",
            checklistError,
          );

          setChecklistItems([]);
        }
      } finally {
        if (!cancelled) {
          setChecklistLoading(false);
        }
      }
    }

    void loadChecklist();

    return () => {
      cancelled = true;
    };
  }, [activeStop?.booking_id]);


  const activeAction = activeStop
    ? nextRouteAction(activeStop)
    : null;

  const activeStatus = String(
    activeStop?.status || "",
  ).toLowerCase();

  const activeBalanceDue = Number(
    activeStop?.balance_due || 0,
  );

  const activePaymentRequired =
    Number.isFinite(
      activeBalanceDue,
    ) &&
    activeBalanceDue > 0 &&
    !Boolean(
      activeStop?.payment_collected,
    );

  const activeProofRequired =
    Boolean(activeStop) &&
    !Boolean(
      activeStop?.proof_photo_uploaded,
    );

  const isCompletionAction =
    activeAction?.status ===
      "installed" ||
    activeAction?.status ===
      "picked_up" ||
    activeAction?.status ===
      "completed";

  /*
   * IMPORTANT:
   * Checklist is NOT blocking completion yet.
   *
   * We first verify existing checklist data
   * on real bookings before making it mandatory.
   */
  const completionBlocked =
    Boolean(isCompletionAction) &&
    (
      activePaymentRequired ||
      activeProofRequired
    );

  const checklistField:
    | "installed"
    | "picked_up" =
    String(
      activeStop?.stop_type || "",
    ).toLowerCase() === "pickup"
      ? "picked_up"
      : "installed";

  const checklistCompletedCount =
    checklistItems.filter((item) =>
      checklistField === "picked_up"
        ? Boolean(item.picked_up)
        : Boolean(item.installed),
    ).length;

  const checklistComplete =
    checklistItems.length === 0 ||
    checklistCompletedCount ===
      checklistItems.length;

  const handoverAvailable =
    Boolean(activeStop?.booking_id) &&
    String(activeStop?.stop_type || "").toLowerCase() ===
      "delivery";

  const openBreak =
    currentOpenBreak(
      shiftDashboard,
    );

  const shiftIsOpen =
    hasOpenShift(
      shiftDashboard,
    );

  const shiftPaidMinutes =
    paidShiftMinutes(
      shiftDashboard,
      nowMs,
    );

  const openBreakMinutes =
    durationMinutes(
      openBreak?.started_at,
      openBreak?.ended_at,
      nowMs,
    );

  const runActiveAction =
    useCallback(async () => {
      if (
        !activeStop ||
        !activeAction?.status ||
        actionPending
      ) {
        return;
      }

      setActionPending(true);
      setError("");

      try {
        await updateMyRouteStopStatus(
          activeStop.id,
          activeAction.status,
        );

        if (
          activeAction.status ===
          "on_the_way"
        ) {
          await loadShiftDashboard();

          setNavigationStop({
            ...activeStop,
            status: "on_the_way",
          });
        }

        await loadRoute("refresh");
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Could not update the route stop.",
        );
      } finally {
        setActionPending(false);
      }
    }, [
      activeAction?.status,
      activeStop,
      actionPending,
      loadRoute,
      loadShiftDashboard,
    ]);

  const markNavigationStopArrived =
    useCallback(async () => {
      if (!navigationStop) {
        throw new Error(
          "The active navigation stop is no longer available.",
        );
      }

      await updateMyRouteStopStatus(
        navigationStop.id,
        "arrived",
      );

      await loadRoute("refresh");
    }, [
      loadRoute,
      navigationStop,
    ]);

  const callCustomer =
    useCallback(async () => {
      const phone = String(
        activeStop?.customer_phone ||
          "",
      )
        .replace(
          /[^0-9+]/g,
          "",
        )
        .trim();

      if (!phone) {
        setError(
          "Customer phone number is not available.",
        );
        return;
      }

      const url = `tel:${phone}`;

      const supported =
        await Linking.canOpenURL(
          url,
        );

      if (!supported) {
        setError(
          "Phone calls are not available on this device.",
        );
        return;
      }

      await Linking.openURL(url);
    }, [
      activeStop?.customer_phone,
    ]);

  const takeProofPhoto =
    useCallback(async () => {
      if (
        !activeStop ||
        stopToolPending
      ) {
        return;
      }

      if (!activeStop.booking_id) {
        setError(
          "This stop is not linked to a booking.",
        );
        return;
      }

      setError("");
      setStopToolPending("photo");

      try {
        const permission =
          await ImagePicker.requestCameraPermissionsAsync();

        if (!permission.granted) {
          throw new Error(
            "Camera permission is required to take a proof photo.",
          );
        }

        const result =
          await ImagePicker.launchCameraAsync(
            {
              mediaTypes:
                ImagePicker
                  .MediaTypeOptions
                  .Images,
              allowsEditing: false,
              quality: 0.75,
            },
          );

        if (
          result.canceled ||
          !result.assets?.length
        ) {
          return;
        }

        const asset =
          result.assets[0];

        await uploadMyRouteStopProofPhoto(
          {
            stopId:
              activeStop.id,

            bookingId:
              activeStop.booking_id,

            uri:
              asset.uri,

            fileName:
              asset.fileName ||
              `driver-proof-${Date.now()}.jpg`,

            mimeType:
              asset.mimeType ||
              "image/jpeg",

            caption:
              `${stopLabel(
                activeStop,
              )} proof photo`,
          },
        );

        await loadRoute(
          "refresh",
        );
      } catch (photoError) {
        setError(
          photoError instanceof Error
            ? photoError.message
            : "Could not upload the proof photo.",
        );
      } finally {
        setStopToolPending(null);
      }
    }, [
      activeStop,
      loadRoute,
      stopToolPending,
    ]);

  const collectPaymentWithMethod =
    useCallback(
      async (
        method: MobilePaymentMethod,
      ) => {
        if (
          !activeStop ||
          stopToolPending
        ) {
          return;
        }

        const amount = Number(
          activeStop.balance_due ||
            0,
        );

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          setError(
            "There is no balance due for this stop.",
          );
          return;
        }

        setError("");
        setStopToolPending(
          "payment",
        );

        try {
          await markMyRouteStopPaymentCollected(
            activeStop.id,
            amount,
            method,
          );

          await loadRoute(
            "refresh",
          );
        } catch (
          paymentError
        ) {
          setError(
            paymentError instanceof Error
              ? paymentError.message
              : "Could not mark the payment as collected.",
          );
        } finally {
          setStopToolPending(null);
        }
      },
      [
        activeStop,
        loadRoute,
        stopToolPending,
      ],
    );

  const collectPayment =
    useCallback(() => {
      if (
        !activeStop ||
        stopToolPending
      ) {
        return;
      }

      const amount = Number(
        activeStop.balance_due || 0,
      );

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        setError(
          "There is no balance due for this stop.",
        );
        return;
      }

      Alert.alert(
        `Collect ${moneyText(
          amount,
        )}`,
        "Select the payment method.",
        [
          {
            text: "Cash",
            onPress: () =>
              void collectPaymentWithMethod(
                "cash",
              ),
          },
          {
            text: "Zelle",
            onPress: () =>
              void collectPaymentWithMethod(
                "zelle",
              ),
          },
          {
            text: "Venmo",
            onPress: () =>
              void collectPaymentWithMethod(
                "venmo",
              ),
          },
          {
            text: "Card",
            onPress: () =>
              void collectPaymentWithMethod(
                "card",
              ),
          },
          {
            text: "Cancel",
            style: "cancel",
          },
        ],
      );
    }, [
      activeStop,
      collectPaymentWithMethod,
      stopToolPending,
    ]);

  const saveDriverNotes =
    useCallback(async () => {
      if (
        !activeStop ||
        stopToolPending
      ) {
        return;
      }

      setError("");
      setStopToolPending("notes");

      try {
        await saveMyRouteStopNotes(
          activeStop.id,
          driverNotesDraft,
        );

        await loadRoute(
          "refresh",
        );
      } catch (notesError) {
        setError(
          notesError instanceof Error
            ? notesError.message
            : "Could not save the driver notes.",
        );
      } finally {
        setStopToolPending(null);
      }
    }, [
      activeStop,
      driverNotesDraft,
      loadRoute,
      stopToolPending,
    ]);

  const toggleChecklistItem =
    useCallback(
      async (
        item: MobileChecklistItem,
      ) => {
        if (
          !activeStop?.booking_id ||
          checklistPendingId
        ) {
          return;
        }

        const currentValue =
          checklistField ===
          "picked_up"
            ? Boolean(
                item.picked_up,
              )
            : Boolean(
                item.installed,
              );

        setChecklistPendingId(
          item.id,
        );

        setError("");

        try {
          await toggleMyChecklistItem(
            item.id,
            activeStop.booking_id,
            checklistField,
            !currentValue,
          );

          setChecklistItems(
            (current) =>
              current.map(
                (currentItem) =>
                  currentItem.id ===
                  item.id
                    ? {
                        ...currentItem,
                        [checklistField]:
                          !currentValue,
                      }
                    : currentItem,
              ),
          );
        } catch (
          checklistError
        ) {
          setError(
            checklistError instanceof
              Error
              ? checklistError.message
              : "Could not update the checklist.",
          );
        } finally {
          setChecklistPendingId(
            null,
          );
        }
      },
      [
        activeStop?.booking_id,
        checklistField,
        checklistPendingId,
      ],
    );

  const toggleBreak =
    useCallback(async () => {
      if (
        !shiftIsOpen ||
        shiftPending
      ) {
        return;
      }

      setShiftPending(true);
      setError("");

      try {
        if (openBreak) {
          await resumeMyStaffWork();
        } else {
          await startMyStaffBreak();
        }

        await loadShiftDashboard();
      } catch (breakError) {
        setError(
          breakError instanceof Error
            ? breakError.message
            : openBreak
              ? "Could not resume work."
              : "Could not start the break.",
        );
      } finally {
        setShiftPending(false);
      }
    }, [
      loadShiftDashboard,
      openBreak,
      shiftIsOpen,
      shiftPending,
    ]);

  const finishShift =
    useCallback(() => {
      if (shiftPending) {
        return;
      }

      Alert.alert(
        "Finish work shift?",
        "This will clock you out. Use this only after today's route is finished.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Finish Shift",
            style: "destructive",

            onPress: () => {
              void (async () => {
                setShiftPending(
                  true,
                );

                setError("");

                try {
                  await finishMyDriverShift();

                  await loadShiftDashboard();
                } catch (
                  finishError
                ) {
                  setError(
                    finishError instanceof
                      Error
                      ? finishError.message
                      : "Could not finish the work shift.",
                  );
                } finally {
                  setShiftPending(
                    false,
                  );
                }
              })();
            },
          },
        ],
      );
    }, [
      loadShiftDashboard,
      shiftPending,
    ]);

  const closeNavigation =
    useCallback(() => {
      setNavigationStop(null);
    }, []);

 if (navigationStop) {
  const {
    NavigationScreen,
  } = require("./NavigationScreen");

  const {
    NavigationProvider,
    TaskRemovedBehavior,
  } = require(
    "@googlemaps/react-native-navigation-sdk",
  );

  return (
    <NavigationProvider
      termsAndConditionsDialogOptions={{
        title: "Navigation Terms",
        companyName: "Bounce Party LA",
        showOnlyDisclaimer: true,
      }}
      taskRemovedBehavior={
        TaskRemovedBehavior.QUIT_SERVICE
      }
    >
      <NavigationScreen
        stop={navigationStop}
        onClose={closeNavigation}
        onArrived={
          markNavigationStopArrived
        }
      />
    </NavigationProvider>
  );
}

  if (loading && !route) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color="#23313f"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading route…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={
        styles.content
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void loadRoute(
              "refresh",
            );
            void loadRouteCalendar();
          }}
        />
      }
    >
      <View
        style={styles.headerRow}
      >
        <View
          style={styles.headerCopy}
        >
          <Text
            style={styles.eyebrow}
          >
            BOUNCE PARTY LA
          </Text>

          <Text
            style={styles.title}
          >
            {selectedDate === today
              ? "Today's Route"
              : "Route"}
          </Text>

          <Text
            style={styles.subtitle}
          >
            {route?.driver.name ||
              "Driver"}

            {route?.date
              ? ` · ${formatRouteDate(
                  route.date,
                )}`
              : ""}
          </Text>
        </View>

        <Pressable
          onPress={() =>
            void supabase.auth.signOut()
          }
          style={({ pressed }) => [
            styles.signOut,
            pressed
              ? styles.pressed
              : null,
          ]}
        >
          <Text
            style={
              styles.signOutText
            }
          >
            Sign Out
          </Text>
        </Pressable>
      </View>

      <View style={styles.dateToolbar}>
  <Pressable
    onPress={() =>
      setRouteCalendarOpen(true)
    }
    style={({ pressed }) => [
      styles.calendarButton,
      pressed
        ? styles.pressed
        : null,
    ]}
  >
    <View
      style={
        styles.calendarIconBox
      }
    >
      <Text
        style={
          styles.calendarIconText
        }
      >
        31
      </Text>
    </View>

    <View
      style={
        styles.calendarButtonCopy
      }
    >
      <Text
        style={
          styles.calendarButtonLabel
        }
      >
        CALENDAR
      </Text>

      <Text
        style={
          styles.calendarButtonValue
        }
      >
        {selectedDate === today
          ? "Choose route date"
          : formatRouteDate(
              selectedDate,
            )}
      </Text>
    </View>

    <Text
      style={
        styles.calendarChevron
      }
    >
      ›
    </Text>
  </Pressable>

  <Pressable
    onPress={() => {
      if (
        selectedDate !== today
      ) {
        setSelectedDate(today);
      }
    }}
    style={({ pressed }) => [
      styles.todayDateButton,
      pressed
        ? styles.pressed
        : null,
    ]}
  >
    <Text
      style={
        styles.todayDateLabel
      }
    >
      TODAY
    </Text>

    <Text
      style={
        styles.todayDateValue
      }
    >
      {formatRouteDate(today)}
    </Text>
    {selectedDate !== today ? (
      <Text
        style={
          styles.todayDateHint
        }
      >
        Return to today
      </Text>
    ) : null}
  </Pressable>
</View>
      {error ? (
        <View
          style={styles.errorCard}
        >
          <Text
            style={styles.errorTitle}
          >
            Action unavailable
          </Text>

          <Text
            style={styles.errorText}
          >
            {error}
          </Text>
        </View>
      ) : null}

      <View
        style={styles.shiftBar}
      >
        <View
          style={
            styles.shiftStatusCopy
          }
        >
          <View
            style={
              styles.shiftStatusTitleRow
            }
          >
            <View
              style={[
                styles.shiftDot,

                shiftIsOpen
                  ? openBreak
                    ? styles.shiftDotBreak
                    : styles.shiftDotActive
                  : null,
              ]}
            />

            <Text
              style={
                styles.shiftLabel
              }
            >
              {openBreak
                ? "ON BREAK"
                : "WORK SHIFT"}
            </Text>
          </View>

          <Text
            style={
              styles.shiftValue
            }
          >
            {shiftIsOpen
              ? openBreak
                ? `${formatDuration(
                    openBreakMinutes,
                  )} break`
                : `${formatDuration(
                    shiftPaidMinutes,
                  )} worked`
              : "Starts with first navigation"}
          </Text>

          {shiftIsOpen ? (
            <Text
              style={
                styles.shiftSubvalue
              }
            >
              {openBreak
                ? `Paid time ${formatDuration(
                    shiftPaidMinutes,
                  )}`
                : "Live GPS enabled"}
            </Text>
          ) : null}
        </View>

        {shiftIsOpen ? (
          <Pressable
            disabled={shiftPending}
            onPress={() =>
              void toggleBreak()
            }
            style={({
              pressed,
            }) => [
              styles.breakButton,

              openBreak
                ? styles.resumeButton
                : null,

              pressed
                ? styles.pressed
                : null,

              shiftPending
                ? styles.disabledButton
                : null,
            ]}
          >
            {shiftPending ? (
              <ActivityIndicator
                size="small"
                color={
                  openBreak
                    ? "#ffffff"
                    : "#23313f"
                }
              />
            ) : (
              <Text
                style={[
                  styles.breakButtonText,

                  openBreak
                    ? styles.resumeButtonText
                    : null,
                ]}
              >
                {openBreak
                  ? "Resume"
                  : "Start Break"}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>

      {route ? (
        <>
          <View
            style={styles.statsRow}
          >
            <View
              style={styles.statCard}
            >
              <Text
                style={
                  styles.statValue
                }
              >
                {deliveryPointCount}
              </Text>

              <Text
                style={
                  styles.statLabel
                }
              >
                Stops
              </Text>
            </View>

            <View
              style={styles.statCard}
            >
              <Text
                style={
                  styles.statValue
                }
              >
                {completedCount}
              </Text>

              <Text
                style={
                  styles.statLabel
                }
              >
                Completed
              </Text>
            </View>

            <View
              style={styles.statCard}
            >
              <Text
                style={
                  styles.statValue
                }
              >
                {Math.max(
                  deliveryPointCount -
                    completedCount,
                  0,
                )}
              </Text>

              <Text
                style={
                  styles.statLabel
                }
              >
                Remaining
              </Text>
            </View>
          </View>

          {activeStop ? (
            <View
              style={
                styles.currentCard
              }
            >
              <View
                style={
                  styles.currentTopRow
                }
              >
                <Text
  style={
    styles.cardLabel
  }
>
  {isManualStopSelection
    ? activeStopPosition
      ? `SELECTED STOP · ${activeStopPosition} OF ${deliveryPointCount}`
      : isBreakStop(
            activeStop,
          )
        ? "SELECTED BREAK"
        : "SELECTED STOP"
    : "CURRENT STOP"}
</Text>
                <Text
                  style={[
                    styles.typePill,

                    isBreakStop(
                      activeStop,
                    )
                      ? styles.typePillBreak
                      : String(
                            activeStop.stop_type ||
                              "",
                          ).toLowerCase() ===
                          "pickup"
                      ? styles.typePillPickup
                      : styles.typePillDelivery,
                  ]}
                >
                  {stopLabel(
                    activeStop,
                  )}
                </Text>
              </View>

              <Text
                style={
                  styles.currentTime
                }
              >
                {formatTime(
                  activeStop.scheduled_start_time,
                )}
              </Text>

              <Text
                style={
                  styles.currentCustomer
                }
              >
                {activeStop.customer_name ||
                  "Customer"}
              </Text>

              <Text
                style={
                  styles.currentAddress
                }
              >
                {addressText(
                  activeStop,
                ) ||
                  "Address not available"}
              </Text>

              {isManualStopSelection &&
              nextScheduledStop ? (
                <Pressable
                  onPress={() =>
                    setSelectedStopId(
                      null,
                    )
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.returnToNextButton,

                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <Text
                    style={
                      styles.returnToNextButtonText
                    }
                  >
                    Return to next scheduled stop
                  </Text>
                </Pressable>
              ) : null}

              {activeStop.items_summary ? (
                <View
                  style={
                    styles.detailBlock
                  }
                >
                  <Text
                    style={
                      styles.detailLabel
                    }
                  >
                    EQUIPMENT
                  </Text>

                  <Text
                    style={
                      styles.detailText
                    }
                  >
                    {
                      activeStop.items_summary
                    }
                  </Text>
                </View>
              ) : null}

              {privateDriverNote(activeStop) ? (
                <View
                  style={
                    styles.detailBlock
                  }
                >
                  <Text
                    style={
                      styles.detailLabel
                    }
                  >
                    DRIVER NOTES
                  </Text>

                  <Text
                    style={
                      styles.detailText
                    }
                  >
                    {privateDriverNote(activeStop)}
                  </Text>
                </View>
              ) : null}

              <View
                style={
                  styles.quickInfoRow
                }
              >
                <View
                  style={
                    styles.quickInfoCell
                  }
                >
                  <Text
                    style={
                      styles.quickInfoLabel
                    }
                  >
                    BALANCE
                  </Text>

                  <Text
                    style={
                      styles.quickInfoValue
                    }
                  >
                    {activeStop.payment_collected
                      ? `Paid${
                          activeStop.payment_collected_amount
                            ? ` · ${moneyText(activeStop.payment_collected_amount)}`
                            : ""
                        }`
                      : moneyText(
                          activeStop.balance_due,
                        )}
                  </Text>
                </View>

                <Pressable
                  onPress={() =>
                    void callCustomer()
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.callButton,

                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <Text
                    style={
                      styles.callButtonText
                    }
                  >
                    Call Customer
                  </Text>
                </Pressable>
              </View>

              {/* PAYMENT */}

              <View
                style={
                  styles.operationBlock
                }
              >
                <View
                  style={
                    styles.operationHeader
                  }
                >
                  <View
                    style={
                      styles.operationCopy
                    }
                  >
                    <Text
                      style={
                        styles.operationLabel
                      }
                    >
                      PAYMENT
                    </Text>

                    <Text
                      style={[
                        styles.operationStatus,

                        activeStop.payment_collected
                          ? styles.operationStatusDone
                          : null,
                      ]}
                    >
                      {activeStop.payment_collected
                        ? `Collected${
                            activeStop.payment_collected_amount
                              ? ` ${moneyText(activeStop.payment_collected_amount)}`
                              : ""
                          }${
                            activeStop.payment_collected_method
                              ? ` · ${String(
                                  activeStop.payment_collected_method,
                                ).toUpperCase()}`
                              : ""
                          }`
                        : activeBalanceDue >
                            0
                          ? `${moneyText(
                              activeStop.balance_due,
                            )} due`
                          : "No payment required"}
                    </Text>
                  </View>

                  {activeBalanceDue >
                    0 &&
                  !activeStop.payment_collected ? (
                    <Pressable
                      disabled={
                        stopToolPending !==
                        null
                      }
                      onPress={
                        collectPayment
                      }
                      style={({
                        pressed,
                      }) => [
                        styles.operationButton,

                        pressed
                          ? styles.pressed
                          : null,

                        stopToolPending !==
                        null
                          ? styles.disabledButton
                          : null,
                      ]}
                    >
                      {stopToolPending ===
                      "payment" ? (
                        <ActivityIndicator
                          size="small"
                          color="#23313f"
                        />
                      ) : (
                        <Text
                          style={
                            styles.operationButtonText
                          }
                        >
                          Collect
                        </Text>
                      )}
                    </Pressable>
                  ) : (
                    <View
                      style={
                        styles.operationDone
                      }
                    >
                      <Text
                        style={
                          styles.operationDoneText
                        }
                      >
                        ✓
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* PROOF PHOTO */}

              <View
                style={
                  styles.operationBlock
                }
              >
                <View
                  style={
                    styles.operationHeader
                  }
                >
                  <View
                    style={
                      styles.operationCopy
                    }
                  >
                    <Text
                      style={
                        styles.operationLabel
                      }
                    >
                      PROOF PHOTO
                    </Text>

                    <Text
                      style={[
                        styles.operationStatus,

                        activeStop.proof_photo_uploaded
                          ? styles.operationStatusDone
                          : null,
                      ]}
                    >
                      {activeStop.proof_photo_uploaded
                        ? "Photo uploaded"
                        : "Required before completion"}
                    </Text>
                  </View>

                  {activeStop.proof_photo_uploaded ? (
                    <View
                      style={
                        styles.operationDone
                      }
                    >
                      <Text
                        style={
                          styles.operationDoneText
                        }
                      >
                        ✓
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      disabled={
                        stopToolPending !==
                        null
                      }
                      onPress={() =>
                        void takeProofPhoto()
                      }
                      style={({
                        pressed,
                      }) => [
                        styles.operationButton,

                        pressed
                          ? styles.pressed
                          : null,

                        stopToolPending !==
                        null
                          ? styles.disabledButton
                          : null,
                      ]}
                    >
                      {stopToolPending ===
                      "photo" ? (
                        <ActivityIndicator
                          size="small"
                          color="#23313f"
                        />
                      ) : (
                        <Text
                          style={
                            styles.operationButtonText
                          }
                        >
                          Take Photo
                        </Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>

                           {/* CHECKLIST */}

              <View
                style={
                  styles.operationBlock
                }
              >
                <Pressable
                  onPress={() =>
                    setChecklistOpen(true)
                  }
                  style={({ pressed }) => [
                    styles.checklistSummary,
                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <View
                    style={
                      styles.checklistSummaryCopy
                    }
                  >
                    <Text
                      style={
                        styles.operationLabel
                      }
                    >
                      {checklistField ===
                      "picked_up"
                        ? "PICKUP CHECKLIST"
                        : "DELIVERY CHECKLIST"}
                    </Text>

                    <Text
                      style={[
                        styles.operationStatus,
                        checklistComplete
                          ? styles.operationStatusDone
                          : null,
                      ]}
                    >
                      {checklistLoading
                        ? "Loading..."
                        : checklistItems.length ===
                            0
                          ? "No checklist items"
                          : `${checklistCompletedCount} of ${checklistItems.length} checked`}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.checklistOpenButton
                    }
                  >
                    <Text
                      style={
                        styles.checklistOpenButtonText
                      }
                    >
                      Open
                    </Text>

                    <Text
                      style={
                        styles.checklistChevron
                      }
                    >
                      ›
                    </Text>
                  </View>
                </Pressable>
              </View>

              {handoverAvailable ? (
                <View style={styles.operationBlock}>
                  <Pressable
                    onPress={() => setHandoverOpen(true)}
                    style={({ pressed }) => [
                      styles.checklistSummary,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <View style={styles.checklistSummaryCopy}>
                      <Text style={styles.operationLabel}>CUSTOMER SIGNATURE</Text>
                      <Text style={styles.operationStatus}>
                        Open handover and sign delivery acceptance
                      </Text>
                    </View>

                    <View style={styles.checklistOpenButton}>
                      <Text style={styles.checklistOpenButtonText}>Open</Text>
                      <Text style={styles.checklistChevron}>›</Text>
                    </View>
                  </Pressable>
                </View>
              ) : null}

              {/* DRIVER NOTES */}

              <View
                style={
                  styles.operationBlock
                }
              >
                <Text
                  style={
                    styles.operationLabel
                  }
                >
                  DRIVER NOTES
                </Text>

                <TextInput
                  value={
                    driverNotesDraft
                  }
                  onChangeText={
                    setDriverNotesDraft
                  }
                  placeholder="Add delivery notes, customer requests, access issues..."
                  placeholderTextColor="rgba(255,255,255,0.38)"
                  multiline
                  textAlignVertical="top"
                  style={
                    styles.driverNotesInput
                  }
                />

                <Pressable
                  disabled={
                    stopToolPending !==
                    null
                  }
                  onPress={() =>
                    void saveDriverNotes()
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.saveNotesButton,

                    pressed
                      ? styles.pressed
                      : null,

                    stopToolPending !==
                    null
                      ? styles.disabledButton
                      : null,
                  ]}
                >
                  {stopToolPending ===
                  "notes" ? (
                    <ActivityIndicator
                      size="small"
                      color="#f0c987"
                    />
                  ) : (
                    <Text
                      style={
                        styles.saveNotesButtonText
                      }
                    >
                      Save Notes
                    </Text>
                  )}
                </Pressable>
              </View>

              {activeStatus ===
              "on_the_way" ? (
                <Pressable
                  onPress={() =>
                    setNavigationStop(
                      activeStop,
                    )
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.navigationButton,

                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <Text
                    style={
                      styles.navigationButtonText
                    }
                  >
                    Open Navigation
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                disabled={
                  !activeAction?.status ||
                  actionPending ||
                  Boolean(openBreak) ||
                  completionBlocked
                }
                onPress={() =>
                  void runActiveAction()
                }
                style={({
                  pressed,
                }) => [
                  styles.primaryButton,

                  pressed
                    ? styles.pressed
                    : null,

                  actionPending
                    ? styles.primaryButtonBusy
                    : null,

                  completionBlocked
                    ? styles.primaryButtonDisabled
                    : null,
                ]}
              >
                {actionPending ? (
                  <ActivityIndicator
                    color="#23313f"
                  />
                ) : (
                  <Text
                    style={
                      styles.primaryButtonText
                    }
                  >
                    {activeAction?.label ||
                      "Continue"}
                  </Text>
                )}
              </Pressable>

              {openBreak ? (
                <Text
                  style={
                    styles.actionHint
                  }
                >
                  Resume work before
                  changing this stop.
                </Text>
              ) : activeAction?.status ===
                "on_the_way" ? (
                <Text
                  style={
                    styles.actionHint
                  }
                >
                  Starting navigation
                  also starts your work
                  shift and live driver
                  tracking.
                </Text>
              ) : activeStatus ===
                "on_the_way" ? (
                <Text
                  style={
                    styles.actionHint
                  }
                >
                  Navigation is active.
                  Mark Arrived when you
                  reach the customer.
                </Text>
              ) : activeStatus ===
                "arrived" ? (
                <Text
                  style={
                    styles.actionHint
                  }
                >
                  {activePaymentRequired &&
                  activeProofRequired
                    ? "Collect payment and upload a proof photo before completing this stop."
                    : activePaymentRequired
                      ? "Collect payment before completing this stop."
                      : activeProofRequired
                        ? "Upload a proof photo before completing this stop."
                        : "Everything required is complete. You can finish this stop."}
                </Text>
              ) : null}
            </View>
          ) : (
            <View
              style={
                styles.completeCard
              }
            >
              <Text
                style={
                  styles.completeTitle
                }
              >
                {route.stops.length >
                0
                  ? "Route completed"
                  : "No route assigned"}
              </Text>

              <Text
                style={
                  styles.completeText
                }
              >
                {route.stops.length >
                0
                  ? "All assigned delivery and pickup stops are complete."
                  : `There are no delivery or pickup stops assigned to you for ${formatRouteDate(
                      selectedDate,
                    )}.`}
              </Text>

              {hasOpenShift(
                shiftDashboard,
              ) ? (
                <Pressable
                  disabled={
                    shiftPending
                  }
                  onPress={
                    finishShift
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.finishShiftButton,

                    pressed
                      ? styles.pressed
                      : null,

                    shiftPending
                      ? styles.primaryButtonBusy
                      : null,
                  ]}
                >
                  {shiftPending ? (
                    <ActivityIndicator
                      color="#ffffff"
                    />
                  ) : (
                    <Text
                      style={
                        styles.finishShiftButtonText
                      }
                    >
                      Finish Shift
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          )}

          {route.stops.length >
          0 ? (
            <View
              style={
                styles.listSection
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                All Stops
              </Text>

              {route.stops.map(
                (stop, index) => {
                  const completed =
                    isCompletedStop(
                      stop,
                    );

                  const isBreak =
                    isBreakStop(stop);

                  const isPickup =
                    String(
                      stop.stop_type ||
                        "",
                    ).toLowerCase() ===
                    "pickup";

                  const sequenceNumber =
                    deliverySequenceByStopId.get(
                      stop.id,
                    );

                  return (
                    <Pressable
                      key={stop.id}
                      onPress={() =>
                        setSelectedStopId(
                          stop.id,
                        )
                      }
                      style={({
                        pressed,
                      }) => [
                        styles.stopRow,

                        activeStop?.id ===
                        stop.id
                          ? styles.stopRowSelected
                          : null,

                        pressed
                          ? styles.pressed
                          : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.sequence,

                          isBreak
                            ? styles.sequenceBreak
                            : isPickup
                            ? styles.sequencePickup
                            : styles.sequenceDelivery,

                          completed
                            ? styles.sequenceDone
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sequenceText,

                            isBreak
                              ? styles.sequenceTextBreak
                              : isPickup
                              ? styles.sequenceTextPickup
                              : styles.sequenceTextDelivery,
                          ]}
                        >
                          {isBreak
                            ? "B"
                            : sequenceNumber ||
                              index + 1}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.stopCopy
                        }
                      >
                        <View
                          style={
                            styles.stopTitleRow
                          }
                        >
                          <Text
                            style={
                              styles.stopTitle
                            }
                            numberOfLines={
                              1
                            }
                          >
                            {stop.customer_name ||
                              stopLabel(
                                stop,
                              )}
                          </Text>

                          <Text
                            style={
                              styles.stopTime
                            }
                          >
                            {formatTime(
                              stop.scheduled_start_time,
                            )}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.stopMetaRow
                          }
                        >
                          <Text
                            style={[
                              styles.stopTypeText,

                              isBreak
                                ? styles.stopTypeBreak
                                : isPickup
                                ? styles.stopTypePickup
                                : styles.stopTypeDelivery,
                            ]}
                          >
                            {stopLabel(
                              stop,
                            )}
                          </Text>

                          <Text
                            style={
                              styles.stopAddressText
                            }
                            numberOfLines={
                              1
                            }
                          >
                            {" · "}
                            {addressText(
                              stop,
                            ) ||
                              "No address"}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.stopFooterRow
                          }
                        >
                          <Text
                            style={[
                              styles.stopStatus,

                              completed
                                ? styles.stopStatusDone
                                : null,
                            ]}
                          >
                            {completed
                              ? "Completed"
                              : String(
                                  stop.status ||
                                    "Scheduled",
                                )}
                          </Text>

                          {activeStop?.id ===
                          stop.id ? (
                            <Text
                              style={
                                styles.stopSelectedLabel
                              }
                            >
                              Selected
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                },
              )}
            </View>
          ) : null}
        </>
      ) : null}

      <RouteCalendarModal
        visible={routeCalendarOpen}

        days={routeCalendar}
        selectedDate={selectedDate}
        today={today}
        onClose={() =>
          setRouteCalendarOpen(false)
        }
        onSelectDate={(date) => {
          setSelectedDate(date);
          setRouteCalendarOpen(false);
        }}
      />

      <HandoverModal
        visible={handoverOpen}
        bookingId={
          handoverAvailable
            ? String(activeStop?.booking_id || "")
            : null
        }
        onClose={() => setHandoverOpen(false)}
      />

      <Modal
        visible={checklistOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setChecklistOpen(false)
        }
      >
        <View
          style={
            styles.checklistModalBackdrop
          }
        >
          <Pressable
            style={
              styles.checklistModalDismissArea
            }
            onPress={() =>
              setChecklistOpen(false)
            }
          />

          <View
            style={
              styles.checklistSheet
            }
          >
            <View
              style={
                styles.checklistSheetHandle
              }
            />

            <View
              style={
                styles.checklistSheetHeader
              }
            >
              <View
                style={
                  styles.checklistSheetHeaderCopy
                }
              >
                <Text
                  style={
                    styles.checklistSheetEyebrow
                  }
                >
                  {checklistField ===
                  "picked_up"
                    ? "PICKUP"
                    : "DELIVERY"}
                </Text>

                <Text
                  style={
                    styles.checklistSheetTitle
                  }
                >
                  Equipment Checklist
                </Text>

                <Text
                  style={
                    styles.checklistSheetProgress
                  }
                >
                  {checklistLoading
                    ? "Loading..."
                    : `${checklistCompletedCount} of ${checklistItems.length} checked`}
                </Text>
              </View>

              <Pressable
                onPress={() =>
                  setChecklistOpen(false)
                }
                style={({ pressed }) => [
                  styles.checklistCloseButton,
                  pressed
                    ? styles.pressed
                    : null,
                ]}
              >
                <Text
                  style={
                    styles.checklistCloseButtonText
                  }
                >
                  Close
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={
                styles.checklistSheetScroll
              }
              contentContainerStyle={
                styles.checklistSheetContent
              }
              showsVerticalScrollIndicator={
                false
              }
            >
              {checklistLoading ? (
                <View
                  style={
                    styles.checklistLoading
                  }
                >
                  <ActivityIndicator
                    size="small"
                    color="#23313f"
                  />
                </View>
              ) : checklistItems.length ===
                0 ? (
                <View
                  style={
                    styles.checklistEmpty
                  }
                >
                  <Text
                    style={
                      styles.checklistEmptyTitle
                    }
                  >
                    No checklist items
                  </Text>

                  <Text
                    style={
                      styles.checklistEmptyText
                    }
                  >
                    This booking does not have equipment checklist items.
                  </Text>
                </View>
              ) : (
                checklistItems.map(
                  (item) => {
                    const checked =
                      checklistField ===
                      "picked_up"
                        ? Boolean(
                            item.picked_up,
                          )
                        : Boolean(
                            item.installed,
                          );

                    const pending =
                      checklistPendingId ===
                      item.id;

                    const secondary =
                      item.unit_code ||
                      item.serial_number ||
                      item.inventory_sku ||
                      null;

                    return (
                      <Pressable
                        key={item.id}
                        disabled={
                          checklistPendingId !==
                          null
                        }
                        onPress={() =>
                          void toggleChecklistItem(
                            item,
                          )
                        }
                        style={({ pressed }) => [
                          styles.checklistSheetItem,

                          checked
                            ? styles.checklistSheetItemDone
                            : null,

                          pressed
                            ? styles.pressed
                            : null,
                        ]}
                      >
                        <View
                          style={[
                            styles.checklistCheck,

                            checked
                              ? styles.checklistCheckDone
                              : null,
                          ]}
                        >
                          {pending ? (
                            <ActivityIndicator
                              size="small"
                              color={
                                checked
                                  ? "#ffffff"
                                  : "#23313f"
                              }
                            />
                          ) : (
                            <Text
                              style={[
                                styles.checklistCheckText,

                                checked
                                  ? styles.checklistCheckTextDone
                                  : null,
                              ]}
                            >
                              {checked
                                ? "✓"
                                : ""}
                            </Text>
                          )}
                        </View>

                        <View
                          style={
                            styles.checklistSheetItemCopy
                          }
                        >
                          <Text
                            style={[
                              styles.checklistSheetItemTitle,

                              checked
                                ? styles.checklistSheetItemTitleDone
                                : null,
                            ]}
                            numberOfLines={
                              2
                            }
                          >
                            {item.title}
                          </Text>

                          <View
                            style={
                              styles.checklistItemMetaRow
                            }
                          >
                            {Number(
                              item.quantity ||
                                1,
                            ) > 1 ? (
                              <Text
                                style={
                                  styles.checklistSheetItemMeta
                                }
                              >
                                Qty{" "}
                                {
                                  item.quantity
                                }
                              </Text>
                            ) : null}

                            {secondary ? (
                              <Text
                                style={
                                  styles.checklistSheetItemMeta
                                }
                                numberOfLines={
                                  1
                                }
                              >
                                {secondary}
                              </Text>
                            ) : null}
                          </View>
                        </View>

                        {item.image_url ? (
                          <Image
                            source={{
                              uri: item.image_url,
                            }}
                            style={
                              styles.checklistThumbnail
                            }
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={
                              styles.checklistThumbnailPlaceholder
                            }
                          >
                            <Text
                              style={
                                styles.checklistThumbnailPlaceholderText
                              }
                            >
                              {String(
                                item.title ||
                                  "?",
                              )
                                .trim()
                                .charAt(0)
                                .toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  },
                )
              )}

              <View
                style={
                  styles.checklistOptionalNotice
                }
              >
                <Text
                  style={
                    styles.checklistOptionalNoticeText
                  }
                >
                  Checklist is optional and does not block stop completion.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f1e8",
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 64,
    paddingBottom: 48,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f1e8",
    padding: 24,
  },

  loadingText: {
    marginTop: 14,
    color: "#6c6258",
    fontSize: 14,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },

  headerCopy: {
    flex: 1,
  },

  eyebrow: {
    color: "#b88645",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.7,
  },

  title: {
    color: "#23313f",
    fontSize: 31,
    fontWeight: "800",
    marginTop: 6,
  },

  subtitle: {
    color: "#6c6258",
    fontSize: 14,
    marginTop: 6,
  },

  signOut: {
    borderColor: "#d1c8bb",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  signOutText: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "700",
  },

  pressed: {
    opacity: 0.68,
  },

  dateToolbar: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },

  calendarButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#ded6cb",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1.35,
    flexDirection: "row",
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  calendarIconBox: {
    alignItems: "center",
    backgroundColor: "#23313f",
    borderRadius: 11,
    height: 38,
    justifyContent: "center",
    width: 38,
  },

  calendarIconText: {
    color: "#f0c987",
    fontSize: 13,
    fontWeight: "900",
  },

  calendarButtonCopy: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },

  calendarButtonLabel: {
    color: "#b88645",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  calendarButtonValue: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 3,
  },

  calendarChevron: {
    color: "#9a8d7e",
    fontSize: 24,
    fontWeight: "700",
    marginLeft: 4,
  },

  todayDateButton: {
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: "#ded6cb",
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  todayDateLabel: {
    color: "#b88645",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  todayDateValue: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 3,
  },

  todayDateHint: {
    color: "#81766a",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 3,
  },

  dateSection: {
    marginTop: 16,
  },

  dateSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  dateSectionLabel: {
    color: "#9a8d7e",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  todayButton: {
    borderColor: "#d1c8bb",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  todayButtonText: {
    color: "#23313f",
    fontSize: 10,
    fontWeight: "900",
  },

  dateChips: {
    gap: 8,
    paddingRight: 18,
  },

  dateChip: {
    backgroundColor: "#ffffff",
    borderColor: "transparent",
    borderRadius: 16,
    borderWidth: 2,
    minWidth: 116,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  dateChipSelected: {
    backgroundColor: "#23313f",
    borderColor: "#23313f",
  },

  dateChipText: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "900",
  },

  dateChipTextSelected: {
    color: "#ffffff",
  },

  dateChipMeta: {
    color: "#9a8d7e",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 3,
  },

  dateChipMetaSelected: {
    color: "#f0c987",
  },

  errorCard: {
    backgroundColor: "#fff1f0",
    borderColor: "#efb7b3",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 22,
    padding: 16,
  },

  errorTitle: {
    color: "#8c2e2a",
    fontSize: 16,
    fontWeight: "800",
  },

  errorText: {
    color: "#7a4844",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },

  shiftBar: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  shiftStatusCopy: {
    flex: 1,
  },

  shiftStatusTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },

  shiftLabel: {
    color: "#9a8d7e",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  shiftValue: {
    color: "#23313f",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },

  shiftSubvalue: {
    color: "#81766a",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },

  shiftDot: {
    backgroundColor: "#c9c3ba",
    borderRadius: 999,
    height: 9,
    width: 9,
  },

  shiftDotActive: {
    backgroundColor: "#5f735c",
  },

  shiftDotBreak: {
    backgroundColor: "#b88645",
  },

  breakButton: {
    alignItems: "center",
    backgroundColor: "#f0c987",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 94,
    paddingHorizontal: 13,
  },

  breakButtonText: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "900",
  },

  resumeButton: {
    backgroundColor: "#23313f",
  },

  resumeButtonText: {
    color: "#ffffff",
  },

  disabledButton: {
    opacity: 0.6,
  },

  quickInfoRow: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },

  quickInfoCell: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  quickInfoLabel: {
    color: "#f0c987",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  quickInfoValue: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 3,
  },

  callButton: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },

  callButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  finishShiftButton: {
    alignItems: "center",
    backgroundColor: "#23313f",
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 50,
    paddingHorizontal: 16,
  },

  finishShiftButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },

  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },

  statValue: {
    color: "#23313f",
    fontSize: 24,
    fontWeight: "800",
  },

  statLabel: {
    color: "#81766a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  currentCard: {
    backgroundColor: "#23313f",
    borderRadius: 26,
    marginTop: 18,
    padding: 20,
  },

  currentTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  cardLabel: {
    color: "#f0c987",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },

  typePill: {
    overflow: "hidden",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  typePillDelivery: {
    backgroundColor: "rgba(184,134,69,0.24)",
    color: "#f0c987",
  },

  typePillPickup: {
    backgroundColor: "rgba(95,143,170,0.28)",
    color: "#a9d2e8",
  },

  typePillBreak: {
    backgroundColor: "rgba(153,163,173,0.25)",
    color: "#d6dde3",
  },

  currentTime: {
    color: "#f0c987",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 22,
  },

  currentCustomer: {
    color: "#ffffff",
    fontSize: 27,
    fontWeight: "800",
    marginTop: 4,
  },

  currentAddress: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },

  returnToNextButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "rgba(240,201,135,0.45)",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  returnToNextButtonText: {
    color: "#f0c987",
    fontSize: 10,
    fontWeight: "900",
  },

  detailBlock: {
    borderTopColor: "rgba(255,255,255,0.12)",
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 14,
  },

  detailLabel: {
    color: "#f0c987",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
  },

  detailText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },

  navigationButton: {
    alignItems: "center",
    borderColor: "rgba(240,201,135,0.75)",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 50,
    paddingVertical: 14,
  },

  navigationButtonText: {
    color: "#f0c987",
    fontSize: 14,
    fontWeight: "900",
  },

  primaryButton: {
    alignItems: "center",
    backgroundColor: "#f0c987",
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 52,
    paddingVertical: 15,
  },

  primaryButtonBusy: {
    opacity: 0.75,
  },

  primaryButtonDisabled: {
    opacity: 0.45,
  },

  primaryButtonText: {
    color: "#23313f",
    fontSize: 15,
    fontWeight: "900",
  },

  actionHint: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
    textAlign: "center",
  },

  completeCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    marginTop: 18,
    padding: 20,
  },

  completeTitle: {
    color: "#23313f",
    fontSize: 21,
    fontWeight: "800",
  },

  completeText: {
    color: "#6c6258",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },

  listSection: {
    marginTop: 28,
  },

  sectionTitle: {
    color: "#23313f",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 12,
  },

  stopRow: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderColor: "transparent",
    borderRadius: 18,
    borderWidth: 2,
    marginBottom: 10,
    padding: 12,
  },

  stopRowSelected: {
    borderColor: "#b88645",
  },

  sequence: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    height: 38,
    width: 38,
  },

  sequenceDelivery: {
    backgroundColor: "#23313f",
    borderColor: "#b88645",
    borderWidth: 2,
  },

  sequencePickup: {
    backgroundColor: "#23313f",
    borderColor: "#6f9db8",
    borderWidth: 2,
  },

  sequenceBreak: {
    backgroundColor: "#23313f",
    borderColor: "#8d9ba8",
    borderWidth: 2,
  },

  sequenceDone: {
    backgroundColor: "#82927e",
  },

  sequenceText: {
    fontSize: 13,
    fontWeight: "900",
  },

  sequenceTextDelivery: {
    color: "#f0c987",
  },

  sequenceTextPickup: {
    color: "#9fc7df",
  },

  sequenceTextBreak: {
    color: "#d3dde5",
  },

  stopCopy: {
    flex: 1,
    marginLeft: 12,
  },

  stopTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  stopTitle: {
    flex: 1,
    color: "#23313f",
    fontSize: 15,
    fontWeight: "800",
  },

  stopTime: {
    color: "#6c6258",
    fontSize: 12,
    fontWeight: "700",
  },

  stopMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 4,
    minWidth: 0,
  },

  stopTypeText: {
    fontSize: 12,
    fontWeight: "900",
  },

  stopTypeDelivery: {
    color: "#b88645",
  },

  stopTypePickup: {
    color: "#5f8faa",
  },

  stopTypeBreak: {
    color: "#73808c",
  },

  stopAddressText: {
    color: "#81766a",
    flex: 1,
    fontSize: 12,
  },

  stopFooterRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 7,
  },

  stopStatus: {
    color: "#a16a2c",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize",
  },

  stopStatusDone: {
    color: "#5f735c",
  },

  stopSelectedLabel: {
    color: "#b88645",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },

  operationBlock: {
    borderTopColor: "rgba(255,255,255,0.12)",
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 14,
  },

  operationHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },

  operationCopy: {
    flex: 1,
    minWidth: 0,
  },

  operationLabel: {
    color: "#f0c987",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  operationStatus: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  operationStatusDone: {
    color: "#b9d9b4",
  },

  operationButton: {
    alignItems: "center",
    backgroundColor: "#f0c987",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 92,
    paddingHorizontal: 12,
  },

  operationButtonText: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "900",
  },

  operationDone: {
    alignItems: "center",
    backgroundColor: "rgba(95,115,92,0.34)",
    borderRadius: 999,
    height: 38,
    justifyContent: "center",
    width: 38,
  },

  operationDoneText: {
    color: "#cfe5cb",
    fontSize: 16,
    fontWeight: "900",
  },

  checklistTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },

  checklistLoading: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },

  checklistItem: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 8,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  checklistItemDone: {
    backgroundColor: "rgba(95,115,92,0.20)",
    borderColor: "rgba(185,217,180,0.30)",
  },

  checklistCheck: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 9,
    height: 30,
    justifyContent: "center",
    width: 30,
  },

  checklistCheckDone: {
    backgroundColor: "#5f735c",
  },

  checklistCheckText: {
    color: "#23313f",
    fontSize: 17,
    fontWeight: "900",
  },

  checklistCheckTextDone: {
    color: "#ffffff",
  },

  checklistCopy: {
    flex: 1,
    marginLeft: 10,
  },

  checklistItemTitle: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },

  checklistItemTitleDone: {
    color: "#b9d9b4",
  },

  checklistQuantity: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },

  driverNotesInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 14,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 9,
    minHeight: 88,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
  },

  saveNotesButton: {
    alignItems: "center",
    borderColor: "rgba(240,201,135,0.65)",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 9,
    minHeight: 40,
  },

  saveNotesButtonText: {
    color: "#f0c987",
    fontSize: 11,
    fontWeight: "900",
  },
    checklistSummary: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
  },

  checklistSummaryCopy: {
    flex: 1,
    minWidth: 0,
  },

  checklistOpenButton: {
    alignItems: "center",
    borderColor: "rgba(240,201,135,0.52)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    marginLeft: 12,
    minHeight: 38,
    paddingHorizontal: 13,
  },

  checklistOpenButtonText: {
    color: "#f0c987",
    fontSize: 11,
    fontWeight: "900",
  },

  checklistChevron: {
    color: "#f0c987",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 22,
  },

  checklistModalBackdrop: {
    backgroundColor: "rgba(20,27,34,0.48)",
    flex: 1,
    justifyContent: "flex-end",
  },

  checklistModalDismissArea: {
    flex: 1,
  },

  checklistSheet: {
    backgroundColor: "#f5f1e8",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "82%",
    minHeight: "55%",
    overflow: "hidden",
  },

  checklistSheetHandle: {
    alignSelf: "center",
    backgroundColor: "#c7bfb4",
    borderRadius: 999,
    height: 5,
    marginTop: 9,
    width: 42,
  },

  checklistSheetHeader: {
    alignItems: "center",
    borderBottomColor: "#dfd8ce",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 15,
    paddingHorizontal: 18,
    paddingTop: 13,
  },

  checklistSheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },

  checklistSheetEyebrow: {
    color: "#b88645",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },

  checklistSheetTitle: {
    color: "#23313f",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 3,
  },

  checklistSheetProgress: {
    color: "#81766a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  checklistCloseButton: {
    alignItems: "center",
    borderColor: "#d1c8bb",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    marginLeft: 12,
    minHeight: 38,
    paddingHorizontal: 13,
  },

  checklistCloseButtonText: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "900",
  },

  checklistSheetScroll: {
    flexGrow: 0,
  },

  checklistSheetContent: {
    paddingBottom: 30,
    paddingHorizontal: 18,
    paddingTop: 8,
  },

  checklistSheetItem: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2ddd4",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 10,
    minHeight: 72,
    padding: 10,
  },

  checklistSheetItemDone: {
    backgroundColor: "#eef3ec",
    borderColor: "#cbd9c8",
  },

  checklistSheetItemCopy: {
    flex: 1,
    marginLeft: 11,
    minWidth: 0,
  },

  checklistSheetItemTitle: {
    color: "#23313f",
    fontSize: 14,
    fontWeight: "900",
  },

  checklistSheetItemTitleDone: {
    color: "#5f735c",
  },

  checklistItemMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 3,
  },

  checklistSheetItemMeta: {
    color: "#81766a",
    fontSize: 10,
    fontWeight: "700",
  },

  checklistThumbnail: {
    backgroundColor: "#ebe6dd",
    borderRadius: 12,
    height: 52,
    marginLeft: 10,
    width: 52,
  },

  checklistThumbnailPlaceholder: {
    alignItems: "center",
    backgroundColor: "#ebe6dd",
    borderRadius: 12,
    height: 52,
    justifyContent: "center",
    marginLeft: 10,
    width: 52,
  },

  checklistThumbnailPlaceholderText: {
    color: "#9a8d7e",
    fontSize: 18,
    fontWeight: "900",
  },

  checklistEmpty: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 40,
  },

  checklistEmptyTitle: {
    color: "#23313f",
    fontSize: 17,
    fontWeight: "900",
  },

  checklistEmptyText: {
    color: "#81766a",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
    textAlign: "center",
  },

  checklistOptionalNotice: {
    backgroundColor: "#ebe5dc",
    borderRadius: 13,
    marginTop: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  checklistOptionalNoticeText: {
    color: "#81766a",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 15,
    textAlign: "center",
  },
});
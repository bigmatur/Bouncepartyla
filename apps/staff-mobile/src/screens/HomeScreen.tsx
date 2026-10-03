import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
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
  deleteMyRouteStopProofPhoto,
  finishMyDriverShift,
  listMyRouteStopProofPhotos,
  nextRouteAction,
  resumeMyStaffWork,
  saveMyRouteStopNotes,
  startMyDriverShift,
  startMyStaffBreak,
  toggleMyChecklistItem,
  updateMyRouteStopStatus,
  uploadMyRouteStopProofPhoto,
  type MobileRouteStopProofPhoto,
} from "../features/routes/routeActions";

import { supabase } from "../lib/supabase";
import {
  collectDriverManualPaymentFromMobile,
  type MobileDriverManualPaymentMethod,
} from "../lib/mobileApi";
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

function dayOfMonth(value: string) {
  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return String(date.getDate());
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
  const stopType = String(stop.stop_type || "").toLowerCase();
  const customerName = String(stop.customer_name || "").trim();
  const itemsSummary = String(stop.items_summary || "").trim();
  const setupNotes = String(stop.setup_notes || "").trim();

  return (
    stopType === "break" ||
    /^break$/i.test(customerName) ||
    /^break\s*\(\d{1,3}\s*(?:min|mins|minutes)\)$/i.test(itemsSummary) ||
    /(?:^|\s)break[_\s-]*minutes\s*[:=]\s*\d{1,3}(?:\s|$)/i.test(setupNotes)
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

function normalizeMarkerColor(
  value: string | null | undefined,
) {
  const raw = String(
    value || "",
  ).trim();

  if (
    /^#[0-9a-fA-F]{6}$/.test(
      raw,
    )
  ) {
    return raw;
  }

  return null;
}

function stopMarkerColor(
  stop: MobileRouteStop,
) {
  if (isBreakStop(stop)) {
    return null;
  }

  return normalizeMarkerColor(
    stop.marker_color,
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

type PaymentModalMethod =
  | "cash"
  | "zelle"
  | "venmo"
  | "card";

const ZELLE_QR_ASSET = require("../../assets/payments/zelle-qr.png");
const VENMO_QR_ASSET = require("../../assets/payments/venmo-qr.png");

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

  const [carModeEnabled, setCarModeEnabled] =
    useState(false);

  const [navigationMuted, setNavigationMuted] =
    useState(false);

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

  const [driverNotesExpanded, setDriverNotesExpanded] =
    useState(false);

  const [proofPhotos, setProofPhotos] =
    useState<MobileRouteStopProofPhoto[]>([]);

  const [proofPhotosLoading, setProofPhotosLoading] =
    useState(false);

  const [paymentModalOpen, setPaymentModalOpen] =
    useState(false);

  const [paymentModalMethod, setPaymentModalMethod] =
    useState<PaymentModalMethod>("cash");

  const [paymentModalBusy, setPaymentModalBusy] =
    useState(false);

  const [paymentModalError, setPaymentModalError] =
    useState("");

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

  const openExternalNavigationForStop =
    useCallback(async (
      stopForNavigation: MobileRouteStop,
      preferredProvider: "apple" | "google" | "auto" = "auto",
    ) => {
      const destination = addressText(stopForNavigation).trim();

      if (!destination) {
        setError("This stop does not have a valid destination address.");
        return false;
      }

      const encodedDestination = encodeURIComponent(destination);

      const appleUrl =
        `http://maps.apple.com/?daddr=${encodedDestination}&dirflg=d`;

      const googleAppUrl =
        `comgooglemaps://?daddr=${encodedDestination}&directionsmode=driving`;

      const googleUniversalUrl =
        `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}&travelmode=driving`;

      const googleWebUrl =
        `https://maps.google.com/?daddr=${encodedDestination}&directionsmode=driving`;

      const urlCandidates =
        preferredProvider === "apple"
          ? [appleUrl, googleUniversalUrl, googleWebUrl]
          : preferredProvider === "google"
            ? [googleAppUrl, googleUniversalUrl, googleWebUrl, appleUrl]
            : Platform.OS === "ios"
              ? [appleUrl, googleUniversalUrl, googleWebUrl]
              : [`google.navigation:q=${encodedDestination}&mode=d`, googleUniversalUrl, googleWebUrl];

      for (const url of urlCandidates) {
        const supported = await Linking.canOpenURL(url);

        if (!supported) {
          continue;
        }

        await Linking.openURL(url);
        return true;
      }

      setError("No external navigation app is available on this device.");
      return false;
    }, []);

  const chooseExternalMapProviderIOS =
    useCallback(() =>
      new Promise<"apple" | "google" | null>((resolve) => {
        Alert.alert(
          "Open navigation",
          "Choose map app",
          [
            {
              text: "Apple Maps",
              onPress: () => resolve("apple"),
            },
            {
              text: "Google Maps",
              onPress: () => resolve("google"),
            },
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => resolve(null),
            },
          ],
          {
            cancelable: true,
            onDismiss: () => resolve(null),
          },
        );
      }),
    []);

  const openNavigationForStop =
    useCallback(async (stopForNavigation: MobileRouteStop) => {
      await startMyDriverShift();
      await loadShiftDashboard();

      if (carModeEnabled) {
        const provider =
          Platform.OS === "ios"
            ? await chooseExternalMapProviderIOS()
            : "google";

        if (!provider) {
          return;
        }

        const openedExternally =
          await openExternalNavigationForStop(
            stopForNavigation,
            provider,
          );

        if (openedExternally) {
          return;
        }
      }

      setNavigationStop(stopForNavigation);
    }, [
      carModeEnabled,
      chooseExternalMapProviderIOS,
      loadShiftDashboard,
      openExternalNavigationForStop,
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

const activeStopMarkerColor =
  activeStop
    ? stopMarkerColor(
        activeStop,
      )
    : null;

useEffect(() => {
    setDriverNotesDraft(
      String(
        activeStop?.driver_notes || "",
      ),
    );

    setDriverNotesExpanded(
      Boolean(
        String(
          activeStop?.driver_notes || "",
        ).trim(),
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

  useEffect(() => {
    let cancelled = false;

    async function loadProofPhotos() {
      const stopId = String(
        activeStop?.id || "",
      );

      const bookingId = String(
        activeStop?.booking_id || "",
      );

      if (!stopId || !bookingId) {
        setProofPhotos([]);
        setProofPhotosLoading(false);
        return;
      }

      setProofPhotosLoading(true);

      try {
        const photos =
          await listMyRouteStopProofPhotos({
            stopId,
            bookingId,
          });

        if (!cancelled) {
          setProofPhotos(photos);
        }
      } catch (photoListError) {
        if (!cancelled) {
          console.warn(
            "[Route] Could not load proof photos:",
            photoListError,
          );

          setProofPhotos([]);
        }
      } finally {
        if (!cancelled) {
          setProofPhotosLoading(false);
        }
      }
    }

    void loadProofPhotos();

    return () => {
      cancelled = true;
    };
  }, [
    activeStop?.booking_id,
    activeStop?.id,
  ]);


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

  const activeStopType = String(
    activeStop?.stop_type || "",
  ).toLowerCase();

  const activeIsPickup =
    activeStopType === "pickup";

  const activeProofRequired =
    Boolean(activeStop) &&
    !Boolean(
      activeStop?.proof_photo_uploaded,
    );

  const activeProofBlockingRequired =
    activeProofRequired &&
    !activeIsPickup;

  const proofPhotoCount =
    proofPhotos.length;

  const activeHasProof =
    proofPhotoCount > 0 ||
    Boolean(activeStop?.proof_photo_uploaded);

  const proofPhotoLimitReached =
    proofPhotoCount >= 3;

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
      activeProofBlockingRequired
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

  const quickNavigateAvailable =
    Boolean(activeStop) &&
    (
      activeStatus === "on_the_way" ||
      activeAction?.status === "on_the_way"
    );

  const stickyActionLabel =
    activeAction?.label ||
    "Continue";

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

          await openNavigationForStop({
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
      openNavigationForStop,
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

  const messageCustomer =
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

      const url = `sms:${phone}`;

      const supported =
        await Linking.canOpenURL(
          url,
        );

      if (!supported) {
        setError(
          "SMS is not available on this device.",
        );
        return;
      }

      await Linking.openURL(url);
    }, [
      activeStop?.customer_phone,
    ]);

  const uploadProofPhotoAsset =
    useCallback(async (
      asset: ImagePicker.ImagePickerAsset,
    ) => {
      if (
        !activeStop ||
        !activeStop.booking_id
      ) {
        throw new Error(
          "This stop is not linked to a booking.",
        );
      }

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
    }, [
      activeStop,
    ]);

  const pickProofPhoto =
    useCallback(async (
      source: "camera" | "library",
    ) => {
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

      if (proofPhotoLimitReached) {
        setError(
          "You can upload up to 3 proof photos per stop.",
        );
        return;
      }

      setError("");
      setStopToolPending("photo");

      try {
        const permission =
          source === "camera"
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
          throw new Error(
            source === "camera"
              ? "Camera permission is required to take a proof photo."
              : "Photo library permission is required to upload a proof photo.",
          );
        }

        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync(
                {
                  mediaTypes:
                    ImagePicker
                      .MediaTypeOptions
                      .Images,
                  allowsEditing: false,
                  quality: 0.75,
                },
              )
            : await ImagePicker.launchImageLibraryAsync(
                {
                  mediaTypes:
                    ImagePicker
                      .MediaTypeOptions
                      .Images,
                  allowsEditing: false,
                  quality: 0.75,
                  selectionLimit: 1,
                },
              );

        if (
          result.canceled ||
          !result.assets?.length
        ) {
          return;
        }

        await uploadProofPhotoAsset(
          result.assets[0],
        );

        await loadRoute(
          "refresh",
        );

        const photos =
          await listMyRouteStopProofPhotos({
            stopId: activeStop.id,
            bookingId: activeStop.booking_id,
          });

        setProofPhotos(photos);
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
      proofPhotoLimitReached,
      stopToolPending,
      uploadProofPhotoAsset,
    ]);

  const takeProofPhoto =
    useCallback(() => {
      if (
        !activeStop ||
        stopToolPending
      ) {
        return;
      }

      Alert.alert(
        "Proof photo",
        "Choose how to add a proof photo.",
        [
          {
            text: "Take Photo",
            onPress: () => {
              void pickProofPhoto(
                "camera",
              );
            },
          },
          {
            text: "Upload Photo",
            onPress: () => {
              void pickProofPhoto(
                "library",
              );
            },
          },
          {
            text: "Cancel",
            style: "cancel",
          },
        ],
      );
    }, [
      activeStop,
      pickProofPhoto,
      stopToolPending,
    ]);

  const deleteProofPhoto =
    useCallback((
      photo: MobileRouteStopProofPhoto,
    ) => {
      const bookingId = String(
        activeStop?.booking_id || "",
      );

      if (
        !activeStop ||
        !bookingId ||
        stopToolPending
      ) {
        return;
      }

      Alert.alert(
        "Delete photo",
        "Remove this proof photo?",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void (async () => {
                setError("");
                setStopToolPending("photo");

                try {
                  await deleteMyRouteStopProofPhoto(
                    {
                      stopId:
                        activeStop.id,
                      bookingId:
                        bookingId,
                      photoId:
                        photo.id,
                      storagePath:
                        photo.storage_path,
                    },
                  );

                  await loadRoute(
                    "refresh",
                  );

                  const photos =
                    await listMyRouteStopProofPhotos({
                      stopId:
                        activeStop.id,
                      bookingId:
                        bookingId,
                    });

                  setProofPhotos(
                    photos,
                  );
                } catch (
                  deleteError
                ) {
                  setError(
                    deleteError instanceof
                      Error
                      ? deleteError.message
                      : "Could not delete the proof photo.",
                  );
                } finally {
                  setStopToolPending(
                    null,
                  );
                }
              })();
            },
          },
        ],
      );
    }, [
      activeStop,
      loadRoute,
      stopToolPending,
    ]);

  const closePaymentModal =
    useCallback(() => {
      if (paymentModalBusy) {
        return;
      }

      setPaymentModalOpen(false);
      setPaymentModalError("");
      setPaymentModalMethod("cash");
    }, [paymentModalBusy]);

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

      setPaymentModalMethod("cash");
      setPaymentModalError("");
      setPaymentModalOpen(true);
    }, [
      activeStop,
      stopToolPending,
    ]);

  const confirmManualPayment =
    useCallback(async () => {
      if (
        !activeStop ||
        stopToolPending ||
        paymentModalBusy
      ) {
        return;
      }

      if (paymentModalMethod === "card") {
        setPaymentModalError(
          "Card payment is coming in the next step.",
        );
        return;
      }

      setStopToolPending("payment");
      setPaymentModalBusy(true);
      setPaymentModalError("");
      setError("");

      try {
        const result =
          await collectDriverManualPaymentFromMobile({
            stopId: activeStop.id,
            method:
              paymentModalMethod as MobileDriverManualPaymentMethod,
          });

        if (!result.success || !result.data) {
          setPaymentModalError(
            result.error ||
              "Could not collect payment.",
          );
          return;
        }

        await loadRoute("refresh");

        setPaymentModalOpen(false);
        setPaymentModalMethod("cash");
        setPaymentModalError("");

        Alert.alert(
          result.data.reportStatus === "already_reported"
            ? "Payment already reported"
            : result.data.reportStatus === "no_balance_due"
              ? "No balance due"
              : "Payment reported",
          result.data.reportStatus === "already_reported"
            ? "Payment already reported for this stop. Route data was refreshed."
            : result.data.reportStatus === "no_balance_due"
              ? "This stop currently has no balance due to report. Route data was refreshed."
              : `${moneyText(result.data.amountRecorded)} was reported via ${paymentModalMethod.toUpperCase()}.`,
        );
      } catch (paymentError) {
        setPaymentModalError(
          paymentError instanceof Error
            ? paymentError.message
            : "Could not collect payment.",
        );
      } finally {
        setPaymentModalBusy(false);
        setStopToolPending(null);
      }
    }, [
      activeStop,
      loadRoute,
      paymentModalBusy,
      paymentModalMethod,
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
        carModeDefault={carModeEnabled}
        muteDefault={navigationMuted}
        onCarModeChange={setCarModeEnabled}
        onMuteChange={setNavigationMuted}
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        activeStop
          ? styles.contentWithStickyAction
          : null,
      ]}
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
            numberOfLines={1}
            ellipsizeMode="tail"
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

        <Pressable
          onPress={() =>
            setCarModeEnabled((value) => !value)
          }
          style={({ pressed }) => [
            styles.carModeButton,
            carModeEnabled ? styles.carModeButtonActive : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text
            style={[
              styles.carModeButtonText,
              carModeEnabled ? styles.carModeButtonTextActive : null,
            ]}
          >
            CAR
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
        {dayOfMonth(selectedDate)}
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
              style={[
                styles.currentCard,
                activeStopMarkerColor
                  ? {
                      borderWidth: 2,
                      borderColor:
                        activeStopMarkerColor,
                    }
                  : null,
              ]}
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
                  styles.currentAddress
                }
              >
                {addressText(
                  activeStop,
                ) ||
                  "Address not available"}
              </Text>

              <Text
                style={
                  styles.currentCustomerCompact
                }
              >
                {activeStop.customer_name ||
                  "Customer"}
              </Text>

              {isManualStopSelection &&
              nextScheduledStop ? (
                <View style={styles.manualSelectionBanner}>
                  <View style={styles.manualSelectionCopy}>
                    <Text style={styles.manualSelectionLabel}>
                      {activeStopPosition
                        ? `VIEWING STOP ${activeStopPosition}`
                        : "VIEWING STOP"}
                    </Text>
                    <Text style={styles.manualSelectionText}>
                      {`Your next scheduled stop is #${deliverySequenceByStopId.get(nextScheduledStop.id) || "?"}.`}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => setSelectedStopId(null)}
                    style={({ pressed }) => [
                      styles.returnToNextButton,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={styles.returnToNextButtonText}>
                      {`Return to Stop ${deliverySequenceByStopId.get(nextScheduledStop.id) || ""}`.trim()}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.primaryActionsRow}>
                <Pressable
                  disabled={
                    !quickNavigateAvailable ||
                    actionPending ||
                    Boolean(openBreak)
                  }
                  onPress={() => {
                    if (!activeStop) {
                      return;
                    }

                    setError("");

                    if (activeStatus === "on_the_way") {
                      void openNavigationForStop(activeStop).catch((navigationError) => {
                        setError(
                          navigationError instanceof Error
                            ? navigationError.message
                            : "Could not start navigation.",
                        );
                      });

                      return;
                    }

                    void runActiveAction();
                  }}
                  style={({ pressed }) => [
                    styles.primaryActionButton,
                    styles.primaryActionNavigate,
                    pressed ? styles.pressed : null,
                    !quickNavigateAvailable || actionPending || Boolean(openBreak)
                      ? styles.disabledButton
                      : null,
                  ]}
                >
                  <Text style={styles.primaryActionNavigateText}>Navigate</Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    void callCustomer()
                  }
                  style={({ pressed }) => [
                    styles.primaryActionButton,
                    styles.primaryActionSecondary,
                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <Text style={styles.primaryActionSecondaryText}>Call</Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    void messageCustomer()
                  }
                  style={({ pressed }) => [
                    styles.primaryActionButton,
                    styles.primaryActionSecondary,
                    pressed
                      ? styles.pressed
                      : null,
                  ]}
                >
                  <Text style={styles.primaryActionSecondaryText}>Message</Text>
                </Pressable>
              </View>

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
                    EVENT INFO
                  </Text>

                  <Text
                    style={
                      styles.detailText
                    }
                  >
                    {privateDriverNote(activeStop)}
                  </Text>

                  {activeStop.weather ? (
                    <Text style={styles.detailMetaText}>
                      {activeStop.weather.temperatureF != null
                        ? `${Math.round(activeStop.weather.temperatureF)}°F`
                        : "Weather"}
                      {activeStop.weather.condition
                        ? ` · ${activeStop.weather.condition}`
                        : ""}
                      {" · Wind "}
                      {activeStop.weather.windMph != null
                        ? `${Math.round(activeStop.weather.windMph)} mph`
                        : "—"}
                      {activeStop.weather.gustMph != null
                        ? ` · Gusts ${Math.round(activeStop.weather.gustMph)} mph`
                        : ""}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View
                style={
                  styles.operationBlock
                }
              >
                <View
                  style={
                    styles.paymentSummaryHeader
                  }
                >
                  <View
                    style={
                      styles.paymentSummaryCopy
                    }
                  >
                    <Text
                      style={
                        styles.operationLabel
                      }
                    >
                      {activePaymentRequired
                        ? "PAYMENT DUE"
                        : "PAYMENT"}
                    </Text>

                    <Text
                      style={[
                        styles.paymentSummaryAmount,
                        !activePaymentRequired
                          ? styles.paymentSummaryAmountDone
                          : null,
                      ]}
                    >
                      {activePaymentRequired
                        ? moneyText(
                            activeStop.balance_due,
                          )
                        : "✓ No payment required"}
                    </Text>
                  </View>

                  {activePaymentRequired ? (
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
                  ) : null}
                </View>
              </View>

              <View
                style={
                  styles.operationBlock
                }
              >
                <Text style={styles.operationLabel}>
                  COMPLETE THIS STOP
                </Text>

                <View style={styles.requirementList}>

                  <View style={styles.requirementRow}>
                    <View style={styles.requirementCopy}>
                      <Text style={[styles.requirementTitle, activeHasProof ? styles.requirementTitleDone : null]}>
                        {activeHasProof ? "✓ Proof photo" : "○ Proof photo"}
                      </Text>
                      <Text style={[styles.requirementStatus, activeHasProof ? styles.requirementStatusDone : null]}>
                        {proofPhotosLoading
                          ? "Loading photos..."
                          : activeHasProof
                            ? `${proofPhotoCount}/3 uploaded`
                            : activeIsPickup
                              ? "Optional for pickup"
                              : "Required before completion"}
                      </Text>
                    </View>

                    <Pressable
                      disabled={stopToolPending !== null || proofPhotoLimitReached}
                      onPress={takeProofPhoto}
                      style={({ pressed }) => [
                        styles.requirementAction,
                        pressed ? styles.pressed : null,
                        stopToolPending !== null || proofPhotoLimitReached
                          ? styles.disabledButton
                          : null,
                      ]}
                    >
                      {stopToolPending === "photo" ? (
                        <ActivityIndicator size="small" color="#23313f" />
                      ) : (
                        <Text style={styles.requirementActionText}>
                          {proofPhotoLimitReached ? "3/3" : "Take Photo"}
                        </Text>
                      )}
                    </Pressable>
                  </View>

                  <View style={styles.requirementRow}>
                    <View style={styles.requirementCopy}>
                      <Text style={[styles.requirementTitle, checklistComplete ? styles.requirementTitleDone : null]}>
                        {checklistComplete ? "✓" : "○"} {checklistField === "picked_up" ? "Pickup checklist" : "Delivery checklist"}
                      </Text>
                      <Text style={[styles.requirementStatus, checklistComplete ? styles.requirementStatusDone : null]}>
                        {checklistLoading
                          ? "Loading..."
                          : checklistItems.length === 0
                            ? "No checklist items"
                            : `${checklistCompletedCount} of ${checklistItems.length} checked`}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => setChecklistOpen(true)}
                      style={({ pressed }) => [
                        styles.requirementActionGhost,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <Text style={styles.requirementActionGhostText}>Open ›</Text>
                    </Pressable>
                  </View>

                  {handoverAvailable ? (
                    <View style={styles.requirementRow}>
                      <View style={styles.requirementCopy}>
                        <Text style={styles.requirementTitle}>○ Customer signature</Text>
                        <Text style={styles.requirementStatus}>Open handover and sign delivery acceptance</Text>
                      </View>

                      <Pressable
                        onPress={() => setHandoverOpen(true)}
                        style={({ pressed }) => [
                          styles.requirementActionGhost,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text style={styles.requirementActionGhostText}>Open ›</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>

                <View style={styles.proofPhotoRow}>
                  {proofPhotos.map((photo) => (
                    <View key={photo.id} style={styles.proofPhotoThumbWrap}>
                      <Image
                        source={{ uri: photo.photo_url || undefined }}
                        style={styles.proofPhotoThumb}
                      />

                      <Pressable
                        onPress={() => deleteProofPhoto(photo)}
                        disabled={stopToolPending !== null}
                        style={({ pressed }) => [
                          styles.proofPhotoDelete,
                          pressed ? styles.pressed : null,
                          stopToolPending !== null ? styles.disabledButton : null,
                        ]}
                      >
                        <Text style={styles.proofPhotoDeleteText}>×</Text>
                      </Pressable>
                    </View>
                  ))}

                  {proofPhotosLoading ? (
                    <View style={styles.proofPhotoHintWrap}>
                      <Text style={styles.proofPhotoHintText}>Loading...</Text>
                    </View>
                  ) : proofPhotos.length === 0 ? (
                    <View style={styles.proofPhotoHintWrap}>
                      <Text style={styles.proofPhotoHintText}>
                        {activeIsPickup
                          ? "Proof photo is optional for pickup."
                          : "Add at least one proof photo for delivery completion."}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* DRIVER NOTES */}

              <View
                style={
                  styles.operationBlock
                }
              >
                <Pressable
                  onPress={() =>
                    setDriverNotesExpanded((value) => !value)
                  }
                  style={({ pressed }) => [
                    styles.driverNotesToggle,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.operationLabel}>DRIVER NOTES</Text>
                  <Text style={styles.driverNotesToggleText}>
                    {driverNotesExpanded ? "Hide" : "+ Add driver note"}
                  </Text>
                </Pressable>

                {!driverNotesExpanded && String(driverNotesDraft || "").trim() ? (
                  <Text style={styles.driverNotesPreview} numberOfLines={2}>
                    {driverNotesDraft}
                  </Text>
                ) : null}

                {driverNotesExpanded ? (
                  <>
                    <TextInput
                      value={
                        driverNotesDraft
                      }
                      onChangeText={
                        setDriverNotesDraft
                      }
                      placeholder={activeIsPickup ? "Add pickup notes, access issues..." : "Add delivery notes, customer requests, access issues..."}
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
                  </>
                ) : null}
              </View>
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

                  const markerColor =
                    stopMarkerColor(
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

                        markerColor
                          ? {
                              borderColor:
                                `${markerColor}55`,
                            }
                          : null,

                        activeStop?.id ===
                        stop.id
                          ? styles.stopRowSelected
                          : null,

                        activeStop?.id ===
                          stop.id &&
                        markerColor
                          ? {
                              borderColor:
                                markerColor,
                            }
                          : null,

                        pressed
                          ? styles.pressed
                          : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.stopMarkerStripe,
                          markerColor
                            ? {
                                backgroundColor:
                                  markerColor,
                              }
                            : styles.stopMarkerStripeFallback,
                        ]}
                      />

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

                        {stop.weather ? (
                          <Text
                            style={{ color: "#5f735c", fontSize: 11, fontWeight: "800", marginTop: 5 }}
                            numberOfLines={1}
                          >
                            {stop.weather.temperatureF != null ? `${Math.round(stop.weather.temperatureF)}°` : "Weather"}
                            {" · Wind "}
                            {stop.weather.windMph != null ? `${Math.round(stop.weather.windMph)} mph` : "—"}
                            {stop.weather.gustMph != null ? ` · Gusts ${Math.round(stop.weather.gustMph)} mph` : ""}
                          </Text>
                        ) : null}

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

                          <View style={styles.stopTagRow}>
                            {nextScheduledStop?.id === stop.id && !completed ? (
                              <Text style={[styles.stopSelectedLabel, styles.stopTagNext]}>
                                Next
                              </Text>
                            ) : null}

                            {completed ? (
                              <Text style={[styles.stopSelectedLabel, styles.stopTagDone]}>
                                Done
                              </Text>
                            ) : null}

                            {activeStop?.id === stop.id ? (
                              <Text style={styles.stopSelectedLabel}>
                                Selected
                              </Text>
                            ) : null}
                          </View>
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
        visible={paymentModalOpen}
        transparent
        animationType="slide"
        onRequestClose={closePaymentModal}
      >
        <View style={styles.paymentModalBackdrop}>
          <Pressable
            style={styles.paymentModalDismissArea}
            onPress={closePaymentModal}
          />

          <View style={styles.paymentSheet}>
            <View style={styles.paymentSheetHandle} />

            <View style={styles.paymentSheetHeader}>
              <Text style={styles.paymentSheetEyebrow}>
                COLLECT PAYMENT
              </Text>
              <Text style={styles.paymentSheetTitle}>
                Balance Due
              </Text>
              <Text style={styles.paymentSheetAmount}>
                {moneyText(activeStop?.balance_due || 0)}
              </Text>
            </View>

            <View style={styles.paymentMethodRow}>
              {(["cash", "zelle", "venmo", "card"] as PaymentModalMethod[]).map((method) => {
                const active = paymentModalMethod === method;

                return (
                  <Pressable
                    key={method}
                    disabled={paymentModalBusy}
                    onPress={() => {
                      setPaymentModalMethod(method);
                      setPaymentModalError("");
                    }}
                    style={({ pressed }) => [
                      styles.paymentMethodChip,
                      active ? styles.paymentMethodChipActive : null,
                      pressed ? styles.pressed : null,
                      paymentModalBusy ? styles.disabledButton : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.paymentMethodChipText,
                        active ? styles.paymentMethodChipTextActive : null,
                      ]}
                    >
                      {method === "card"
                        ? "Card"
                        : method.charAt(0).toUpperCase() + method.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.paymentMethodBody}>
              {paymentModalMethod === "cash" ? (
                <>
                  <Text style={styles.paymentMethodBodyTitle}>Cash</Text>
                  <Text style={styles.paymentMethodBodyCopy}>
                    Amount due: {moneyText(activeStop?.balance_due || 0)}
                  </Text>
                </>
              ) : null}

              {paymentModalMethod === "zelle" ? (
                <>
                  <Text style={styles.paymentMethodBodyTitle}>Zelle</Text>
                  <Text style={styles.paymentMethodBodyCopy}>FANSOUNDS CORP</Text>
                  <Text style={styles.paymentMethodBodyCopy}>
                    Amount due: {moneyText(activeStop?.balance_due || 0)}
                  </Text>
                  <View style={styles.paymentQrBox}>
                    <Image
                      source={ZELLE_QR_ASSET}
                      style={styles.paymentQrImage}
                      resizeMode="contain"
                    />
                  </View>
                  <Text style={styles.paymentMethodBodyCopy}>
                    Show the QR to the customer. Confirm only after payment is actually received.
                  </Text>
                </>
              ) : null}

              {paymentModalMethod === "venmo" ? (
                <>
                  <Text style={styles.paymentMethodBodyTitle}>Venmo</Text>
                  <Text style={styles.paymentMethodBodyCopy}>@bouncepartyla · Fansounds Corp</Text>
                  <Text style={styles.paymentMethodBodyCopy}>
                    Amount due: {moneyText(activeStop?.balance_due || 0)}
                  </Text>
                  <View style={styles.paymentQrBox}>
                    <Image
                      source={VENMO_QR_ASSET}
                      style={styles.paymentQrImage}
                      resizeMode="contain"
                    />
                  </View>
                  <Text style={styles.paymentMethodBodyCopy}>
                    Show the QR to the customer. Confirm only after payment is actually received.
                  </Text>
                </>
              ) : null}

              {paymentModalMethod === "card" ? (
                <>
                  <Text style={styles.paymentMethodBodyTitle}>Card</Text>
                  <Text style={styles.paymentMethodBodyCopy}>
                    Card payment is coming in the next step. Manual card marking is disabled in this phase.
                  </Text>
                </>
              ) : null}
            </View>

            {paymentModalError ? (
              <View style={styles.paymentModalErrorCard}>
                <Text style={styles.paymentModalErrorText}>{paymentModalError}</Text>
              </View>
            ) : null}

            <View style={styles.paymentSheetActions}>
              <Pressable
                disabled={paymentModalBusy}
                onPress={closePaymentModal}
                style={({ pressed }) => [
                  styles.paymentSecondaryButton,
                  pressed ? styles.pressed : null,
                  paymentModalBusy ? styles.disabledButton : null,
                ]}
              >
                <Text style={styles.paymentSecondaryButtonText}>Close</Text>
              </Pressable>

              {paymentModalMethod === "card" ? (
                <View style={styles.paymentCardDisabledButton}>
                  <Text style={styles.paymentCardDisabledButtonText}>Card payment coming next</Text>
                </View>
              ) : (
                <Pressable
                  disabled={paymentModalBusy}
                  onPress={() => {
                    void confirmManualPayment();
                  }}
                  style={({ pressed }) => [
                    styles.paymentPrimaryButton,
                    pressed ? styles.pressed : null,
                    paymentModalBusy ? styles.disabledButton : null,
                  ]}
                >
                  {paymentModalBusy ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.paymentPrimaryButtonText}>
                      {paymentModalMethod === "cash"
                        ? "Confirm cash received"
                        : paymentModalMethod === "zelle"
                          ? "Confirm Zelle received"
                          : "Confirm Venmo received"}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>

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
      {route && activeStop && activeAction?.status ? (
        <View style={styles.stickyActionWrap} pointerEvents="box-none">
          <View style={styles.stickyActionCard}>
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
                styles.stickyPrimaryButton,
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
                  {stickyActionLabel}
                </Text>
              )}
            </Pressable>

          </View>
        </View>
      ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f1e8",
  },

  screen: {
    flex: 1,
    backgroundColor: "#f5f1e8",
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 48,
  },

  contentWithStickyAction: {
    paddingBottom: 168,
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
    minWidth: 0,
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

  carModeButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d1c8bb",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 52,
    paddingHorizontal: 10,
  },

  carModeButtonActive: {
    backgroundColor: "#23313f",
    borderColor: "#23313f",
  },

  carModeButtonText: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  carModeButtonTextActive: {
    color: "#ffffff",
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

  contactActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },

  iconActionButton: {
    alignItems: "center",
    backgroundColor: "#2f8d67",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 46,
  },

  iconActionButtonDark: {
    backgroundColor: "#23313f",
  },

  iconActionText: {
    color: "#ffffff",
    fontSize: 18,
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
    gap: 12,
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

  currentCustomerCompact: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
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

  detailMetaText: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 7,
  },

  manualSelectionBanner: {
    backgroundColor: "rgba(240,201,135,0.12)",
    borderColor: "rgba(240,201,135,0.35)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 14,
    padding: 12,
  },

  manualSelectionCopy: {
    gap: 5,
  },

  manualSelectionLabel: {
    color: "#f0c987",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  manualSelectionText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "700",
  },

  primaryActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },

  primaryActionButton: {
    alignItems: "center",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 12,
  },

  primaryActionNavigate: {
    backgroundColor: "#f0c987",
    flex: 1.25,
  },

  primaryActionNavigateText: {
    color: "#23313f",
    fontSize: 13,
    fontWeight: "900",
  },

  primaryActionSecondary: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    flex: 1,
  },

  primaryActionSecondaryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },

  paymentSummaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  paymentSummaryCopy: {
    flex: 1,
    minWidth: 0,
  },

  paymentSummaryAmount: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 4,
  },

  paymentSummaryAmountDone: {
    color: "#b9d9b4",
    fontSize: 18,
  },

  requirementList: {
    gap: 9,
    marginTop: 10,
  },

  requirementRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },

  requirementCopy: {
    flex: 1,
    minWidth: 0,
  },

  requirementTitle: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },

  requirementTitleDone: {
    color: "#b9d9b4",
  },

  requirementStatus: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  requirementStatusDone: {
    color: "rgba(185,217,180,0.9)",
  },

  requirementAction: {
    alignItems: "center",
    backgroundColor: "#f0c987",
    borderRadius: 11,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 90,
    paddingHorizontal: 10,
  },

  requirementActionText: {
    color: "#23313f",
    fontSize: 11,
    fontWeight: "900",
  },

  requirementActionGhost: {
    alignItems: "center",
    borderColor: "rgba(240,201,135,0.55)",
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 90,
    paddingHorizontal: 10,
  },

  requirementActionGhostText: {
    color: "#f0c987",
    fontSize: 11,
    fontWeight: "800",
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

  driverNotesToggle: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },

  driverNotesToggleText: {
    color: "#f0c987",
    fontSize: 11,
    fontWeight: "800",
  },

  driverNotesPreview: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 8,
  },

  stickyActionWrap: {
    bottom: 8,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 10,
  },

  stickyActionCard: {
    marginHorizontal: 18,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "#e2d6c5",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 9,
  },

  stickyPrimaryButton: {
    marginTop: 0,
    minHeight: 50,
  },

  stickyActionHint: {
    color: "#6c6258",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
    marginTop: 6,
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
    borderColor: "#efe6da",
    borderRadius: 18,
    borderWidth: 2,
    marginBottom: 10,
    padding: 12,
  },

  stopRowSelected: {
    borderColor: "#b88645",
  },

  stopMarkerStripe: {
    alignSelf: "stretch",
    borderRadius: 999,
    marginRight: 10,
    width: 4,
  },

  stopMarkerStripeFallback: {
    backgroundColor: "#e8ded2",
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

  stopTagRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },

  stopTagNext: {
    color: "#5f8faa",
  },

  stopTagDone: {
    color: "#5f735c",
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

  proofPhotoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },

  proofPhotoThumbWrap: {
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    borderWidth: 1,
    height: 62,
    overflow: "hidden",
    position: "relative",
    width: 62,
  },

  proofPhotoThumb: {
    backgroundColor: "rgba(255,255,255,0.08)",
    height: "100%",
    width: "100%",
  },

  proofPhotoDelete: {
    alignItems: "center",
    backgroundColor: "rgba(10,15,20,0.78)",
    borderRadius: 999,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: 4,
    top: 4,
    width: 20,
  },

  proofPhotoDeleteText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 16,
  },

  proofPhotoHintWrap: {
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 160,
  },

  proofPhotoHintText: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
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

  paymentModalBackdrop: {
    backgroundColor: "rgba(20,27,34,0.5)",
    flex: 1,
    justifyContent: "flex-end",
  },

  paymentModalDismissArea: {
    flex: 1,
  },

  paymentSheet: {
    backgroundColor: "#f5f1e8",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 10,
  },

  paymentSheetHandle: {
    alignSelf: "center",
    backgroundColor: "#c7bfb4",
    borderRadius: 999,
    height: 5,
    marginBottom: 12,
    width: 42,
  },

  paymentSheetHeader: {
    borderBottomColor: "#dfd8ce",
    borderBottomWidth: 1,
    paddingBottom: 12,
  },

  paymentSheetEyebrow: {
    color: "#b88645",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  paymentSheetTitle: {
    color: "#23313f",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 4,
  },

  paymentSheetAmount: {
    color: "#23313f",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 4,
  },

  paymentMethodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },

  paymentMethodChip: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d7ccbf",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 74,
    paddingHorizontal: 12,
  },

  paymentMethodChipActive: {
    backgroundColor: "#23313f",
    borderColor: "#23313f",
  },

  paymentMethodChipText: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "900",
  },

  paymentMethodChipTextActive: {
    color: "#ffffff",
  },

  paymentMethodBody: {
    backgroundColor: "#23313f",
    borderRadius: 18,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },

  paymentMethodBodyTitle: {
    color: "#f0c987",
    fontSize: 16,
    fontWeight: "900",
  },

  paymentMethodBodyCopy: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 6,
  },

  paymentQrBox: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },

  paymentQrMissingTitle: {
    color: "#f0c987",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },

  paymentQrMissingCopy: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },

  paymentQrImage: {
    height: 170,
    width: "100%",
  },

  paymentModalErrorCard: {
    backgroundColor: "#fbe9e6",
    borderColor: "#e8b4aa",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  paymentModalErrorText: {
    color: "#8d2f1f",
    fontSize: 12,
    fontWeight: "700",
  },

  paymentSheetActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },

  paymentSecondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d7ccbf",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },

  paymentSecondaryButtonText: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "900",
  },

  paymentPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#c9964f",
    borderRadius: 12,
    flex: 1.4,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },

  paymentPrimaryButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },

  paymentCardDisabledButton: {
    alignItems: "center",
    backgroundColor: "#d7ccbf",
    borderRadius: 12,
    flex: 1.4,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },

  paymentCardDisabledButtonText: {
    color: "#6f6457",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
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
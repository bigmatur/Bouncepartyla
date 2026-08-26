import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import {
  CameraPerspective,
  NavigationSessionStatus,
  NavigationView,
  RouteStatus,
  TravelMode,
  useNavigation,
  type ArrivalEvent,
  type NavigationViewController,
} from "@googlemaps/react-native-navigation-sdk";

import type { MobileRouteStop } from "../features/routes/driverRoutes";

type Props = {
  stop: MobileRouteStop;
  onClose: () => void;
  onArrived: () => Promise<void>;
};

type TripProgress = {
  seconds: number;
  meters: number;
};

function destinationAddress(stop: MobileRouteStop) {
  return [stop.address, stop.city, stop.state, stop.zip]
    .filter(Boolean)
    .join(", ");
}

function stopTypeLabel(stop: MobileRouteStop) {
  return String(stop.stop_type || "").toLowerCase() === "pickup"
    ? "Pickup"
    : "Delivery";
}

function navigationErrorMessage(status: NavigationSessionStatus) {
  switch (status) {
    case NavigationSessionStatus.NOT_AUTHORIZED:
      return "Google Navigation is not authorized for this app build.";

    case NavigationSessionStatus.TERMS_NOT_ACCEPTED:
      return "Google Navigation terms must be accepted before guidance can start.";

    case NavigationSessionStatus.LOCATION_PERMISSION_MISSING:
      return "Location permission is required for navigation.";

    case NavigationSessionStatus.NETWORK_ERROR:
      return "Google Navigation could not connect to the network.";

    default:
      return `Google Navigation could not initialize (${String(status)}).`;
  }
}

function formatRemainingTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--";

  const minutes = Math.max(1, Math.round(seconds / 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0
    ? `${hours} hr ${remainingMinutes} min`
    : `${hours} hr`;
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return "--";

  const miles = meters / 1609.344;

  if (miles < 0.1) {
    return `${Math.max(0, Math.round(meters * 3.28084))} ft`;
  }

  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--";

  const eta = new Date(Date.now() + seconds * 1000);

  return eta.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NavigationScreen({ stop, onClose, onArrived }: Props) {
  const {
    navigationController,
    removeAllListeners,
    setOnArrival,
    setOnLocationChanged,
    setOnRemainingTimeOrDistanceChanged,
  } = useNavigation();

  const [destination, setDestination] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [hasNavigatorLocation, setHasNavigatorLocation] = useState(false);
  const [tripProgress, setTripProgress] = useState<TripProgress | null>(null);

  const [starting, setStarting] = useState(true);
  const [arrivedDetected, setArrivedDetected] = useState(false);
  const [arrivalPending, setArrivalPending] = useState(false);
  const [error, setError] = useState("");

  const [navigationViewController, setNavigationViewController] =
    useState<NavigationViewController | null>(null);

  const routeStartedRef = useRef(false);
  const mountedRef = useRef(true);
  const navigatorLocationReceivedRef = useRef(false);

  const address = useMemo(() => destinationAddress(stop), [stop]);

  const refreshTripProgress = useCallback(async () => {
    try {
      const progress = (await navigationController.getCurrentTimeAndDistance()) as
        | { seconds?: number; meters?: number }
        | null;

      if (!mountedRef.current || !progress) return;

      const seconds = Number(progress.seconds);
      const meters = Number(progress.meters);

      if (!Number.isFinite(seconds) || !Number.isFinite(meters)) return;

      setTripProgress({ seconds, meters });
    } catch (progressError) {
      console.warn(
        "[Navigation] Could not read current time and distance:",
        progressError,
      );
    }
  }, [navigationController]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveDestination() {
      setError("");

      if (!address) {
        setStarting(false);
        setError("This stop does not have a delivery address.");
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();

      if (cancelled) return;

      if (permission.status !== "granted") {
        setStarting(false);
        setError(
          "Location permission is required for turn-by-turn navigation.",
        );
        return;
      }

      try {
        console.log("[Navigation] Geocoding:", address);

        const matches = await Location.geocodeAsync(address);

        if (cancelled) return;

        const first = matches[0];

        if (!first) {
          setStarting(false);
          setError(`Could not locate this address: ${address}`);
          return;
        }

        const resolvedDestination = {
          lat: first.latitude,
          lng: first.longitude,
        };

        console.log("[Navigation] Destination resolved:", resolvedDestination);

        setDestination(resolvedDestination);
      } catch (geocodeError) {
        if (cancelled) return;

        console.error("[Navigation] Geocoding error:", geocodeError);

        setStarting(false);

        setError(
          geocodeError instanceof Error
            ? geocodeError.message
            : "Could not resolve the stop address.",
        );
      }
    }

    void resolveDestination();

    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    setOnLocationChanged((location: any) => {
      const lat = Number(location?.lat);
      const lng = Number(location?.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.warn(
          "[Navigation] Location callback without valid coordinates:",
          location,
        );
        return;
      }

      if (!navigatorLocationReceivedRef.current) {
        navigatorLocationReceivedRef.current = true;

        console.log("[Navigation] First valid navigator location:", {
          lat,
          lng,
          accuracy: location?.accuracy,
        });
      }

      setHasNavigatorLocation(true);
    });

    setOnRemainingTimeOrDistanceChanged(() => {
      void refreshTripProgress();
    });

    setOnArrival((event: ArrivalEvent) => {
      console.log("[Navigation] Arrival event:", event);

      if (!event.isFinalDestination) return;

      void navigationController.stopGuidance();

      setArrivedDetected(true);
      setStarting(false);
      void refreshTripProgress();
    });

    return () => {
      removeAllListeners();
    };
  }, [
    navigationController,
    refreshTripProgress,
    removeAllListeners,
    setOnArrival,
    setOnLocationChanged,
    setOnRemainingTimeOrDistanceChanged,
  ]);

  const initializeNavigation = useCallback(async () => {
    if (!mapReady || navigationReady) return;

    try {
      console.log("[Navigation] NavigationView ready.");

      const termsAccepted =
        await navigationController.showTermsAndConditionsDialog();

      if (!termsAccepted) {
        setStarting(false);
        setError("Google Navigation terms were not accepted.");
        return;
      }

      console.log("[Navigation] Initializing Navigation SDK...");

      const status = await navigationController.init();

      console.log("[Navigation] Navigation init status:", status);

      if (!mountedRef.current) return;

      if (status !== NavigationSessionStatus.OK) {
        setStarting(false);
        setError(navigationErrorMessage(status));
        return;
      }

      try {
        const sdkVersion = await navigationController.getNavSDKVersion();

        console.log("[Navigation] Native Navigation SDK version:", sdkVersion);
      } catch (versionError) {
        console.warn(
          "[Navigation] Could not read Navigation SDK version:",
          versionError,
        );
      }

      console.log("[Navigation] Starting navigator location updates...");

      await navigationController.startUpdatingLocation();

      if (!mountedRef.current) return;

      console.log("[Navigation] Navigation SDK ready.");

      setNavigationReady(true);
    } catch (initError) {
      if (!mountedRef.current) return;

      console.error("[Navigation] Initialization error:", initError);

      setStarting(false);

      setError(
        initError instanceof Error
          ? initError.message
          : "Could not initialize Google Navigation.",
      );
    }
  }, [mapReady, navigationController, navigationReady]);

  useEffect(() => {
    void initializeNavigation();
  }, [initializeNavigation]);

  useEffect(() => {
    if (
      !destination ||
      !navigationReady ||
      !hasNavigatorLocation ||
      routeStartedRef.current
    ) {
      return;
    }

    routeStartedRef.current = true;

    void (async () => {
      try {
        console.log("[Navigation] Calculating route to:", destination);

        const routeStatus = await navigationController.setDestinations(
          [
            {
              title: stop.customer_name || stopTypeLabel(stop),
              position: destination,
            },
          ],
          {
            routingOptions: {
              travelMode: TravelMode.DRIVING,
              avoidFerries: false,
              avoidTolls: false,
            },
            displayOptions: {
              showDestinationMarkers: true,
              showStopSigns: true,
              showTrafficLights: true,
            },
          },
        );

        console.log("[Navigation] setDestinations status:", routeStatus);

        if (!mountedRef.current) return;

        if (routeStatus !== RouteStatus.OK) {
          routeStartedRef.current = false;
          setStarting(false);

          setError(
            `Google Navigation could not calculate this route (${String(
              routeStatus,
            )}).`,
          );

          return;
        }

        console.log("[Navigation] Route calculated. Starting guidance...");

        await navigationController.startGuidance();

        console.log("[Navigation] Guidance started successfully.");

        if (!mountedRef.current) return;

        setStarting(false);
        void refreshTripProgress();
      } catch (routeError) {
        if (!mountedRef.current) return;

        console.error("[Navigation] Route start error:", routeError);

        routeStartedRef.current = false;
        setStarting(false);

        setError(
          routeError instanceof Error
            ? routeError.message
            : "Could not start route guidance.",
        );
      }
    })();
  }, [
    destination,
    hasNavigatorLocation,
    navigationController,
    navigationReady,
    refreshTripProgress,
    stop,
  ]);
    const recenterNavigation = useCallback(async () => {
    if (!navigationViewController) return;

    try {
      await navigationViewController.setFollowingPerspective(
        CameraPerspective.TILTED,
      );
    } catch (recenterError) {
      console.warn(
        "[Navigation] Could not recenter navigation camera:",
        recenterError,
      );
    }
  }, [navigationViewController]);

  const closeNavigation = useCallback(() => {
    void (async () => {
      try {
        await navigationController.stopGuidance();
      } catch {
        // Guidance may not have started yet.
      }

      try {
        navigationController.stopUpdatingLocation();
      } catch {
        // Safe cleanup only.
      }

      onClose();
    })();
  }, [navigationController, onClose]);

  const confirmArrival = useCallback(async () => {
    if (arrivalPending) return;

    setArrivalPending(true);
    setError("");

    try {
      await onArrived();

      try {
        await navigationController.stopGuidance();
      } catch {
        // Guidance may already be stopped after native arrival detection.
      }

      try {
        navigationController.stopUpdatingLocation();
      } catch {
        // Safe cleanup only.
      }

      onClose();
    } catch (arrivalError) {
      setError(
        arrivalError instanceof Error
          ? arrivalError.message
          : "Could not mark this stop as arrived.",
      );
    } finally {
      if (mountedRef.current) {
        setArrivalPending(false);
      }
    }
  }, [arrivalPending, navigationController, onArrived, onClose]);

  return (
    <View style={styles.screen}>
            <NavigationView
        style={styles.map}
        mapPadding={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 185,
        }}
        myLocationEnabled
        myLocationButtonEnabled
        trafficEnabled
        headerEnabled
        footerEnabled
        tripProgressBarEnabled
        recenterButtonEnabled={false}
        onNavigationViewControllerCreated={setNavigationViewController}
        reportIncidentButtonEnabled
        speedometerEnabled
        speedLimitIconEnabled
        onMapReady={() => {
          console.log("[Navigation] Map ready.");
          setMapReady(true);
        }}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.bottomArea} pointerEvents="box-none">
          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Navigation unavailable</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {starting && !error ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#23313f" />
              <Text style={styles.loadingText}>
                {destination && navigationReady && !hasNavigatorLocation
                  ? "Waiting for GPS…"
                  : "Preparing navigation…"}
              </Text>
            </View>
          ) : null}

          <View style={styles.destinationCard}>
            <View style={styles.destinationHeader}>
              <View style={styles.destinationIdentity}>
                <Text style={styles.typeLabel}>
                  {stopTypeLabel(stop).toUpperCase()}
                </Text>

                <Text style={styles.customer} numberOfLines={1}>
                  {stop.customer_name || "Customer"}
                </Text>
              </View>

              {arrivedDetected ? (
                <View style={styles.arrivalBadge}>
                  <Text style={styles.arrivalBadgeText}>Reached</Text>
                </View>
              ) : null}
            </View>

            {tripProgress ? (
              <View style={styles.progressRow}>
                <View style={styles.progressItem}>
                  <Text style={styles.progressValue}>
                    {formatRemainingTime(tripProgress.seconds)}
                  </Text>
                  <Text style={styles.progressLabel}>
                    ETA {formatEta(tripProgress.seconds)}
                  </Text>
                </View>

                                <View style={styles.progressDivider} />

                <View style={styles.progressItem}>
                  <Text style={styles.progressValue}>
                    {formatDistance(tripProgress.meters)}
                  </Text>
                  <Text style={styles.progressLabel}>to destination</Text>
                </View>

                <View style={styles.progressDivider} />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Recenter navigation"
                  disabled={!navigationViewController}
                  onPress={() => void recenterNavigation()}
                  style={({ pressed }) => [
                    styles.recenterButton,
                    pressed ? styles.pressed : null,
                    !navigationViewController ? styles.disabled : null,
                  ]}
                >
                  <Text style={styles.recenterButtonIcon}>◎</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              disabled={arrivalPending}
              onPress={closeNavigation}
              style={({ pressed }) => [
                styles.backButton,
                pressed ? styles.pressed : null,
                arrivalPending ? styles.disabled : null,
              ]}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>

            <Pressable
              disabled={arrivalPending}
              onPress={() => void confirmArrival()}
              style={({ pressed }) => [
                styles.arrivedButton,
                arrivedDetected ? styles.arrivedButtonDetected : null,
                pressed ? styles.pressed : null,
                arrivalPending ? styles.disabled : null,
              ]}
            >
              {arrivalPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.arrivedButtonText}>
                  {arrivedDetected ? "Confirm Arrived" : "Arrived"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#23313f",
  },

  map: {
    flex: 1,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },

  bottomArea: {
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },

  destinationCard: {
    backgroundColor: "rgba(35,49,63,0.94)",
    borderRadius: 17,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },

  destinationHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },

  destinationIdentity: {
    flex: 1,
    minWidth: 0,
  },

  typeLabel: {
    color: "#f0c987",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  customer: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 1,
  },

  arrivalBadge: {
    backgroundColor: "rgba(95,115,92,0.95)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  arrivalBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
  },

  progressRow: {
    alignItems: "stretch",
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 8,
    overflow: "hidden",
  },

  progressItem: {
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  progressDivider: {
    backgroundColor: "rgba(255,255,255,0.13)",
    width: 1,
  },

  progressValue: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

    progressLabel: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },

  recenterButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    width: 48,
  },

  recenterButtonIcon: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "700",
  },

  actionRow: {
    flexDirection: "row",
    gap: 6,
  },

  backButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 18,
  },

  backButtonText: {
    color: "#23313f",
    fontSize: 13,
    fontWeight: "900",
  },

  arrivedButton: {
    alignItems: "center",
    backgroundColor: "#23313f",
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 18,
  },

  arrivedButtonDetected: {
    backgroundColor: "#5f735c",
  },

  arrivedButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  loadingCard: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 14,
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  loadingText: {
    color: "#23313f",
    fontSize: 12,
    fontWeight: "700",
  },

  errorCard: {
    backgroundColor: "rgba(255,241,240,0.97)",
    borderColor: "#efb7b3",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  errorTitle: {
    color: "#8c2e2a",
    fontSize: 13,
    fontWeight: "900",
  },

  errorText: {
    color: "#7a4844",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  pressed: {
    opacity: 0.72,
  },

  disabled: {
    opacity: 0.6,
  },
});

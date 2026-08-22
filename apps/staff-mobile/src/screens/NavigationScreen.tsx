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
  NavigationSessionStatus,
  NavigationView,
  RouteStatus,
  TravelMode,
  useNavigation,
  type ArrivalEvent,
} from "@googlemaps/react-native-navigation-sdk";

import type { MobileRouteStop } from "../features/routes/driverRoutes";

type Props = {
  stop: MobileRouteStop;
  onClose: () => void;
  onArrived: () => Promise<void>;
};

function destinationAddress(stop: MobileRouteStop) {
  return [stop.address, stop.city, stop.state, stop.zip].filter(Boolean).join(", ");
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

export function NavigationScreen({ stop, onClose, onArrived }: Props) {
  const {
    navigationController,
    removeAllListeners,
    setOnArrival,
    setOnLocationChanged,
  } = useNavigation();

  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [mapReady, setMapReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [hasNavigatorLocation, setHasNavigatorLocation] = useState(false);
  const [starting, setStarting] = useState(true);
  const [arrivedDetected, setArrivedDetected] = useState(false);
  const [arrivalPending, setArrivalPending] = useState(false);
  const [error, setError] = useState("");
  const routeStartedRef = useRef(false);
  const mountedRef = useRef(true);

  const address = useMemo(() => destinationAddress(stop), [stop]);

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
        setError("Location permission is required for turn-by-turn navigation.");
        return;
      }

      try {
        const matches = await Location.geocodeAsync(address);

        if (cancelled) return;

        const first = matches[0];
        if (!first) {
          setStarting(false);
          setError(`Could not locate this address: ${address}`);
          return;
        }

        setDestination({
          lat: first.latitude,
          lng: first.longitude,
        });
      } catch (geocodeError) {
        if (cancelled) return;
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
    setOnLocationChanged(() => {
      setHasNavigatorLocation(true);
    });

    setOnArrival((event: ArrivalEvent) => {
      if (!event.isFinalDestination) return;

      void navigationController.stopGuidance();
      setArrivedDetected(true);
      setStarting(false);
    });

    return () => {
      removeAllListeners();
    };
  }, [navigationController, removeAllListeners, setOnArrival, setOnLocationChanged]);

  const initializeNavigation = useCallback(async () => {
    if (!mapReady || navigationReady) return;

    try {
      const termsAccepted =
        await navigationController.showTermsAndConditionsDialog();

      if (!termsAccepted) {
        setStarting(false);
        setError("Google Navigation terms were not accepted.");
        return;
      }

      const status = await navigationController.init();

      if (!mountedRef.current) return;

      if (status !== NavigationSessionStatus.OK) {
        setStarting(false);
        setError(navigationErrorMessage(status));
        return;
      }

      setNavigationReady(true);
    } catch (initError) {
      if (!mountedRef.current) return;
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

        if (!mountedRef.current) return;

        if (routeStatus !== RouteStatus.OK) {
          routeStartedRef.current = false;
          setStarting(false);
          setError(`Google Navigation could not calculate this route (${String(routeStatus)}).`);
          return;
        }

        await navigationController.startGuidance();

        if (!mountedRef.current) return;
        setStarting(false);
      } catch (routeError) {
        if (!mountedRef.current) return;
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
    stop,
  ]);

  const closeNavigation = useCallback(() => {
    void navigationController.stopGuidance();
    onClose();
  }, [navigationController, onClose]);

  const confirmArrival = useCallback(async () => {
    if (arrivalPending) return;

    setArrivalPending(true);
    setError("");

    try {
      await onArrived();
      await navigationController.stopGuidance();
      onClose();
    } catch (arrivalError) {
      setError(
        arrivalError instanceof Error
          ? arrivalError.message
          : "Could not mark this stop as arrived.",
      );
    } finally {
      if (mountedRef.current) setArrivalPending(false);
    }
  }, [arrivalPending, navigationController, onArrived, onClose]);

  return (
    <View style={styles.screen}>
      <NavigationView
        style={styles.map}
        myLocationEnabled
        myLocationButtonEnabled
        trafficEnabled
        headerEnabled
        footerEnabled
        tripProgressBarEnabled
        recenterButtonEnabled
        reportIncidentButtonEnabled
        speedometerEnabled
        speedLimitIconEnabled
        onMapReady={() => setMapReady(true)}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={closeNavigation} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Back</Text>
          </Pressable>

          <View style={styles.destinationCard}>
            <Text style={styles.typeLabel}>{stopTypeLabel(stop).toUpperCase()}</Text>
            <Text style={styles.customer} numberOfLines={1}>
              {stop.customer_name || "Customer"}
            </Text>
            <Text style={styles.address} numberOfLines={2}>
              {address || "Address unavailable"}
            </Text>
          </View>
        </View>

        <View style={styles.bottomArea}>
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#23313f" },
  map: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topBar: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16,
  },
  closeButtonText: { color: "#23313f", fontSize: 14, fontWeight: "800" },
  destinationCard: {
    backgroundColor: "rgba(35,49,63,0.94)",
    borderRadius: 16,
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  typeLabel: { color: "#f0c987", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  customer: { color: "#ffffff", fontSize: 16, fontWeight: "900", marginTop: 2 },
  address: { color: "rgba(255,255,255,0.72)", fontSize: 11, lineHeight: 15, marginTop: 2 },
  bottomArea: { gap: 10, padding: 12 },
  loadingCard: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  loadingText: { color: "#23313f", fontSize: 13, fontWeight: "700" },
  errorCard: {
    backgroundColor: "rgba(255,241,240,0.97)",
    borderColor: "#efb7b3",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  errorTitle: { color: "#8c2e2a", fontSize: 14, fontWeight: "900" },
  errorText: { color: "#7a4844", fontSize: 12, lineHeight: 17, marginTop: 4 },
  arrivedButton: {
    alignItems: "center",
    backgroundColor: "#23313f",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 18,
  },
  arrivedButtonDetected: { backgroundColor: "#5f735c" },
  arrivedButtonText: { color: "#ffffff", fontSize: 17, fontWeight: "900" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.65 },
});

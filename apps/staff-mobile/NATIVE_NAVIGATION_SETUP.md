# Staff Mobile — Native Navigation Setup

The Staff application is an Expo/React Native project, but Google Navigation SDK is a native module. Expo Go is not sufficient. Use a native development build.

## Current architecture

- Supabase remains the shared backend and source of truth.
- `HomeScreen` owns the driver workflow and stop status transitions.
- `DriverLocationTracker` sends foreground GPS pings only while the employee has an open work shift.
- `driver_location_pings` feeds the existing admin Live Driver dashboard.
- `NavigationScreen` owns Google turn-by-turn guidance inside the Staff app.
- `update_my_route_stop_status` remains the authoritative stop-transition boundary.

## Native requirements

Google's React Native Navigation SDK 0.16.x requires:

- React Native 0.79+ with New Architecture enabled. Staff Mobile uses RN 0.81.
- Android minSdk 24+.
- Android Jetifier enabled.
- Android core library desugaring with `desugar_jdk_libs_nio`.
- iOS deployment target 16.0+.
- iOS background modes `location` and `audio`.
- A Google Cloud API key enabled/restricted for Navigation SDK and the Maps SDKs used by the native platforms.

The local Expo config plugin `plugins/withGoogleNavigation.js` applies the native settings during `expo prebuild`. Generated `ios/` and `android/` directories are intentionally ignored by git.

## Required environment values

Create `apps/staff-mobile/.env.local` locally (never commit it):

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_NAVIGATION_API_KEY=...
```

Do not put `SUPABASE_SERVICE_ROLE_KEY`, Stripe secret keys, SMTP passwords, Twilio auth tokens, or other server credentials in this app.

Before any native build run:

```bash
npm run native:check
```

## Google Cloud key restrictions

The native application identifiers are:

```text
iOS bundle identifier: com.bouncepartyla.staff
Android package:       com.bouncepartyla.staff
```

For production, restrict native API keys by application identifier/certificate according to Google Maps Platform guidance. The key is client-side application configuration, so restriction is the security boundary; do not rely on hiding it in JavaScript.

## First local iPhone development build

From `apps/staff-mobile`:

```bash
npm install
npx expo install --fix
npm run native:check
npm run typecheck
npm run prebuild:clean
npm run ios -- --device
```

`prebuild:clean` regenerates native projects and applies:

- iOS Google Maps API initialization in AppDelegate;
- iOS 16 deployment target;
- Android Navigation API metadata;
- Android minSdk 24;
- Android New Architecture and Jetifier;
- Android core library desugaring.

For a physical iPhone, Xcode signing must be configured for `com.bouncepartyla.staff`.

## EAS internal build

The project includes `eas.json`. Put all three required environment variables into the EAS build environment, then use the development profile. Example workflow:

```bash
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --profile development --platform ios
```

Install the resulting internal development build on the test iPhone, then run Metro with:

```bash
npm run start:dev-client
```

## First driving test

Use a non-customer test route first.

1. Sign in with an existing linked driver account.
2. Confirm Today's Route loads the same stops as Route Board.
3. Start the employee shift / first route action.
4. Confirm Live Drivers receives GPS pings.
5. Tap `Start navigation` on the current test stop.
6. Accept Google Navigation terms when shown.
7. Confirm the route renders and turn-by-turn guidance starts inside Staff App.
8. Drive to the test destination.
9. Confirm Google's arrival event changes the button to `Confirm Arrived`.
10. Confirm Arrived and verify Route Board receives status `arrived`.
11. Complete the delivery/pickup and verify the next stop becomes active.
12. End the work shift and confirm operational location pings stop.

## Important boundaries

- Navigation is not the source of booking/route state; Supabase is.
- Do not automatically mark a delivery complete just because Google reports arrival.
- GPS tracking stays tied to an open employee shift.
- Do not introduce service-role credentials into the mobile binary.
- Google Navigation/Maps attribution and legal notices must be exposed before production distribution.

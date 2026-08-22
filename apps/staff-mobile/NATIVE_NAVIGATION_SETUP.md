# Staff Mobile — Native Navigation Setup

The staff application is an Expo/React Native project, but Google Navigation SDK is a native module. It must run in a native development build; Expo Go is not sufficient.

## Current architecture

- Supabase remains the shared backend and source of truth.
- `HomeScreen` owns the driver workflow and stop status transitions.
- `DriverLocationTracker` sends foreground GPS pings only while the employee has an open work shift.
- `driver_location_pings` feeds the existing admin Live Driver dashboard.
- Google Navigation SDK will own turn-by-turn guidance inside the staff application.

## Required public environment values

Create `apps/staff-mobile/.env.local` locally (never commit it):

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Google Maps / Navigation SDK keys belong in the native platform configuration during the navigation integration step. Do not place Supabase service-role credentials or other server secrets in the mobile app.

## Development build

From `apps/staff-mobile`:

```bash
npm install
npx expo install --fix
npm run typecheck
```

For the first native build, use EAS development profiles from `eas.json` or a local Expo prebuild. The Navigation SDK package requires native iOS/Android configuration, so do not import its native view into the app shell until that configuration is complete.

## Integration order

1. Verify auth, route loading, route status transitions, and GPS pings in a normal development build.
2. Generate/configure native iOS and Android projects for Google Navigation SDK.
3. Add a dedicated `NavigationScreen` that receives the active route stop destination.
4. Keep `Arrived` and `Complete` actions in the existing mobile workflow so navigation does not become a second source of business state.
5. Add background location only after foreground behavior is validated and employee privacy/shift boundaries remain enforced.

## Important safety boundary

GPS tracking is intentionally tied to an open work shift. Ending the shift must stop operational location tracking. Do not change that behavior while implementing turn-by-turn navigation.

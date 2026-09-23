# Privacy Tracking Readiness Note

Last updated: 2026-09-22

## Current technical state (today)

### Cookies / session
- The web app uses Supabase SSR auth/session cookies for authenticated experiences.
- Middleware and server helpers read/write cookies to maintain user sessions.

### Browser storage
- Limited localStorage usage exists for interface preferences (for example, route UI toggles and admin UI state).
- No standalone cookie preference manager is currently implemented.

### Analytics and advertising trackers
- No customer-facing Google/Meta pixel loader is currently enabled in root web layout.
- A GA4 server-side reporting module exists for analytics data access, but this is not a client pixel loader by itself.

### Mobile app
- The staff mobile app persists auth session data in AsyncStorage and uses route/location operational features.

## Classification snapshot

- Strictly necessary technologies in use now:
  - Auth/session cookies and core storage required for sign-in and account functions.
- Non-essential analytics cookies active now:
  - Not confirmed in current web runtime.
- Advertising cookies active now:
  - Not confirmed in current web runtime.

## Before enabling Google or Meta pixels

1. Implement a runtime gate so non-essential trackers do not load before user choice is evaluated.
2. Define clear categories in code and policy text:
   - necessary
   - analytics
   - advertising
3. Decide consent model and scope for US/California audiences.
4. Add a versioned consent record model only if/when non-essential tracking is activated.
5. Update Privacy Policy language from "may use" to "we use" for technologies actually deployed.
6. Validate that any "Do Not Track" or similar signal behavior claims match real implementation.

## Recommended implementation architecture (future)

- Add a single client tracking bootstrap module that receives an allowlist from server-rendered settings.
- Load pixel SDKs conditionally and late (after consent state and environment checks).
- Keep conversion events behind a typed wrapper to prevent accidental tracker calls before eligibility checks.
- Add integration tests to verify "no consent => no tracker requests".

## Out of scope for current phase

- Enabling Google/Meta pixels.
- Deploying a full cookie preference center UI.

import type { Metadata } from "next";

import PublicBookingShell from "@/components/public/PublicBookingShell";

export const metadata: Metadata = {
  title: "Staff Location Privacy Notice",
  description:
    "Bounce Party LA staff location and route operations notice.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function StaffPrivacyNoticePage() {
  return (
    <PublicBookingShell>
      <main>
        <section className="border-b border-black/[0.06]">
          <div className="mx-auto max-w-4xl px-5 py-16 sm:px-7 sm:py-24">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">
              Bounce Party LA
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
              Staff Location Privacy Notice
            </h1>

            <p className="mt-5 text-sm text-black/45">
              Last updated: September 22, 2026
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-12 sm:px-7 sm:py-16">
          <div className="space-y-10 text-[15px] leading-7 text-black/65 sm:text-base">
            <section>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#1c1b18] sm:text-2xl">
                What this notice covers
              </h2>
              <div className="mt-4 space-y-4">
                <p>
                  This notice explains how location data is used in the Bounce
                  Party LA staff driver application for route operations.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#1c1b18] sm:text-2xl">
                Location collection in the driver app
              </h2>
              <div className="mt-4 space-y-4">
                <p>
                  The staff app requests foreground location permission and may
                  send location updates while route work is active in the app.
                </p>
                <p>
                  This is used for operational visibility, route coordination,
                  ETA planning, delivery verification, and related support.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#1c1b18] sm:text-2xl">
                When location tracking is expected
              </h2>
              <div className="mt-4 space-y-4">
                <p>
                  In the current implementation, location collection is tied to
                  active route work and shift status within the staff app.
                </p>
                <p>
                  Bounce Party LA does not represent this as background tracking
                  when the app is not actively being used.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#1c1b18] sm:text-2xl">
                Who can access location data
              </h2>
              <div className="mt-4 space-y-4">
                <p>
                  Access to route and location records is limited to authorized
                  operational staff and administrators who need it for route and
                  delivery management.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#1c1b18] sm:text-2xl">
                Retention and review
              </h2>
              <div className="mt-4 space-y-4">
                <p>
                  Location records are retained for operational and business
                  review needs. Retention windows may be updated as operational
                  policy evolves.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#1c1b18] sm:text-2xl">
                Questions
              </h2>
              <div className="mt-4 space-y-4">
                <p>
                  Staff members with questions about this notice can contact
                  Bounce Party LA at{" "}
                  <a
                    href="mailto:bouncepartyla@gmail.com"
                    className="font-semibold text-[#1c1b18] underline decoration-black/20 underline-offset-4"
                  >
                    bouncepartyla@gmail.com
                  </a>
                  .
                </p>
              </div>
            </section>
          </div>
        </section>
      </main>
    </PublicBookingShell>
  );
}

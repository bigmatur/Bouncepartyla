import type { Metadata } from "next";
import Link from "next/link";

import PublicBookingShell from "@/components/public/PublicBookingShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for the Bounce Party LA website and online booking services.",
  alternates: {
    canonical: "/TermsOfService",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsOfServicePage() {
  return (
    <PublicBookingShell>
      <main>
        <section className="border-b border-black/[0.06]">
          <div className="mx-auto max-w-4xl px-5 py-16 sm:px-7 sm:py-24">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">
              Bounce Party LA
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
              Terms of Service
            </h1>

            <p className="mt-5 text-sm text-black/45">
              Last updated: September 11, 2026
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-12 sm:px-7 sm:py-16">
          <div className="space-y-10 text-[15px] leading-7 text-black/65 sm:text-base">
            <TermsSection title="1. About these terms">
              <p>
                These Terms of Service govern your use of the Bounce Party LA
                website, online catalog, booking tools, customer account, and
                related online services.
              </p>
              <p>
                By using this website or submitting information through our
                online services, you agree to these Terms of Service.
              </p>
            </TermsSection>

            <TermsSection title="2. Rental agreements">
              <p>
                Equipment rentals are governed by the rental agreement,
                contract, invoice, booking details, safety requirements, and
                other terms presented for the specific reservation.
              </p>
              <p>
                If there is a conflict between these website Terms of Service
                and a signed rental agreement for a specific booking, the
                applicable rental agreement controls for that rental.
              </p>
            </TermsSection>

            <TermsSection title="3. Booking information">
              <p>
                You agree to provide accurate and complete information when
                requesting availability, creating a booking, making a payment,
                or communicating event and delivery details.
              </p>
              <p>
                A reservation is subject to availability and any confirmation,
                payment, signature, or other requirements associated with that
                booking.
              </p>
            </TermsSection>

            <TermsSection title="4. Pricing and payments">
              <p>
                Prices, deposits, delivery charges, taxes, optional services,
                discounts, and payment schedules may vary depending on the
                equipment, event location, date, and other booking details.
              </p>
              <p>
                The amounts and payment requirements shown in your booking,
                invoice, checkout, or rental agreement are the terms applicable
                to that reservation.
              </p>
            </TermsSection>

            <TermsSection title="5. Changes, cancellations, and weather">
              <p>
                Changes, cancellations, rescheduling, weather-related decisions,
                credits, and refunds are handled according to the terms
                applicable to the individual reservation and rental agreement.
              </p>
              <p>
                Safety considerations may require equipment use, installation,
                or an event setup to be changed, delayed, discontinued, or
                declined when conditions are unsafe.
              </p>
            </TermsSection>

            <TermsSection title="6. Website availability">
              <p>
                We may update, change, suspend, or discontinue portions of the
                website or online services when reasonably necessary. We do not
                guarantee that every feature will always be available or
                uninterrupted.
              </p>
            </TermsSection>

            <TermsSection title="7. Product information">
              <p>
                We make reasonable efforts to keep product descriptions,
                photographs, dimensions, availability, and pricing accurate.
                Actual appearance, configuration, colors, accessories, and
                availability may vary.
              </p>
              <p>
                Final booking details are determined by the confirmed
                reservation and any applicable rental agreement.
              </p>
            </TermsSection>

            <TermsSection title="8. Acceptable use">
              <p>
                You may not misuse the website, attempt unauthorized access,
                interfere with website operation, submit fraudulent information,
                or use the service for unlawful purposes.
              </p>
            </TermsSection>

            <TermsSection title="9. Intellectual property">
              <p>
                Unless otherwise stated, website content, branding, text,
                graphics, photographs, and other materials are owned by or used
                with permission by Bounce Party LA and may not be reproduced or
                commercially used without authorization.
              </p>
            </TermsSection>

            <TermsSection title="10. Third-party services">
              <p>
                The website may use or link to third-party services such as
                payment processors, mapping services, social networks, and
                other service providers. Their services may be governed by
                separate terms and privacy policies.
              </p>
            </TermsSection>

            <TermsSection title="11. Privacy">
              <p>
                Information collected through the website is handled according
                to our{" "}
                <Link
                  href="/PrivacyPolicy"
                  className="font-semibold text-[#1c1b18] underline decoration-black/20 underline-offset-4"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </TermsSection>

            <TermsSection title="12. Changes to these terms">
              <p>
                We may update these Terms of Service from time to time. The
                current version will be posted on this page with an updated
                revision date when appropriate.
              </p>
            </TermsSection>

            <TermsSection title="13. Contact">
              <p>
                Questions about these Terms of Service can be sent to{" "}
                <a
                  href="mailto:bouncepartyla@gmail.com"
                  className="font-semibold text-[#1c1b18] underline decoration-black/20 underline-offset-4"
                >
                  bouncepartyla@gmail.com
                </a>{" "}
                or by calling{" "}
                <a
                  href="tel:+17472722603"
                  className="font-semibold text-[#1c1b18] underline decoration-black/20 underline-offset-4"
                >
                  (747) 272-2603
                </a>
                .
              </p>
            </TermsSection>
          </div>
        </section>
      </main>
    </PublicBookingShell>
  );
}

function TermsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#1c1b18] sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
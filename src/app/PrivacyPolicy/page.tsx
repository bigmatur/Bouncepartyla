import type { Metadata } from "next";

import PublicBookingShell from "@/components/public/PublicBookingShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Bounce Party LA website and booking services.",
  alternates: {
    canonical: "/PrivacyPolicy",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPolicyPage() {
  return (
    <PublicBookingShell>
      <main>
        <section className="border-b border-black/[0.06]">
          <div className="mx-auto max-w-4xl px-5 py-16 sm:px-7 sm:py-24">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">
              Bounce Party LA
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
              Privacy Policy
            </h1>

            <p className="mt-5 text-sm text-black/45">
              Last updated: September 22, 2026
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-12 sm:px-7 sm:py-16">
          <div className="space-y-10 text-[15px] leading-7 text-black/65 sm:text-base">
            <div>
              <p>
                Bounce Party LA respects your privacy. This Privacy Policy
                explains what information we collect through our website and
                booking services, how we use it, when we share it, and the
                choices available to you.
              </p>
            </div>

            <PolicySection title="1. Information We Collect">
              <p>
                We collect information that you submit directly, including:
                your name, email address, phone number, booking and event
                details, setup/delivery address, account details, and message
                content when you contact us.
              </p>
              <p>
                Depending on your booking flow, we may also collect rental
                contract information and signature evidence for operational and
                legal recordkeeping.
              </p>
              <p>
                For completed services, we may store event-related proof photos
                (for example, setup/pickup documentation) that are associated
                with the booking record.
              </p>
            </PolicySection>

            <PolicySection title="2. Payment Information">
              <p>
                Online card payments are processed through Stripe. Bounce Party
                LA does not store full payment card numbers or card security
                codes in our application database.
              </p>
              <p>
                We may store limited payment transaction details such as amount,
                status, method label, processor reference IDs, and timestamps
                needed for receipts, accounting, and support.
              </p>
            </PolicySection>

            <PolicySection title="3. How We Use Information">
              <p>We use personal information to:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>create and manage customer accounts and bookings;</li>
                <li>prepare, deliver, and support rental services;</li>
                <li>process payments and maintain transaction records;</li>
                <li>send transactional communications about your booking;</li>
                <li>provide customer support and resolve service issues;</li>
                <li>secure our systems and prevent fraud or misuse;</li>
                <li>comply with legal obligations.</li>
              </ul>
            </PolicySection>

            <PolicySection title="4. Communications">
              <p>
                We send operational and transactional messages related to your
                booking and account, including confirmations, schedule updates,
                payment receipts/reminders, and service-related notices.
              </p>
              <p>
                If SMS is used, it is intended for transactional booking
                communications. Reply STOP to opt out of SMS and START to resume
                where supported.
              </p>
            </PolicySection>

            <PolicySection title="5. Service Providers and Disclosures">
              <p>
                We may share information with trusted service providers when
                reasonably necessary to operate our business and services. These
                may include:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Supabase (database, authentication, and backend services);</li>
                <li>Stripe (payment processing);</li>
                <li>email/SMS providers used for customer communications;</li>
                <li>hosting and infrastructure providers;</li>
                <li>Google services used for mapping and operational features.</li>
              </ul>
              <p>
                We may also disclose information if required by law, legal
                process, or to protect rights, safety, and service operations.
              </p>
            </PolicySection>

            <PolicySection title="6. Cookies, Local Storage, and Similar Technologies">
              <p>
                Our website uses technical storage mechanisms such as cookies
                and browser local storage to support essential functionality,
                including authentication/session continuity and product
                experience features.
              </p>
              <p>
                Some site areas may also use local storage to remember user
                interface preferences.
              </p>
            </PolicySection>

            <PolicySection title="7. Analytics and Advertising Technologies">
              <p>
                We may use analytics and advertising technologies in the future,
                including Google or Meta tools, to understand site usage and
                improve marketing performance.
              </p>
              <p>
                As of the date above, this Policy describes the framework for
                those tools if/when enabled. We will update our disclosures and
                controls as needed when non-essential tracking technologies are
                activated.
              </p>
            </PolicySection>

            <PolicySection title="8. Do Not Track and Browser Signals (CalOPPA)">
              <p>
                Some browsers offer a “Do Not Track” (DNT) setting. Our website
                does not currently respond to DNT signals with a separate
                technical behavior.
              </p>
              <p>
                If we implement support for browser-based privacy signals in the
                future, we will update this Policy.
              </p>
            </PolicySection>

            <PolicySection title="9. Data Retention">
              <p>
                We retain personal information for as long as reasonably
                necessary to provide services, maintain business and legal
                records, resolve disputes, enforce agreements, and comply with
                legal obligations.
              </p>
            </PolicySection>

            <PolicySection title="10. Security">
              <p>
                We use reasonable administrative, technical, and organizational
                safeguards designed to protect personal information. No security
                method is perfect, and we cannot guarantee absolute security.
              </p>
            </PolicySection>

            <PolicySection title="11. Your Choices and Account Information">
              <p>
                You may contact us to request updates to account/contact
                information or to ask privacy questions about information
                associated with your bookings and account.
              </p>
            </PolicySection>

            <PolicySection title="12. Children">
              <p>
                Our services are intended for adults booking event rentals. Our
                website and account features are not directed to children, and
                we do not intend for children to submit personal information
                directly to us through online account or booking forms.
              </p>
            </PolicySection>

            <PolicySection title="13. California Privacy Information">
              <p>
                We operate primarily in California. We do not sell customer
                personal information and do not derive revenue from selling or
                sharing personal information.
              </p>
              <p>
                California customers may contact us with questions about this
                Policy, our data practices, or requests to update account
                information.
              </p>
            </PolicySection>

            <PolicySection title="14. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. Changes
                will be reflected on this page along with an updated revision
                date when appropriate.
              </p>
            </PolicySection>

            <PolicySection title="15. Contact Us">
              <p>
                If you have questions about this Privacy Policy or our privacy
                practices, contact Bounce Party LA at{" "}
                <a
                  href="mailto:bouncepartyla@gmail.com"
                  className="font-semibold text-[#1c1b18] underline decoration-black/20 underline-offset-4"
                >
                  bouncepartyla@gmail.com
                </a>{" "}
                or{" "}
                <a
                  href="tel:+17472722603"
                  className="font-semibold text-[#1c1b18] underline decoration-black/20 underline-offset-4"
                >
                  (747) 272-2603
                </a>
                .
              </p>
            </PolicySection>
          </div>
        </section>
      </main>
    </PublicBookingShell>
  );
}

function PolicySection({
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
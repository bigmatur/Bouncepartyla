import type { Metadata } from "next";

import PublicBookingShell from "@/components/public/PublicBookingShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Bounce Party LA.",
  alternates: {
    canonical: "/PrivacyPolicy",
  },
  robots: {
    index: false,
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
              Last updated: September 20, 2023
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-12 sm:px-7 sm:py-16">
          <div className="space-y-10 text-[15px] leading-7 text-black/65 sm:text-base">
            <div>
              <p>
                Bounce Party LA respects your privacy and is committed to
                protecting the personal information you share with us. This
                Privacy Policy explains what information we may collect, how we
                use it, and the choices available to you.
              </p>
            </div>

            <PolicySection title="Information we collect">
              <p>
                We may collect personal information that you provide when
                requesting information, making a reservation, completing a
                booking, contacting us, or otherwise using our services. This
                may include your name, email address, phone number, event
                details, delivery information, and other information needed to
                provide our services.
              </p>
              <p>
                When a payment is made, payment information may be processed by
                our payment service providers. We may also receive information
                about how visitors use our website, such as pages visited,
                device and browser information, and general website activity.
              </p>
            </PolicySection>

            <PolicySection title="How we use information">
              <p>
                We use information to provide and manage rentals and bookings,
                communicate with customers, provide customer support, process
                requests, improve our website and services, and send relevant
                service communications.
              </p>
              <p>
                If you choose to receive promotional communications or
                newsletters, we may also use your contact information for those
                purposes.
              </p>
            </PolicySection>

            <PolicySection title="Information security">
              <p>
                We take reasonable measures designed to protect personal
                information from unauthorized access, misuse, loss, alteration,
                or disclosure. No method of electronic transmission or storage,
                however, can be guaranteed to be completely secure.
              </p>
            </PolicySection>

            <PolicySection title="Sharing of information">
              <p>
                We do not sell your personal information. Information may be
                shared with service providers when reasonably necessary to
                operate our business, process payments, provide requested
                services, maintain our website, or comply with applicable legal
                obligations.
              </p>
            </PolicySection>

            <PolicySection title="Your choices">
              <p>
                You may contact us to ask about personal information you have
                provided, request corrections, or ask questions about how your
                information is handled.
              </p>
            </PolicySection>

            <PolicySection title="Changes to this policy">
              <p>
                We may update this Privacy Policy from time to time. Changes
                will be reflected on this page along with an updated revision
                date when appropriate.
              </p>
            </PolicySection>

            <PolicySection title="Contact us">
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
type Contract = {
  id: string;
  status: string;
  signer_name: string | null;
  signer_email: string | null;
  pdf_url: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signature_date: string | null;
} | null;

type BookingContractCardProps = {
  bookingId: string;
  contract: Contract;
  fallbackStatus: string;
  adminPreview?: boolean;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(value: string | null | undefined) {
  if (!value) {
    return "Preparing";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function contractStatusLabel(value: string) {
  const labels: Record<string, string> = {
    not_sent: "Preparing your contract",
    sent: "Ready for signature",
    viewed: "Ready for signature",
    signed: "Contract signed",
    expired: "Contract expired",
    cancelled: "Contract cancelled",
  };

  return labels[value] || statusLabel(value);
}

function getContractMessage(status: string) {
  const messages: Record<string, string> = {
    not_sent: "We are preparing your rental agreement. It will appear here when it is ready.",
    sent: "Please review and sign your rental agreement before the event.",
    viewed: "Your contract has been opened and is still waiting for your signature.",
    signed: "Your rental agreement is complete. You can open a copy at any time.",
    expired: "This contract is no longer active. Please contact Bounce Party LA for help.",
    cancelled: "This contract has been cancelled. Please contact Bounce Party LA with any questions.",
  };

  return messages[status] || "Your rental agreement details are shown below.";
}

function getStatusStyles(status: string) {
  if (status === "signed") {
    return {
      panel: "bg-emerald-50",
      badge: "bg-emerald-600 text-white",
      icon: "✓",
    };
  }

  if (status === "sent" || status === "viewed") {
    return {
      panel: "bg-amber-50",
      badge: "bg-amber-100 text-amber-800",
      icon: "!",
    };
  }

  if (status === "expired" || status === "cancelled") {
    return {
      panel: "bg-red-50",
      badge: "bg-red-100 text-red-700",
      icon: "×",
    };
  }

  return {
    panel: "bg-black/[0.035]",
    badge: "bg-white text-black/45",
    icon: "…",
  };
}

export default function BookingContractCard({
  bookingId,
  contract,
  fallbackStatus,
  adminPreview = false,
}: BookingContractCardProps) {
  const status = contract?.status || fallbackStatus || "not_sent";
  const styles = getStatusStyles(status);
  const signedAt = formatDateTime(contract?.signed_at || contract?.signature_date);
  const contractRoute = `/account/bookings/${bookingId}/contract${adminPreview ? "?preview=admin" : ""}`;
  const contractDownloadRoute = `/account/bookings/${bookingId}/contract?download=1${adminPreview ? "&preview=admin" : ""}`;
  const hasGeneratedContract = Boolean(contract?.id);
  const isSignedContract = status === "signed" || Boolean(contract?.signed_at);
  const canOpenContract = Boolean(contract?.pdf_url) || hasGeneratedContract;
  const canDownloadContract = Boolean(contract?.pdf_url) || (hasGeneratedContract && isSignedContract);

  return (
    <section className="overflow-hidden rounded-[20px] border border-black/10 bg-white sm:rounded-[26px]">
      <div className="p-4 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Rental agreement
        </p>

        <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] sm:mt-2 sm:text-xl">
          Contract
        </h2>

        <div className={`mt-4 rounded-[16px] p-3 sm:mt-5 sm:rounded-[20px] sm:p-4 ${styles.panel}`}>
          <div className="flex items-start gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${styles.badge}`}
              aria-hidden="true"
            >
              {styles.icon}
            </span>

            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {contractStatusLabel(status)}
              </p>

              <p className="mt-1 hidden text-xs leading-5 text-black/55 sm:block">
                {getContractMessage(status)}
              </p>
            </div>
          </div>
        </div>

        {signedAt ? (
          <div className="mt-4 flex items-start justify-between gap-4 border-t border-black/[0.06] pt-4 text-sm">
            <span className="text-black/45">Signed</span>
            <strong className="text-right">{signedAt}</strong>
          </div>
        ) : null}

        {contract?.signer_name ? (
          <div className="mt-3 flex items-start justify-between gap-4 text-sm">
            <span className="text-black/45">Signer</span>
            <strong className="text-right">{contract.signer_name}</strong>
          </div>
        ) : null}

        {canOpenContract ? (
          <div className="mt-4 grid gap-2 sm:mt-5 sm:grid-cols-2">
            <a
              href={contract?.pdf_url || contractRoute}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/85"
            >
              {status === "signed" ? "View signed contract" : "Open contract"}
            </a>

            {canDownloadContract ? (
              <a
                href={contract?.pdf_url || (hasGeneratedContract ? contractDownloadRoute : "#")}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-black/10 bg-white px-4 text-sm font-semibold text-black/75 transition hover:bg-black/[0.03]"
                download
              >
                {contract?.pdf_url || (hasGeneratedContract && isSignedContract)
                  ? "Download signed PDF"
                  : "Download contract copy"}
              </a>
            ) : null}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-black/10 px-4 py-3 text-center text-xs leading-5 text-black/45">
            The contract document is not available yet.
          </p>
        )}
      </div>
    </section>
  );
}

import CustomerShell from "@/components/account/CustomerShell";
import { requireCustomerAccess } from "@/lib/auth/require-customer";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_HELP_TITLE = "Need support?";
const DEFAULT_HELP_DESCRIPTION =
  "Contact Bounce Party LA for booking updates, delivery window changes, payment help or contract questions.";
const DEFAULT_HELP_EMAIL = "support@bouncepartyla.com";
const DEFAULT_HELP_PHONE = "(323) 000-0000";

function isMissingColumnError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return code === "42703" || message.includes("does not exist");
}

export default async function AccountHelpPage() {
  const { access, canPreviewCustomer } = await requireCustomerAccess();
  const supabase = await createClient();

  const settingsResult = await supabase
    .from("system_settings")
    .select(
      "account_help_title, account_help_description, account_help_email, account_help_phone"
    )
    .limit(1)
    .maybeSingle();

  if (settingsResult.error && !isMissingColumnError(settingsResult.error)) {
    throw new Error(settingsResult.error.message);
  }

  const settings = settingsResult.data;

  const helpTitle = String(settings?.account_help_title || "").trim() || DEFAULT_HELP_TITLE;
  const helpDescription =
    String(settings?.account_help_description || "").trim() || DEFAULT_HELP_DESCRIPTION;
  const helpEmail = String(settings?.account_help_email || "").trim() || DEFAULT_HELP_EMAIL;
  const helpPhone = String(settings?.account_help_phone || "").trim() || DEFAULT_HELP_PHONE;

  return (
    <CustomerShell
      displayName={access.displayName}
      userEmail={access.user?.email || null}
      role={access.role}
      defaultInterface={access.defaultInterface}
      availableInterfaces={access.availableInterfaces}
      grantedPermissions={access.grantedPermissions}
      previewMode={canPreviewCustomer}
    >
      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-5 sm:py-10">
        <section className="rounded-[22px] border border-black/10 bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:rounded-[30px] sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40">Help</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:mt-3 sm:text-4xl">{helpTitle}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-black/60">
            {helpDescription}
          </p>

          <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 sm:grid-cols-2">
            <a href={`mailto:${helpEmail}`} className="flex min-h-20 items-center justify-between rounded-[16px] bg-[#f7f4ef] p-4 transition active:scale-[0.99] sm:rounded-2xl">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Email support</div>
                <div className="mt-1 text-sm font-semibold">{helpEmail}</div>
              </div>
              <span className="text-black/30">→</span>
            </a>
            <a href={`tel:${helpPhone.replace(/[^0-9+]/g, "")}`} className="flex min-h-20 items-center justify-between rounded-[16px] bg-[#f7f4ef] p-4 transition active:scale-[0.99] sm:rounded-2xl">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Phone support</div>
                <div className="mt-1 text-sm font-semibold">{helpPhone}</div>
              </div>
              <span className="text-black/30">→</span>
            </a>
          </div>
        </section>
      </main>
    </CustomerShell>
  );
}

import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { listIntegrationSummaries, type IntegrationProvider, type IntegrationSummary } from "@/lib/integrations/connections";
import {
  disableIntegrationConnectionAction,
  saveIntegrationConnectionAction,
  testIntegrationConnectionAction,
} from "./actions";

export const dynamic = "force-dynamic";

function statusClass(status: string) {
  if (status === "connected") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "error") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "disabled") return "bg-neutral-100 text-neutral-600 ring-neutral-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function statusLabel(connection: IntegrationSummary) {
  if (connection.status === "connected") return connection.source === "environment" ? "Connected via env" : "Connected";
  if (connection.status === "error") return "Error";
  if (connection.status === "disabled") return "Disabled";
  return connection.source === "environment" ? "Configured via env" : "Not connected";
}

const providerInstructions: Record<IntegrationProvider, string[]> = {
  ga4: [
    "Open Google Analytics Admin and copy the GA4 Property ID from Property settings.",
    "Create a Google Cloud service account, enable Google Analytics Data API, and add the service account email as Viewer on the GA4 property.",
    "Create a JSON key for that service account and paste the JSON here. Do not commit the JSON file to the repository.",
  ],
  meta: [
    "Open Meta Business Manager, then Ads Manager, and copy the Ad Account ID. Use the act_ prefix if Meta shows it.",
    "Create a system user or app token with ads_read permissions for reporting.",
    "Use the app secret from Meta Developers > App settings > Basic if your integration requires signed calls.",
  ],
  instagram: [
    "Open Meta Developers and connect the Instagram account to a Facebook Page.",
    "Copy the Instagram Business Account ID from Graph API Explorer or Meta Business settings.",
    "Create a Page/Instagram access token with the required messaging permissions and set the webhook verify token used by Meta webhook setup.",
  ],
  sms: [
    "Open Twilio Console and copy Account SID and Auth Token from Account Info.",
    "Buy or select a Twilio phone number and copy it as the From number.",
    "Set Twilio Messaging webhook URLs to this app's inbound and status callback endpoints.",
  ],
  telegram: [
    "Message @BotFather in Telegram and create a bot to get the bot token.",
    "Add the bot to the target group/channel, then get the chat ID using getUpdates or a Telegram admin tool.",
    "Optionally create a webhook secret token before enabling webhook delivery.",
  ],
  whatsapp: [
    "Open Meta Business Manager > WhatsApp Manager and copy the Phone Number ID and WhatsApp Business Account ID.",
    "Create a permanent access token for the Meta app/system user with WhatsApp messaging permissions.",
    "Use the same webhook verify token when configuring WhatsApp webhooks in Meta Developers.",
  ],
  google_maps: [
    "Open Google Cloud Console, enable Maps JavaScript API, Places API, Geocoding API, and Distance Matrix API as needed.",
    "Create a restricted browser key for maps shown in the app and a restricted server key for server distance requests.",
    "Restrict browser keys by domain and server keys by API/IP where possible.",
  ],
  stripe: [
    "Open Stripe Dashboard > Developers > API keys and copy publishable and secret keys.",
    "Open Developers > Webhooks, create an endpoint for this app, then copy the signing secret.",
    "Use test keys locally and live keys only in production.",
  ],
  gmail: [
    "Create OAuth credentials in Google Cloud Console for the CRM Gmail mailbox.",
    "Generate a refresh token for the Gmail account after consenting to the required Gmail scopes.",
    "Use the mailbox email that should send and receive CRM messages.",
  ],
};

function InfoPopover({ provider }: { provider: IntegrationProvider }) {
  return (
    <details className="group relative inline-block">
      <summary className="inline-flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-[#d8cec0] bg-[#fcfaf7] text-xs font-bold text-[#9a7a49] hover:bg-white">
        ?
      </summary>
      <div className="absolute left-0 top-8 z-40 w-[min(340px,80vw)] rounded-2xl border border-[#eadfd1] bg-white p-4 text-xs leading-5 text-[#4c443c] shadow-[0_16px_45px_rgba(0,0,0,0.14)]">
        <div className="mb-2 font-bold uppercase tracking-[0.12em] text-[#9a7a49]">Where to get this data</div>
        <ol className="list-decimal space-y-1 pl-4">
          {providerInstructions[provider].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>
    </details>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-[#9a7a49]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs leading-5 text-[#8b8177]">{hint}</span> : null}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full min-w-0 resize-y rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 font-mono text-xs outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function maskedRows(connection: IntegrationSummary) {
  const entries = Object.entries(connection.maskedCredentials);

  if (entries.length === 0) {
    return <div className="text-sm text-[#8b8177]">No stored credentials detected.</div>;
  }

  return (
    <div className="grid gap-2 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-[#fcfaf7] px-3 py-2 ring-1 ring-[#eee5d9]">
          <span className="font-semibold uppercase tracking-[0.1em] text-[#8b8177]">{key.replaceAll("_", " ")}</span>
          <span className="font-mono text-[#2f2a25]">{value}</span>
        </div>
      ))}
    </div>
  );
}

function ProviderFields({ connection }: { connection: IntegrationSummary }) {
  const config = connection.publicConfig || {};
  const provider = connection.provider;

  if (provider === "ga4") {
    return (
      <>
        <Field label="GA4 property ID">
          <Input name="ga4PropertyId" defaultValue={config.property_id || ""} placeholder="408024359" />
        </Field>
        <Field label="Service account JSON" hint="Paste JSON only when replacing credentials. Existing saved secret is never displayed.">
          <Textarea name="ga4ServiceAccountJson" rows={7} placeholder="Leave blank to keep saved credentials." />
        </Field>
      </>
    );
  }

  if (provider === "meta") {
    return (
      <>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Ad account ID">
            <Input name="metaAdAccountId" defaultValue={config.ad_account_id || ""} placeholder="act_..." />
          </Field>
          <Field label="Graph version">
            <Input name="metaGraphVersion" defaultValue={config.graph_version || "v24.0"} placeholder="v24.0" />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Access token" hint="Leave blank to keep saved token.">
            <Input name="metaAccessToken" type="password" autoComplete="off" />
          </Field>
          <Field label="App secret" hint="Leave blank to keep saved secret.">
            <Input name="metaAppSecret" type="password" autoComplete="off" />
          </Field>
        </div>
      </>
    );
  }

  if (provider === "instagram") {
    return (
      <>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Page ID">
            <Input name="instagramPageId" defaultValue={config.page_id || ""} />
          </Field>
          <Field label="Instagram business account ID">
            <Input name="instagramBusinessAccountId" defaultValue={config.instagram_business_account_id || ""} />
          </Field>
          <Field label="Graph version">
            <Input name="instagramGraphVersion" defaultValue={config.graph_version || "v24.0"} placeholder="v24.0" />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Access token" hint="Leave blank to keep saved token.">
            <Input name="instagramAccessToken" type="password" autoComplete="off" />
          </Field>
          <Field label="App secret" hint="Leave blank to keep saved secret.">
            <Input name="instagramAppSecret" type="password" autoComplete="off" />
          </Field>
          <Field label="Verify token" hint="Leave blank to keep saved token.">
            <Input name="instagramVerifyToken" type="password" autoComplete="off" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#2f2a25]">
          <input type="checkbox" name="instagramSimulatorEnabled" defaultChecked={Boolean(config.simulator_enabled)} />
          Enable local Instagram simulator
        </label>
      </>
    );
  }

  if (provider === "sms") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Twilio from number">
          <Input name="smsFromNumber" defaultValue={config.from_number || ""} placeholder="+17472722603" />
        </Field>
        <Field label="Account SID" hint="Leave blank to keep saved SID.">
          <Input name="smsAccountSid" type="password" autoComplete="off" />
        </Field>
        <Field label="Auth token" hint="Leave blank to keep saved token.">
          <Input name="smsAuthToken" type="password" autoComplete="off" />
        </Field>
        <Field label="Inbound webhook URL">
          <Input name="smsInboundWebhookUrl" defaultValue={config.inbound_webhook_url || ""} />
        </Field>
        <Field label="Status callback URL">
          <Input name="smsStatusCallbackUrl" defaultValue={config.status_callback_url || ""} />
        </Field>
      </div>
    );
  }

  if (provider === "telegram") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Bot username">
          <Input name="telegramBotUsername" defaultValue={config.bot_username || ""} placeholder="@bounceparty_bot" />
        </Field>
        <Field label="Chat ID">
          <Input name="telegramChatId" defaultValue={config.chat_id || ""} />
        </Field>
        <Field label="Bot token" hint="Leave blank to keep saved token.">
          <Input name="telegramBotToken" type="password" autoComplete="off" />
        </Field>
        <Field label="Webhook secret" hint="Leave blank to keep saved secret.">
          <Input name="telegramWebhookSecret" type="password" autoComplete="off" />
        </Field>
      </div>
    );
  }

  if (provider === "whatsapp") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Phone number ID">
          <Input name="whatsappPhoneNumberId" defaultValue={config.phone_number_id || ""} />
        </Field>
        <Field label="Business account ID">
          <Input name="whatsappBusinessAccountId" defaultValue={config.business_account_id || ""} />
        </Field>
        <Field label="Graph version">
          <Input name="whatsappGraphVersion" defaultValue={config.graph_version || "v24.0"} placeholder="v24.0" />
        </Field>
        <Field label="Access token" hint="Leave blank to keep saved token.">
          <Input name="whatsappAccessToken" type="password" autoComplete="off" />
        </Field>
        <Field label="App secret" hint="Leave blank to keep saved secret.">
          <Input name="whatsappAppSecret" type="password" autoComplete="off" />
        </Field>
        <Field label="Verify token" hint="Leave blank to keep saved token.">
          <Input name="whatsappVerifyToken" type="password" autoComplete="off" />
        </Field>
      </div>
    );
  }

  if (provider === "google_maps") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Server API key" hint="Leave blank to keep saved key.">
          <Input name="googleMapsServerApiKey" type="password" autoComplete="off" />
        </Field>
        <Field label="Browser API key" hint="Leave blank to keep saved key.">
          <Input name="googleMapsBrowserApiKey" type="password" autoComplete="off" />
        </Field>
      </div>
    );
  }

  if (provider === "stripe") {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Publishable key">
          <Input name="stripePublishableKey" defaultValue={config.publishable_key || ""} />
        </Field>
        <Field label="Secret key" hint="Leave blank to keep saved key.">
          <Input name="stripeSecretKey" type="password" autoComplete="off" />
        </Field>
        <Field label="Webhook secret" hint="Leave blank to keep saved secret.">
          <Input name="stripeWebhookSecret" type="password" autoComplete="off" />
        </Field>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Mailbox">
        <Input name="gmailMailbox" defaultValue={config.mailbox || ""} placeholder="bouncepartyla@gmail.com" />
      </Field>
      <Field label="Client ID" hint="Leave blank to keep saved client ID.">
        <Input name="gmailClientId" type="password" autoComplete="off" />
      </Field>
      <Field label="Client secret" hint="Leave blank to keep saved secret.">
        <Input name="gmailClientSecret" type="password" autoComplete="off" />
      </Field>
      <Field label="Refresh token" hint="Leave blank to keep saved token.">
        <Input name="gmailRefreshToken" type="password" autoComplete="off" />
      </Field>
    </div>
  );
}

function publicDetails(connection: IntegrationSummary) {
  const config = connection.publicConfig || {};
  const labels: Record<string, string> = {
    property_id: "Property ID",
    ad_account_id: "Ad account",
    page_id: "Page ID",
    instagram_business_account_id: "Instagram account",
    graph_version: "Graph version",
    from_number: "From number",
    inbound_webhook_url: "Inbound webhook",
    status_callback_url: "Status callback",
    bot_username: "Bot username",
    chat_id: "Chat ID",
    phone_number_id: "Phone number ID",
    business_account_id: "Business account ID",
    publishable_key: "Publishable key",
    mailbox: "Mailbox",
  };
  const entries = Object.entries(config).filter(([, value]) => value !== "" && value !== null && value !== undefined && typeof value !== "boolean");

  if (entries.length === 0) return <div className="text-sm text-[#8b8177]">No account identifiers configured.</div>;

  return (
    <div className="grid gap-2 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-[#eee5d9]">
          <span className="font-semibold uppercase tracking-[0.1em] text-[#8b8177]">{labels[key] || key.replaceAll("_", " ")}</span>
          <span className="max-w-[260px] truncate font-semibold text-[#2f2a25]">{String(value)}</span>
        </div>
      ))}
    </div>
  );
}

function IntegrationCard({ connection, active }: { connection: IntegrationSummary; active: boolean }) {
  return (
    <section className="rounded-[28px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eee5d9] px-4 py-4 sm:px-6 sm:py-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#9a7a49]">{connection.source === "database" ? "Database config" : connection.source === "environment" ? "Environment fallback" : "Not configured"}</div>
          <div className="mt-1 flex items-center gap-2">
            <h3 className="text-xl font-bold text-[#1f1e1b]">{connection.displayName}</h3>
            <InfoPopover provider={connection.provider} />
          </div>
          <div className="mt-1 text-xs text-[#8b8177]">Last tested: {formatDateTime(connection.lastTestedAt)}</div>
        </div>
        <span className={["rounded-full px-3 py-1.5 text-xs font-bold ring-1", statusClass(connection.status)].join(" ")}>{statusLabel(connection)}</span>
      </div>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#9a7a49]">Identifiers</div>
          {publicDetails(connection)}
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#9a7a49]">Credentials</div>
          {maskedRows(connection)}
        </div>
      </div>

      {connection.lastError ? <div className="mx-4 mb-4 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-700 ring-1 ring-red-100 sm:mx-6">{connection.lastError}</div> : null}

      <details open={active} className="border-t border-[#eee5d9]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-[#23313f] hover:bg-[#fcfaf7] sm:px-6">
          Configure
        </summary>
        <form action={saveIntegrationConnectionAction} className="space-y-4 bg-[#fcfaf7] p-4 sm:p-6">
          <input type="hidden" name="provider" value={connection.provider} />
          <Field label="Display name">
            <Input name="displayName" defaultValue={connection.displayName} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-[#2f2a25]">
            <input type="checkbox" name="enabled" defaultChecked={connection.enabled} />
            Enable database configuration for this integration
          </label>
          <ProviderFields connection={connection} />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="submit" className="rounded-full bg-[#23313f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#18222d]">Save configuration</button>
          </div>
        </form>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#eee5d9] bg-white px-4 py-4 sm:px-6">
          <form action={testIntegrationConnectionAction}>
            <input type="hidden" name="provider" value={connection.provider} />
            <button className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-bold text-[#23313f] hover:bg-[#f7f1e8]">Test connection</button>
          </form>
          <form action={disableIntegrationConnectionAction}>
            <input type="hidden" name="provider" value={connection.provider} />
            <button className="rounded-full bg-red-50 px-4 py-2 text-xs font-bold text-red-700 ring-1 ring-red-100 hover:bg-red-100">Disable</button>
          </form>
        </div>
      </details>
    </section>
  );
}

export default async function AdminSettingsIntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ provider?: string; saved?: string; error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  await requireAdminPermission("settings.view");
  const integrations = await listIntegrationSummaries();
  const activeProvider = String(params.provider || "ga4") as IntegrationProvider;

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white px-5 py-5 shadow-[0_10px_35px_rgba(0,0,0,0.035)] sm:px-6">
        <Link href="/admin/settings" className="text-sm font-semibold text-[#9a723e] hover:text-[#7f633a]">Back to settings</Link>
        <div className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-[#9a723e]">Settings</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1f1e1b]">Integrations</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
          Manage third-party connection settings without editing source files. Environment variables remain available as fallback when database configuration is disabled or missing.
        </p>
        {params.saved ? <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 ring-1 ring-emerald-100">Integration settings updated.</div> : null}
        {params.error ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 ring-1 ring-red-100">Connection test failed. See the provider card for details.</div> : null}
      </section>

      <div className="grid gap-5">
        {integrations.map((connection) => (
          <IntegrationCard key={connection.provider} connection={connection} active={connection.provider === activeProvider} />
        ))}
      </div>
    </div>
  );
}
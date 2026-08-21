import { createServiceClient } from "@/lib/supabase/service";

import {
  unsubscribeNotificationAction,
} from "./actions";

export const dynamic =
  "force-dynamic";

function tokenExpired(
  expiresAt: unknown,
) {
  if (!expiresAt) {
    /*
     * Backward compatibility for links created before
     * expiration was introduced.
     */
    return false;
  }

  const value =
    new Date(
      String(expiresAt),
    ).getTime();

  return (
    !Number.isFinite(value) ||
    value <= Date.now()
  );
}

function maskEmail(
  value: string,
) {
  const email =
    String(
      value || "",
    ).trim();

  const [
    local,
    domain,
  ] =
    email.split("@");

  if (
    !local ||
    !domain
  ) {
    return "";
  }

  const visible =
    local.slice(
      0,
      Math.min(
        2,
        local.length,
      ),
    );

  return `${visible}${"*".repeat(
    Math.max(
      3,
      local.length -
        visible.length,
    ),
  )}@${domain}`;
}

function maskPhone(
  value: string,
) {
  const raw =
    String(
      value || "",
    ).trim();

  const digits =
    raw.replace(
      /\D/g,
      "",
    );

  if (
    digits.length < 4
  ) {
    return "";
  }

  return `***-***-${digits.slice(
    -4,
  )}`;
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams?: Promise<{
    token?: string;
    scope?: string;
    saved?: string;
    error?: string;
  }>;
}) {
  const params =
    searchParams
      ? await searchParams
      : {};

  const token =
    String(
      params.token || "",
    ).trim();

  let info: any =
    null;

  if (token) {
    const supabase =
      createServiceClient();

    const tokenResult =
      await supabase
        .from(
          "notification_unsubscribe_tokens",
        )
        .select(
          "token,customer_id,category_code,channel,expires_at",
        )
        .eq(
          "token",
          token,
        )
        .maybeSingle();

    if (
      tokenResult.data &&
      !tokenExpired(
        tokenResult.data
          .expires_at,
      ) &&
      [
        "email",
        "sms",
      ].includes(
        String(
          tokenResult.data
            .channel || "",
        ),
      )
    ) {
      const [
        categoryResult,
        customerResult,
      ] =
        await Promise.all([
          tokenResult.data
            .category_code
            ? supabase
                .from(
                  "notification_categories",
                )
                .select(
                  "code,label,customer_configurable,mandatory,active",
                )
                .eq(
                  "code",
                  tokenResult.data
                    .category_code,
                )
                .maybeSingle()
            : Promise.resolve({
                data: null,
              }),

          supabase
            .from(
              "customers",
            )
            .select(
              "email,phone",
            )
            .eq(
              "id",
              tokenResult.data
                .customer_id,
            )
            .maybeSingle(),
        ]);

      const customer =
        customerResult.data;

      const maskedContact =
        tokenResult.data
          .channel ===
        "email"
          ? maskEmail(
              String(
                customer?.email ||
                  "",
              ),
            )
          : maskPhone(
              String(
                customer?.phone ||
                  "",
              ),
            );

      info = {
        token:
          tokenResult.data,

        category:
          categoryResult.data,

        maskedContact,
      };
    }
  }

  const explicitError =
    String(
      params.error || "",
    );

  const errorMessage =
    explicitError ===
    "expired_token"
      ? "This unsubscribe link has expired."
      : explicitError
        ? "This unsubscribe link is invalid or no longer available."
        : "This unsubscribe link is invalid or no longer available.";

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-5 py-12 text-[#1d1d1b]">
      <section className="mx-auto max-w-xl rounded-[30px] border border-black/10 bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,.06)] sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-black/40">
          Bounce Party LA
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">
          Notification preferences
        </h1>

        {params.saved ===
        "1" ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            Your preference
            has been saved.
          </div>
        ) : null}

        {params.saved ===
        "1" ? (
          <div className="mt-6">
            <p className="text-sm leading-6 text-black/60">
              Your unsubscribe
              request was
              processed
              successfully.
            </p>

            <a
              href="/account/notifications"
              className="mt-5 block text-center text-sm font-semibold underline underline-offset-4"
            >
              Open full
              notification
              preferences
            </a>
          </div>
        ) : !info ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm leading-6 text-black/60">
              Manage{" "}
              {String(
                info.token
                  .channel ||
                  "email",
              ).toUpperCase()}{" "}
              notifications
              {info.maskedContact
                ? ` for ${info.maskedContact}`
                : " for this account"}
              .
            </p>

            <div className="mt-6 rounded-2xl bg-[#f7f4ef] p-4">
              <div className="text-xs font-semibold uppercase tracking-[.12em] text-black/45">
                Notification
                type
              </div>

              <div className="mt-1 font-semibold">
                {info.category
                  ?.label ||
                  "Optional notifications"}
              </div>
            </div>

            {info.category
              ?.active !==
              false &&
            info.category
              ?.customer_configurable &&
            !info.category
              ?.mandatory ? (
              <form
                action={
                  unsubscribeNotificationAction
                }
                className="mt-6"
              >
                <input
                  type="hidden"
                  name="token"
                  value={token}
                />

                <input
                  type="hidden"
                  name="scope"
                  value="category"
                />

                <button className="w-full rounded-full border border-black/15 bg-white px-5 py-3 text-sm font-semibold">
                  Unsubscribe
                  from this
                  notification
                  type
                </button>
              </form>
            ) : null}

            <form
              action={
                unsubscribeNotificationAction
              }
              className="mt-3"
            >
              <input
                type="hidden"
                name="token"
                value={token}
              />

              <input
                type="hidden"
                name="scope"
                value="all"
              />

              <button className="w-full rounded-full bg-[#1d1d1b] px-5 py-3 text-sm font-semibold text-white">
                Unsubscribe
                from all
                optional{" "}
                {String(
                  info.token
                    .channel ||
                    "email",
                )}{" "}
                notifications
              </button>
            </form>

            <a
              href="/account/notifications"
              className="mt-5 block text-center text-sm font-semibold underline underline-offset-4"
            >
              Open full
              notification
              preferences
            </a>
          </>
        )}
      </section>
    </main>
  );
}
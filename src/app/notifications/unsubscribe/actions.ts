"use server";

import { redirect } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/service";

function text(
  formData: FormData,
  key: string,
) {
  return String(
    formData.get(key) || "",
  ).trim();
}

function isExpired(
  expiresAt: unknown,
) {
  if (!expiresAt) {
    /*
     * Backward compatibility for unsubscribe links created
     * before token expiration was introduced.
     */
    return false;
  }

  const expires =
    new Date(
      String(expiresAt),
    ).getTime();

  return (
    !Number.isFinite(expires) ||
    expires <= Date.now()
  );
}

export async function unsubscribeNotificationAction(
  formData: FormData,
) {
  const token =
    text(
      formData,
      "token",
    );

  const scope =
    text(
      formData,
      "scope",
    ) === "all"
      ? "all"
      : "category";

  if (!token) {
    redirect(
      "/notifications/unsubscribe?error=invalid_token",
    );
  }

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
    tokenResult.error ||
    !tokenResult.data
  ) {
    redirect(
      "/notifications/unsubscribe?error=invalid_token",
    );
  }

  const row =
    tokenResult.data as {
      token: string;
      customer_id: string;
      category_code:
        | string
        | null;
      channel:
        | string
        | null;
      expires_at:
        | string
        | null;
    };

  if (
    isExpired(
      row.expires_at,
    )
  ) {
    redirect(
      "/notifications/unsubscribe?error=expired_token",
    );
  }

  if (
    ![
      "email",
      "sms",
    ].includes(
      String(
        row.channel || "",
      ),
    )
  ) {
    redirect(
      "/notifications/unsubscribe?error=invalid_channel",
    );
  }

  const channel =
    row.channel as
      | "email"
      | "sms";

  let categories:
    string[] = [];

  if (
    scope === "all"
  ) {
    const categoriesResult =
      await supabase
        .from(
          "notification_categories",
        )
        .select(
          "code",
        )
        .eq(
          "active",
          true,
        )
        .eq(
          "customer_configurable",
          true,
        )
        .eq(
          "mandatory",
          false,
        );

    if (
      categoriesResult.error
    ) {
      throw new Error(
        categoriesResult
          .error.message,
      );
    }

    categories =
      (
        categoriesResult.data ||
        []
      )
        .map(
          (item: any) =>
            String(
              item.code || "",
            ).trim(),
        )
        .filter(Boolean);
  } else if (
    row.category_code
  ) {
    const categoryResult =
      await supabase
        .from(
          "notification_categories",
        )
        .select(
          "code,customer_configurable,mandatory,active",
        )
        .eq(
          "code",
          row.category_code,
        )
        .maybeSingle();

    if (
      categoryResult.error
    ) {
      throw new Error(
        categoryResult
          .error.message,
      );
    }

    if (
      categoryResult.data
        ?.active !== false &&
      categoryResult.data
        ?.customer_configurable ===
        true &&
      categoryResult.data
        ?.mandatory !== true
    ) {
      categories = [
        String(
          categoryResult.data
            .code,
        ),
      ];
    }
  }

  for (
    const categoryCode of
    categories
  ) {
    const existingResult =
      await supabase
        .from(
          "notification_preferences",
        )
        .select(
          "email_enabled,sms_enabled,in_app_enabled",
        )
        .eq(
          "customer_id",
          row.customer_id,
        )
        .eq(
          "category_code",
          categoryCode,
        )
        .maybeSingle();

    if (
      existingResult.error
    ) {
      throw new Error(
        existingResult
          .error.message,
      );
    }

    const existing: any =
      existingResult.data ||
      {};

    const preference = {
      customer_id:
        row.customer_id,

      category_code:
        categoryCode,

      email_enabled:
        channel === "email"
          ? false
          : existing
                .email_enabled ??
            true,

      sms_enabled:
        channel === "sms"
          ? false
          : existing
                .sms_enabled ??
            true,

      in_app_enabled:
        existing
          .in_app_enabled ??
        true,
    };

    const saveResult =
      await supabase
        .from(
          "notification_preferences",
        )
        .upsert(
          preference,
          {
            onConflict:
              "customer_id,category_code",
          },
        );

    if (
      saveResult.error
    ) {
      throw new Error(
        saveResult
          .error.message,
      );
    }
  }

  const tokenUpdate =
    await supabase
      .from(
        "notification_unsubscribe_tokens",
      )
      .update({
        used_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "token",
        token,
      );

  if (
    tokenUpdate.error
  ) {
    console.error(
      "Could not mark notification unsubscribe token as used.",
      tokenUpdate.error,
    );
  }

  /*
   * Do not keep the bearer token in the URL after the operation
   * has completed.
   */
  redirect(
    `/notifications/unsubscribe?saved=1&scope=${encodeURIComponent(
      scope,
    )}`,
  );
}
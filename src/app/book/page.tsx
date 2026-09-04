import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getUnifiedAccess,
} from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

type SearchParamsValue =
  | string
  | string[]
  | undefined;

type SearchParams = Promise<
  Record<
    string,
    SearchParamsValue
  >
>;

export const metadata: Metadata = {
  title: "Start Booking | Bounce Party LA",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic =
  "force-dynamic";

export default async function PublicBookGatewayPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params =
    await searchParams;

  const query =
    new URLSearchParams();

  for (
    const [
      key,
      rawValue,
    ] of Object.entries(
      params || {},
    )
  ) {
    if (
      Array.isArray(
        rawValue,
      )
    ) {
      for (
        const value of
        rawValue
      ) {
        const normalized =
          String(
            value || "",
          ).trim();

        if (normalized) {
          query.append(
            key,
            normalized,
          );
        }
      }

      continue;
    }

    const normalized =
      String(
        rawValue || "",
      ).trim();

    if (normalized) {
      query.set(
        key,
        normalized,
      );
    }
  }

  const target =
    `/account/book-now${
      query.toString()
        ? `?${query.toString()}`
        : ""
    }`;

  const supabase =
    await createClient();

  const access =
    await getUnifiedAccess(
      supabase,
    );

  if (
    access.user &&
    access.role ===
      "customer" &&
    access.isActive
  ) {
    redirect(target);
  }

  const loginQuery =
    new URLSearchParams({
      next:
        target,
      mode:
        "customer",
    });

  redirect(
    `/login?${loginQuery.toString()}`,
  );
}

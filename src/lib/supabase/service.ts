import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  ).trim();

  const serviceKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(
    url,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
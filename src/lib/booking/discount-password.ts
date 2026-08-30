import { scryptSync, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export function isMissingTableError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42p01" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation")
  );
}

export function isValidPasswordHash(stored: string | null | undefined, candidate: string) {
  if (!stored || !candidate) {
    return false;
  }

  const [salt, savedHash] = String(stored).split(":");

  if (!salt || !savedHash) {
    return false;
  }

  const computedHash = scryptSync(candidate, salt, 64).toString("hex");

  try {
    return timingSafeEqual(Buffer.from(savedHash, "hex"), Buffer.from(computedHash, "hex"));
  } catch {
    return false;
  }
}

export async function verifyBookingDiscountPassword(params: {
  supabase: SupabaseClient;
  password: string;
}) {
  const { data: settings, error } = await params.supabase
    .from("booking_discount_security_settings")
    .select("discount_password_enabled, discount_password_hash")
    .limit(1)
    .maybeSingle();

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }

  if (!settings || settings.discount_password_enabled !== true) {
    return {
      ok: true,
      message: "Discount password is disabled.",
    };
  }

  const valid = isValidPasswordHash(
    settings.discount_password_hash,
    params.password,
  );

  return {
    ok: valid,
    message: valid
      ? "Discount authorized."
      : "Invalid discount password.",
  };
}

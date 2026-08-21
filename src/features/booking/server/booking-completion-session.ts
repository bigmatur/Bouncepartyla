import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_HOLD_HOURS = 24;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function holdHours() {
  const parsed = Number(process.env.BOOKING_TEMPORARY_HOLD_HOURS || DEFAULT_HOLD_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 168) : DEFAULT_HOLD_HOURS;
}

export async function createBookingCompletionSession(params: {
  supabase: SupabaseClient;
  bookingId: string;
  customerEmail: string;
  createdByAuthUserId?: string | null;
}) {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + holdHours() * 60 * 60 * 1000).toISOString();

  await params.supabase
    .from("booking_completion_sessions")
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("booking_id", params.bookingId)
    .is("completed_at", null)
    .is("revoked_at", null);

  const { error } = await params.supabase.from("booking_completion_sessions").insert({
    booking_id: params.bookingId,
    customer_email: params.customerEmail.trim().toLowerCase(),
    token_hash: tokenHash(rawToken),
    expires_at: expiresAt,
    created_by_auth_user_id: params.createdByAuthUserId || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { token: rawToken, expiresAt };
}

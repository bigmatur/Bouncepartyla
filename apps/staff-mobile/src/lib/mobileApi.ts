import { supabase } from "./supabase";

const DEFAULT_APP_URL = "https://bouncepartyla.com";

function appUrl() {
  return String(
    process.env.EXPO_PUBLIC_APP_URL || DEFAULT_APP_URL,
  )
    .trim()
    .replace(/\/+$/, "");
}

type MobileApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function authenticatedFetch<T>(
  path: string,
  init: RequestInit,
): Promise<MobileApiResult<T>> {
  const sessionResult = await supabase.auth.getSession();
  const token = sessionResult.data.session?.access_token;

  if (!token) {
    return {
      success: false,
      error: "Your session expired. Please sign in again.",
    };
  }

  try {
    const response = await fetch(`${appUrl()}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });

    const body = await response
      .json()
      .catch(() => ({} as Record<string, unknown>));

    if (!response.ok || body?.success === false) {
      return {
        success: false,
        error:
          typeof body?.error === "string"
            ? body.error
            : `Request failed (${response.status}).`,
      };
    }

    return {
      success: true,
      data: body as T,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach the Admin API.",
    };
  }
}

export async function cancelBookingFromMobile(
  bookingId: string,
  cancellationReason: string,
) {
  return authenticatedFetch<{
    success: true;
    alreadyCancelled: boolean;
    booking: {
      id: string;
      booking_number?: string | null;
      status?: string | null;
    };
  }>(
    `/api/admin/mobile/bookings/${encodeURIComponent(bookingId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        cancellationReason,
      }),
    },
  );
}

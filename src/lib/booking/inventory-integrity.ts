import "server-only";

type SupabaseLike = {
  rpc: (
    name: string,
    params?: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: {
      message?: string;
    } | null;
  }>;
};

export async function cleanupExpiredCustomerCheckoutHoldsBestEffort(
  supabase: SupabaseLike,
  limit = 25,
) {
  try {
    const result = await supabase.rpc(
      "cleanup_expired_customer_checkout_holds",
      {
        p_limit: Math.max(
          1,
          Math.min(
            Number(limit || 25),
            100,
          ),
        ),
      },
    );

    if (result.error) {
      console.warn(
        "[inventory-integrity] cleanup skipped:",
        result.error.message ||
          "unknown RPC error",
      );

      return null;
    }

    const payload =
      result.data &&
      typeof result.data === "object"
        ? result.data
        : null;

    if (
      payload &&
      Number(
        (payload as any).removed ||
          0,
      ) > 0
    ) {
      console.info(
        "[inventory-integrity] expired customer checkout holds removed:",
        payload,
      );
    }

    return payload;
  } catch (error) {
    console.warn(
      "[inventory-integrity] cleanup failed:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return null;
  }
}

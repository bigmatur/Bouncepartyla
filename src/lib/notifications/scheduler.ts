import { createServiceClient } from "@/lib/supabase/service";
import { processNotificationQueue } from "@/lib/notifications/engine";

export async function runNotificationScheduler(params?: {
  processQueue?: boolean;
  limit?: number;
}) {
  const supabase = createServiceClient();
  const rpc = await supabase.rpc("enqueue_due_notification_schedules", {
    p_now: new Date().toISOString(),
  });

  if (rpc.error) throw new Error(rpc.error.message);

  const queued = (rpc.data || {}) as {
    success?: boolean;
    evaluated_due_bookings?: number;
    deliveries_enqueued?: number;
    ran_at?: string;
  };

  if (params?.processQueue === false) {
    return { queued, processed: null };
  }

  const processed = await processNotificationQueue({
    limit: Math.min(100, Math.max(1, Number(params?.limit || 50))),
  });

  return { queued, processed };
}

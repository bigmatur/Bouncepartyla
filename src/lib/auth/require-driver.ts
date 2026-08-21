import "server-only";

import { redirect } from "next/navigation";

import { getUnifiedAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

function isActiveDriverRecord(driverRecord: any) {
  return Boolean(driverRecord && driverRecord.active !== false && !driverRecord.deleted_at);
}

async function getLinkedDriverRecord(params: { supabase: any; userId: string; userEmail: string }) {
  const { supabase, userId, userEmail } = params;

  const { data: driverRecord, error: driverError } = await supabase
    .from("route_drivers")
    .select("id, name, color, phone, account_email, auth_user_id, notes, active, deleted_at")
    .or(`auth_user_id.eq.${userId},account_email.eq.${userEmail}`)
    .maybeSingle();

  if (driverError) {
    throw new Error(driverError.message);
  }

  return isActiveDriverRecord(driverRecord) ? driverRecord : null;
}

export async function requireDriverInterfaceAccess() {
  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user) {
    redirect(`/login?next=${encodeURIComponent("/driver")}`);
  }

  if (!access.isActive || (!access.can("preview.driver") && access.role !== "driver")) {
    redirect("/unauthorized");
  }

  const linkedDriverRecord = await getLinkedDriverRecord({
    supabase,
    userId: String(access.user.id || ""),
    userEmail: String(access.user.email || "").toLowerCase(),
  });

  if (access.role === "driver" && !linkedDriverRecord) {
    redirect("/unauthorized");
  }

  return {
    supabase,
    access,
    linkedDriverRecord,
  };
}

export async function resolveDriverRecordForView(params: {
  supabase: any;
  access: any;
  linkedDriverRecord: any | null;
  requestedDriverName?: string | null;
}) {
  const { supabase, access, linkedDriverRecord, requestedDriverName } = params;

  const cleanRequestedName = String(requestedDriverName || "").trim();
  const isDriverRole = access.role === "driver";

  if (isDriverRole) {
    if (!linkedDriverRecord) {
      redirect("/unauthorized");
    }

    return {
      driverRecord: linkedDriverRecord,
      previewMode: false,
    };
  }

  if (!access.can("preview.driver")) {
    redirect("/unauthorized");
  }

  if (cleanRequestedName) {
    const { data: namedDriver, error: namedDriverError } = await supabase
      .from("route_drivers")
      .select("id, name, color, phone, account_email, auth_user_id, notes, active, deleted_at")
      .eq("name", cleanRequestedName)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (namedDriverError) {
      throw new Error(namedDriverError.message);
    }

    if (namedDriver) {
      return {
        driverRecord: namedDriver,
        previewMode: true,
      };
    }
  }

  if (linkedDriverRecord) {
    return {
      driverRecord: linkedDriverRecord,
      previewMode: true,
    };
  }

  const { data: fallbackDriver, error: fallbackDriverError } = await supabase
    .from("route_drivers")
    .select("id, name, color, phone, account_email, auth_user_id, notes, active, deleted_at")
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackDriverError) {
    throw new Error(fallbackDriverError.message);
  }

  if (!fallbackDriver) {
    redirect("/unauthorized");
  }

  return {
    driverRecord: fallbackDriver,
    previewMode: true,
  };
}

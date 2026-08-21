"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkStartedAction } from "@/app/time-clock/actions";

const META_START = "[[STAFF_META]]";
const META_END = "[[/STAFF_META]]";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function revalidateDriverApp(date?: string, driver?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/routes");
  revalidatePath("/admin/routes/driver");
  revalidatePath("/admin/staff");

  if (date) {
    revalidatePath(
      `/admin/routes/driver?date=${encodeURIComponent(date)}${
        driver ? `&driver=${encodeURIComponent(driver)}` : ""
      }`
    );
  }
}

function parseStaffMeta(notes: string | null | undefined) {
  const raw = String(notes || "");
  const start = raw.indexOf(META_START);
  const end = raw.indexOf(META_END);

  if (start === -1 || end === -1 || end < start) {
    return {
      role: "driver",
      permissions: ["routes_board", "driver_checklists"],
      plainNotes: raw.trim(),
    };
  }

  const jsonStart = start + META_START.length;
  const rawJson = raw.slice(jsonStart, end);

  let role = "driver";
  let permissions: string[] = ["routes_board", "driver_checklists"];

  try {
    const parsed = JSON.parse(rawJson);
    role = typeof parsed?.role === "string" ? parsed.role : role;
    permissions = Array.isArray(parsed?.permissions)
      ? parsed.permissions.map((item: any) => String(item || "")).filter(Boolean)
      : permissions;
  } catch {
    // keep defaults
  }

  const before = raw.slice(0, start).trim();
  const after = raw.slice(end + META_END.length).trim();
  const plainNotes = [before, after].filter(Boolean).join("\n\n");

  return {
    role,
    permissions,
    plainNotes,
  };
}

function buildNotes({
  existingNotes,
  plainNotes,
}: {
  existingNotes: string | null | undefined;
  plainNotes: string | null;
}) {
  const parsed = parseStaffMeta(existingNotes);

  const metaBlock = `${META_START}${JSON.stringify({
    role: parsed.role || "driver",
    permissions:
      parsed.permissions && parsed.permissions.length > 0
        ? parsed.permissions
        : ["routes_board", "driver_checklists"],
  })}${META_END}`;

  const notes = String(plainNotes || "").trim();

  return notes ? `${metaBlock}\n\n${notes}` : metaBlock;
}

export async function updateDriverAppStopStatusAction(formData: FormData) {
  const supabase = await createClient();

  const stopId = getString(formData, "stopId");
  const status = getString(formData, "status");
  const date = getString(formData, "date");
  const driver = getString(formData, "driver");

  if (!stopId) {
    throw new Error("Missing route stop id.");
  }

  if (!status) {
    throw new Error("Missing status.");
  }

  const now = new Date().toISOString();

  // The first actual route action also starts the driver's work shift.
  // This is idempotent: an already open shift is reused.
  if (["on_the_way", "arrived", "installed", "picked_up", "completed"].includes(status)) {
    try {
      await ensureWorkStartedAction("driver_route");
    } catch (error: any) {
      console.warn("Driver time auto-start failed in route app", {
        stopId,
        status,
        message: String(error?.message || error || "Unknown error"),
      });
    }
  }

  const updateData: Record<string, any> = {
    status,
    updated_at: now,
  };

  if (status === "arrived") {
    updateData.arrived_at = now;
  }

  if (["installed", "picked_up", "completed"].includes(status)) {
    updateData.completed_at = now;
  }

  const { error } = await supabase
    .from("route_stops")
    .update(updateData)
    .eq("id", stopId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateDriverApp(date, driver);
}

export async function updateDriverAppProfileAction(formData: FormData) {
  const supabase = await createClient();

  const driverId = getString(formData, "driverId");
  const selectedDate = getString(formData, "selectedDate");
  const selectedDriver = getString(formData, "selectedDriver");

  const name = getString(formData, "name");
  const phone = getNullableString(formData, "phone");
  const accountEmail = getNullableString(formData, "accountEmail")?.toLowerCase() || null;
  const authUserId = getNullableString(formData, "authUserId");
  const plainNotes = getNullableString(formData, "plainNotes");

  if (!driverId) {
    throw new Error("Missing staff profile id.");
  }

  if (!name) {
    throw new Error("Driver name is required.");
  }

  const existingResult = await supabase
    .from("route_drivers")
    .select("id, notes")
    .eq("id", driverId)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  const notes = buildNotes({
    existingNotes: existingResult.data?.notes || null,
    plainNotes,
  });

  const { error } = await supabase
    .from("route_drivers")
    .update({
      name,
      phone,
      account_email: accountEmail,
      auth_user_id: authUserId,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", driverId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateDriverApp(selectedDate, selectedDriver || name);
}
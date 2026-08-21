"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/lib/auth/require-admin";

function refresh() {
  revalidatePath("/admin/staff/time", "page");
  revalidatePath("/admin/my-time", "page");
  revalidatePath("/driver/time", "page");
}

async function callAdminTimeRpc(
  name: string,
  args: Record<string, unknown>,
) {
  const { supabase } = await requireAdminPermission("staff.view");
  const result = await supabase.rpc(name, args);

  if (result.error) {
    console.error(`Working Time RPC failed: ${name}`, {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      args,
    });
    throw new Error(result.error.message);
  }

  refresh();
  return result.data;
}

function profileId(formData: FormData) {
  const value = String(formData.get("profile_id") || "").trim();
  if (!value) throw new Error("Employee profile is required.");
  return value;
}

export async function adminStartWorkAction(formData: FormData) {
  await callAdminTimeRpc("admin_start_staff_time", {
    p_profile_id: profileId(formData),
    p_source: "admin_adjustment",
  });
}

export async function adminStartBreakAction(formData: FormData) {
  await callAdminTimeRpc("admin_start_staff_break", {
    p_profile_id: profileId(formData),
  });
}

export async function adminResumeWorkAction(formData: FormData) {
  await callAdminTimeRpc("admin_resume_staff_work", {
    p_profile_id: profileId(formData),
  });
}

export async function adminFinishWorkAction(formData: FormData) {
  await callAdminTimeRpc("admin_finish_staff_time", {
    p_profile_id: profileId(formData),
  });
}

export async function adminSetPayRateAction(formData: FormData) {
  const rate = Number(formData.get("hourly_rate"));
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("Enter a valid hourly rate.");
  }

  const effectiveFrom =
    String(formData.get("effective_from") || "").trim() || null;

  await callAdminTimeRpc("admin_set_staff_pay_rate", {
    p_profile_id: profileId(formData),
    p_hourly_rate: rate,
    p_overtime_eligible:
      String(formData.get("overtime_eligible") || "") === "on",
    p_effective_from: effectiveFrom,
  });
}


function requiredText(formData: FormData, name: string, label: string) {
  const value = String(formData.get(name) || "").trim();

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function optionalText(formData: FormData, name: string) {
  return String(formData.get(name) || "").trim() || null;
}

export async function adminUpdateShiftAction(formData: FormData) {
  await callAdminTimeRpc("admin_update_staff_shift", {
    p_time_entry_id: requiredText(formData, "time_entry_id", "Shift"),
    p_clock_in_local: requiredText(
      formData,
      "clock_in_local",
      "Clock-in time",
    ),
    p_clock_out_local: optionalText(formData, "clock_out_local"),
    p_reason: requiredText(formData, "reason", "Reason"),
  });
}

export async function adminAddMissedShiftAction(formData: FormData) {
  await callAdminTimeRpc("admin_add_staff_shift", {
    p_profile_id: profileId(formData),
    p_clock_in_local: requiredText(
      formData,
      "clock_in_local",
      "Clock-in time",
    ),
    p_clock_out_local: requiredText(
      formData,
      "clock_out_local",
      "Clock-out time",
    ),
    p_reason: requiredText(formData, "reason", "Reason"),
  });
}


export async function adminReviewBreakPremiumAction(formData: FormData) {
  const premiumType = requiredText(formData, "premium_type", "Premium type");
  const decision = requiredText(formData, "decision", "Decision");
  const workDate = requiredText(formData, "work_date", "Work date");

  await callAdminTimeRpc("admin_review_staff_break_premium", {
    p_profile_id: profileId(formData),
    p_work_date: workDate,
    p_premium_type: premiumType,
    p_decision: decision,
    p_reason: requiredText(formData, "reason", "Reason"),
  });
}

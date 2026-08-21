"use server";

import { revalidatePath } from "next/cache";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

const REFRESH_PATHS = [
  "/admin/my-time",
  "/admin/staff/time",
  "/driver/time",
  "/admin/routes/driver",
];

function refreshTimePages() {
  for (const path of REFRESH_PATHS) {
    revalidatePath(path, "page");
  }
}

async function getContext() {
  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user || !access.isActive || !isStaffRole(access.role)) {
    throw new Error("A staff account is required.");
  }

  return { supabase };
}

function normalizeSource(
  value: unknown,
): "manual" | "driver_route" | "cleaning" {
  const source = String(value || "manual");

  if (source === "driver_route" || source === "cleaning") {
    return source;
  }

  return "manual";
}

async function callTimeRpc(
  rpcName: string,
  args: Record<string, unknown> = {},
) {
  const { supabase } = await getContext();

  const result = await supabase.rpc(rpcName, args);

  if (result.error) {
    console.error(`Time Clock RPC failed: ${rpcName}`, {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      args,
    });

    throw new Error(result.error.message);
  }

  refreshTimePages();

  return result.data;
}

/**
 * Используется Driver View и Cleaning.
 *
 * Если открытая смена уже существует, RPC вернёт её ID
 * и не создаст дублирующую запись.
 */
export async function ensureWorkStartedAction(
  source: string = "manual",
) {
  return callTimeRpc("start_my_staff_time", {
    p_source: normalizeSource(source),
  });
}

/**
 * Ручной старт смены со страницы My Time.
 */
export async function startWorkAction(formData: FormData) {
  await callTimeRpc("start_my_staff_time", {
    p_source: normalizeSource(formData.get("source")),
  });
}

/**
 * Начало неоплачиваемого перерыва.
 */
export async function startBreakAction() {
  await callTimeRpc("start_my_staff_break");
}

/**
 * Завершение текущего перерыва.
 */
export async function resumeWorkAction() {
  await callTimeRpc("resume_my_staff_work");
}

/**
 * Закрывает открытый перерыв и текущую смену.
 */
export async function finishWorkAction() {
  await callTimeRpc("finish_my_staff_time");
}
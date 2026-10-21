"use server";

import { revalidatePath } from "next/cache";
import { ensureWorkStartedAction } from "@/app/time-clock/actions";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getTaskIds(formData: FormData) {
  return Array.from(
    new Set(
      formData
        .getAll("taskIds")
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function revalidateCleaning(itemId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/operations");
  revalidatePath("/admin/inventory/cleaning");
  revalidatePath("/admin/inventory/returns");
  revalidatePath("/admin/inventory/movements");

  if (itemId) {
    revalidatePath(`/admin/inventory/items/${itemId}`);
  }
}

export async function startCleaningTaskAction(formData: FormData) {
  const taskId = getString(formData, "taskId");
  if (!taskId) throw new Error("Missing cleaning task id.");

  await ensureWorkStartedAction("cleaning");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_inventory_cleaning_task", {
    p_task_id: taskId,
  });

  if (error) throw new Error(error.message);

  revalidateCleaning((data as any)?.inventory_item_id || undefined);
}

export async function completeCleaningTaskAction(formData: FormData) {
  const taskId = getString(formData, "taskId");
  if (!taskId) throw new Error("Missing cleaning task id.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_inventory_cleaning_task", {
    p_task_id: taskId,
  });

  if (error) throw new Error(error.message);

  revalidateCleaning((data as any)?.inventory_item_id || undefined);
}

export async function problemCleaningTaskAction(formData: FormData) {
  const taskId = getString(formData, "taskId");
  const notes = getNullableString(formData, "notes");

  if (!taskId) throw new Error("Missing cleaning task id.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("problem_inventory_cleaning_task", {
    p_task_id: taskId,
    p_notes: notes,
  });

  if (error) throw new Error(error.message);

  revalidateCleaning((data as any)?.inventory_item_id || undefined);
}

export async function bulkApplyCleaningTasksAction(formData: FormData) {
  const action = getString(formData, "bulkAction");
  const notes = getNullableString(formData, "bulkNotes");
  const taskIds = getTaskIds(formData);

  if (!taskIds.length) {
    throw new Error("Select at least one cleaning task.");
  }

  if (!["start", "complete", "problem"].includes(action)) {
    throw new Error("Unsupported bulk cleaning action.");
  }

  if (action === "start") {
    await ensureWorkStartedAction("cleaning");
  }

  const supabase = await createClient();
  const touchedItemIds = new Set<string>();

  for (const taskId of taskIds) {
    const rpcName =
      action === "start"
        ? "start_inventory_cleaning_task"
        : action === "complete"
          ? "complete_inventory_cleaning_task"
          : "problem_inventory_cleaning_task";

    const rpcArgs =
      action === "problem"
        ? {
            p_task_id: taskId,
            p_notes: notes,
          }
        : {
            p_task_id: taskId,
          };

    const { data, error } = await supabase.rpc(
      rpcName,
      rpcArgs,
    );

    if (error) {
      throw new Error(error.message);
    }

    const itemId = String(
      (data as any)?.inventory_item_id || "",
    ).trim();

    if (itemId) {
      touchedItemIds.add(itemId);
    }
  }

  if (!touchedItemIds.size) {
    revalidateCleaning();
    return;
  }

  for (const itemId of touchedItemIds) {
    revalidateCleaning(itemId);
  }
}

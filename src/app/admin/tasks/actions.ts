"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getDueAt(formData: FormData) {
  const dueDate = getString(formData, "dueDate");
  const dueTime = getString(formData, "dueTime") || "09:00";

  if (!dueDate) return null;

  return `${dueDate}T${dueTime}:00`;
}

function revalidateTasks() {
  revalidatePath("/admin");
  revalidatePath("/admin/tasks");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/customers");
}

export async function createTaskAction(formData: FormData) {
  const supabase = await createClient();

  const title = getString(formData, "title");
  const description = getNullableString(formData, "description");
  const taskType = getString(formData, "taskType") || "follow_up";
  const dueAt = getDueAt(formData);
  const bookingId = getNullableString(formData, "bookingId");
  const customerId = getNullableString(formData, "customerId");
  const leadId = getNullableString(formData, "leadId");

  if (!title) {
    throw new Error("Task title is required.");
  }

  const { error } = await supabase.from("tasks").insert({
    title,
    description,
    task_type: taskType,
    due_at: dueAt,
    booking_id: bookingId,
    customer_id: customerId,
    lead_id: leadId,
    status: "open",
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateTasks();
  if (leadId) revalidatePath(`/admin/crm/events/${leadId}`);
}

export async function completeTaskAction(formData: FormData) {
  const supabase = await createClient();
  const taskId = getString(formData, "taskId");
  const leadId = getNullableString(formData, "leadId");

  if (!taskId) {
    throw new Error("Missing task id.");
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateTasks();
  if (leadId) revalidatePath(`/admin/crm/events/${leadId}`);
}

export async function reopenTaskAction(formData: FormData) {
  const supabase = await createClient();
  const taskId = getString(formData, "taskId");

  if (!taskId) {
    throw new Error("Missing task id.");
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      status: "open",
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateTasks();
}

export async function deleteTaskAction(formData: FormData) {
  const supabase = await createClient();
  const taskId = getString(formData, "taskId");

  if (!taskId) {
    throw new Error("Missing task id.");
  }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateTasks();
}

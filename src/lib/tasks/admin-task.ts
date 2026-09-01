import "server-only";

export async function setAdminTaskCompletedCore(params: {
  supabase: any;
  taskId: string;
  completed: boolean;
}) {
  const taskId = String(params.taskId || "").trim();

  if (!taskId) {
    throw new Error("Missing task id.");
  }

  const now = new Date().toISOString();
  const result = await params.supabase
    .from("tasks")
    .update({
      status: params.completed ? "completed" : "open",
      completed_at: params.completed ? now : null,
      updated_at: now,
    })
    .eq("id", taskId);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return {
    taskId,
    status: params.completed ? "completed" : "open",
    completedAt: params.completed ? now : null,
  };
}

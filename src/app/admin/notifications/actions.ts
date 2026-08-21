"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { processNotificationQueue } from "@/lib/notifications/engine";
import { runNotificationScheduler } from "@/lib/notifications/scheduler";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function checked(formData: FormData, key: string) {
  return ["1", "true", "on", "yes"].includes(text(formData, key).toLowerCase());
}

const TEMPLATE_VARIABLES = new Set([
  "customer_name",
  "customer_first_name",
  "booking_number",
  "event_date",
  "total",
  "deposit_amount",
  "amount_paid",
  "balance_due",
  "payment_amount",
  "tip_amount",
  "booking_url",
  "action_url",
  "expires_at",
  "preferences_url",
  "unsubscribe_category_url",
  "unsubscribe_all_url",
]);

function validateTemplateVariables(value: string) {
  for (const match of value.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    const key = String(match[1] || "");
    if (!TEMPLATE_VARIABLES.has(key)) {
      throw new Error(`Unknown template variable: {{${key}}}`);
    }
  }
}

function validateTemplateHtml(value: string) {
  const lower = value.toLowerCase();
  const blocked = ["<script", "<iframe", "javascript:", " onerror=", " onload="];
  if (blocked.some((token) => lower.includes(token))) {
    throw new Error("Template HTML contains a blocked element or attribute.");
  }
}

export async function updateNotificationRuleAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.view");
  const ruleId = text(formData, "ruleId");
  if (!ruleId) throw new Error("Missing notification rule id.");

  const { error } = await supabase
    .from("notification_rules")
    .update({
      enabled: checked(formData, "enabled"),
      delay_minutes: Math.max(0, Number(text(formData, "delayMinutes") || 0)),
    })
    .eq("id", ruleId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
  redirect("/admin/notifications?saved=rule");
}

export async function updateNotificationChannelAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.view");
  const channel = text(formData, "channel");
  if (!['email','sms','in_app'].includes(channel)) throw new Error("Invalid notification channel.");

  const { error } = await supabase
    .from("notification_channel_settings")
    .update({
      enabled: checked(formData, "enabled"),
      sender_label: text(formData, "senderLabel") || null,
      sender_value: text(formData, "senderValue") || null,
    })
    .eq("channel", channel);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
  redirect("/admin/notifications?saved=channel");
}


export async function processNotificationQueueAction() {
  await requireAdminPermission("settings.view");
  const result = await processNotificationQueue({ limit: 50 });
  revalidatePath("/admin/notifications");
  redirect(`/admin/notifications?saved=processed&processed=${result.processed}&sent=${result.sent}&failed=${result.failed}`);
}

export async function updateNotificationTemplateAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.view");
  const templateId = text(formData, "templateId");
  const channel = text(formData, "channel");
  if (!templateId) throw new Error("Missing notification template id.");
  if (!["email", "sms", "in_app"].includes(channel)) throw new Error("Invalid template channel.");

  const name = text(formData, "name").slice(0, 160);
  const subject = text(formData, "subject").slice(0, 240);
  const bodyText = String(formData.get("bodyText") || "").trim().slice(0, channel === "sms" ? 1600 : 20000);
  const bodyHtml = String(formData.get("bodyHtml") || "").trim().slice(0, 50000);

  validateTemplateVariables(subject);
  validateTemplateVariables(bodyText);
  validateTemplateVariables(bodyHtml);
  validateTemplateHtml(bodyHtml);

  if (channel === "sms" && !bodyText) throw new Error("SMS template requires text.");
  if (channel === "email" && !subject) throw new Error("Email template requires a subject.");

  const { error } = await supabase
    .from("notification_templates")
    .update({
      name: name || "Notification template",
      subject: subject || null,
      body_text: bodyText || null,
      body_html: bodyHtml || null,
      active: checked(formData, "active"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
    .eq("channel", channel);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
  redirect("/admin/notifications?saved=template");
}


export async function updateNotificationScheduleAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.view");
  const scheduleId = text(formData, "scheduleId");
  if (!scheduleId) throw new Error("Missing notification schedule id.");

  const offsetValue = Math.max(0, Math.floor(Number(text(formData, "offsetValue") || 0)));
  const offsetUnit = text(formData, "offsetUnit") || "minutes";
  const unitMultiplier = offsetUnit === "days" ? 1440 : offsetUnit === "hours" ? 60 : 1;
  const catchupMinutes = Math.max(5, Math.floor(Number(text(formData, "catchupMinutes") || 180)));

  const { error } = await supabase
    .from("notification_schedules")
    .update({
      enabled: checked(formData, "enabled"),
      offset_minutes: offsetValue * unitMultiplier,
      catchup_minutes: catchupMinutes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/notifications");
  redirect("/admin/notifications?saved=schedule");
}

export async function runNotificationSchedulerAction() {
  await requireAdminPermission("settings.view");
  const result = await runNotificationScheduler({ processQueue: true, limit: 50 });
  const enqueued = Number(result.queued?.deliveries_enqueued || 0);
  const processed = Number(result.processed?.processed || 0);
  const sent = Number(result.processed?.sent || 0) + Number(result.processed?.delivered || 0);
  const failed = Number(result.processed?.failed || 0);

  revalidatePath("/admin/notifications");
  redirect(`/admin/notifications?saved=scheduler&enqueued=${enqueued}&processed=${processed}&sent=${sent}&failed=${failed}`);
}

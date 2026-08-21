"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { syncCrmGmailInbox } from "@/lib/crm/gmail";
import { simulateCrmInstagramInbound } from "@/lib/crm/instagram";
import {
  parseCrmAttachments,
  removeCrmAttachments,
} from "@/lib/communication/attachments";
import { sendCrmConversationReply } from "@/lib/communication";

export async function syncCrmEmailInboxAction() {
  await requireAdminPermission("customers.edit");
  await syncCrmGmailInbox();

  revalidatePath("/admin/crm");
  revalidatePath("/admin/crm/inbox");

  redirect("/admin/crm/inbox");
}

export async function simulateCrmInstagramInboundAction(
  formData: FormData,
) {
  await requireAdminPermission("customers.edit");

  const senderId = String(formData.get("senderId") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const body = String(formData.get("body") || "").trim();

  if (!username) throw new Error("Instagram username is required.");
  if (!body) throw new Error("Instagram message is required.");

  await simulateCrmInstagramInbound({
    senderId: senderId || `sim_${Date.now()}`,
    username,
    body,
  });

  revalidatePath("/admin/crm");
  revalidatePath("/admin/crm/inbox");

  redirect("/admin/crm/inbox");
}

export async function replyToCrmConversationAction(
  formData: FormData,
) {
  await requireAdminPermission("customers.edit");

  const conversationId = String(
    formData.get("conversationId") || "",
  ).trim();

  const body = String(formData.get("body") || "").trim();
  const attachmentsJson = String(
    formData.get("attachmentsJson") || "[]",
  );

  let rawAttachments: unknown = [];

  try {
    rawAttachments = JSON.parse(attachmentsJson);
  } catch {
    throw new Error("Attachment metadata is invalid.");
  }

  const attachments = parseCrmAttachments(rawAttachments);

  if (!conversationId) throw new Error("Missing conversation id.");
  if (!body && attachments.length === 0) {
    throw new Error("Message or attachment is required.");
  }

  try {
    await sendCrmConversationReply({
      conversationId,
      body,
      attachments,
    });
  } catch (error) {
    if (attachments.length > 0) {
      await removeCrmAttachments({
        conversationId,
        attachments,
      }).catch(() => undefined);
    }

    throw error;
  }

  revalidatePath("/admin/crm");
  revalidatePath("/admin/crm/inbox");
  revalidatePath(`/admin/crm/inbox/${conversationId}`);
}

export async function markCrmConversationReadAction(
  conversationId: string,
) {
  const { supabase } = await requireAdminPermission("customers.view");

  const safeConversationId = String(conversationId || "").trim();

  if (!safeConversationId) {
    throw new Error("Missing conversation id.");
  }

  const now = new Date().toISOString();

  const result = await supabase
    .from("crm_conversations")
    .update({
      unread_count: 0,
      last_read_at: now,
      updated_at: now,
    })
    .eq("id", safeConversationId);

  if (result.error) throw new Error(result.error.message);

  revalidatePath("/admin/crm/inbox");
  revalidatePath(`/admin/crm/inbox/${safeConversationId}`);
}

export async function setCrmConversationClosedAction(
  formData: FormData,
) {
  const { supabase } = await requireAdminPermission("customers.edit");

  const conversationId = String(
    formData.get("conversationId") || "",
  ).trim();

  const closed = String(formData.get("closed") || "") === "1";

  if (!conversationId) throw new Error("Missing conversation id.");

  const updatePayload: {
    status: string;
    needs_reply?: boolean;
    updated_at: string;
  } = {
    status: closed ? "closed" : "open",
    updated_at: new Date().toISOString(),
  };

  if (closed) {
    updatePayload.needs_reply = false;
  }

  const result = await supabase
    .from("crm_conversations")
    .update(updatePayload)
    .eq("id", conversationId);

  if (result.error) throw new Error(result.error.message);

  revalidatePath("/admin/crm");
  revalidatePath("/admin/crm/inbox");
  revalidatePath(`/admin/crm/inbox/${conversationId}`);

  redirect(`/admin/crm/inbox/${conversationId}`);
}

export async function updateCrmLeadNotesAction(
  formData: FormData,
) {
  const leadId = String(
    formData.get("leadId") || "",
  ).trim();

  const notes = String(
    formData.get("notes") || "",
  ).trim();

  if (!leadId) {
    throw new Error("Lead ID is required.");
  }

  const { supabase } =
    await requireAdminPermission(
      "customers.edit",
    );

  const { error } = await supabase
    .from("booking_leads")
    .update({
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/crm/inbox");
  revalidatePath(`/admin/crm/events/${leadId}`);
  revalidatePath("/admin/leads");
}

export async function updateCrmLeadFollowUpAction(
  formData: FormData,
) {
  const leadId = String(
    formData.get("leadId") || "",
  ).trim();

  const followUpDate = String(
    formData.get("followUpDate") || "",
  ).trim();

  if (!leadId) {
    throw new Error("Lead ID is required.");
  }

  if (
    followUpDate &&
    !/^\d{4}-\d{2}-\d{2}$/.test(
      followUpDate,
    )
  ) {
    throw new Error(
      "Follow-up date is invalid.",
    );
  }

  const { supabase } =
    await requireAdminPermission(
      "customers.edit",
    );

  const nextFollowUpAt = followUpDate
    ? `${followUpDate}T12:00:00`
    : null;

  const { error } = await supabase
    .from("booking_leads")
    .update({
      next_follow_up_at: nextFollowUpAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/crm/inbox");
  revalidatePath(
    `/admin/crm/events/${leadId}`,
  );
  revalidatePath("/admin/leads");
}

export async function updateCrmLeadStatusAction(
  formData: FormData,
) {
  const leadId = String(
    formData.get("leadId") || "",
  ).trim();

  const status = String(
    formData.get("status") || "",
  ).trim();

  const reason = String(
    formData.get("reason") || "",
  ).trim();

  if (!leadId) {
    throw new Error("Lead ID is required.");
  }

  if (
    ![
      "new",
      "quote_sent",
      "follow_up",
      "deposit_pending",
      "booked",
      "lost",
      "cancelled",
    ].includes(status)
  ) {
    throw new Error("Invalid lead status.");
  }

  const { supabase } =
    await requireAdminPermission(
      "customers.edit",
    );

  const currentResult = await supabase
    .from("booking_leads")
    .select("id, status")
    .eq("id", leadId)
    .maybeSingle();

  if (currentResult.error) {
    throw new Error(
      currentResult.error.message,
    );
  }

  if (!currentResult.data) {
    throw new Error("Lead not found.");
  }

  const previousStatus = String(
    currentResult.data.status || "new",
  );

  if (previousStatus === status) {
    revalidatePath("/admin/crm/inbox");
    return;
  }

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (
    status === "quote_sent" ||
    status === "follow_up"
  ) {
    updateData.last_contacted_at =
      new Date().toISOString();
  }

  const { error: updateError } =
    await supabase
      .from("booking_leads")
      .update(updateData)
      .eq("id", leadId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: historyError } =
    await supabase
      .from("crm_pipeline_history")
      .insert({
        lead_id: leadId,
        from_status: previousStatus,
        to_status: status,
        reason: reason || null,
        changed_at: new Date().toISOString(),
        metadata: {
          source: "crm_inbox",
        },
      });

  if (historyError) {
    throw new Error(
      `Lead status updated, but pipeline history failed: ${historyError.message}`,
    );
  }

  revalidatePath("/admin/crm/inbox");
  revalidatePath(
    `/admin/crm/events/${leadId}`,
  );
  revalidatePath("/admin/leads");
  revalidatePath("/admin/crm");
}


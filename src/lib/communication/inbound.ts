import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type {
  CrmCommunicationChannel,
} from "@/lib/communication/types";

type IdentityType =
  | "email"
  | "phone"
  | "instagram";

type InboundMessage = {
  channel: CrmCommunicationChannel;
  identityType: IdentityType;
  identityValue: string;
  normalizedIdentity: string;
  displayIdentity?: string;
  senderDisplayName?: string;
  recipientIdentity?: string | null;
  providerMessageId: string;
  providerThreadId?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  sentAt?: string | null;
  metadata?: Record<string, unknown>;
};

type Owner = {
  customer_id: string | null;
  lead_id: string | null;
};

function normalizePhone(value: string) {
  const digits = String(value || "")
    .replace(/\D/g, "");

  if (!digits) return "";

  return digits.length >= 10
    ? digits.slice(-10)
    : digits;
}

async function findExistingIdentity(params: {
  identityType: IdentityType;
  normalizedIdentity: string;
}): Promise<Owner | null> {
  const supabase = createServiceClient();

  const result = await supabase
    .from("crm_contact_identities")
    .select("customer_id, lead_id")
    .eq(
      "identity_type",
      params.identityType,
    )
    .eq(
      "normalized_value",
      params.normalizedIdentity,
    )
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }

  return result.data || null;
}

async function findCustomer(
  params: InboundMessage,
): Promise<string | null> {
  const supabase =
    createServiceClient();

  if (
    params.identityType === "email"
  ) {
    const customer = await supabase
      .from("customers")
      .select("id")
      .ilike(
        "email",
        params.normalizedIdentity,
      )
      .limit(1)
      .maybeSingle();

    if (customer.error) {
      throw new Error(
        customer.error.message,
      );
    }

    return customer.data?.id
      ? String(customer.data.id)
      : null;
  }

  if (
    params.identityType === "phone"
  ) {
    const customers =
      await supabase
        .from("customers")
        .select("id, phone")
        .not("phone", "is", null)
        .limit(5000);

    if (customers.error) {
      throw new Error(
        customers.error.message,
      );
    }

    const match =
      (customers.data || []).find(
        (row: any) =>
          normalizePhone(
            row.phone,
          ) ===
          params.normalizedIdentity,
      );

    return match?.id
      ? String(match.id)
      : null;
  }

  return null;
}

async function findOrCreateLead(
  params: InboundMessage,
): Promise<string> {
  const supabase =
    createServiceClient();

  if (
    params.identityType === "email"
  ) {
    const lead = await supabase
      .from("booking_leads")
      .select("id")
      .ilike(
        "customer_email",
        params.normalizedIdentity,
      )
      .not(
        "status",
        "in",
        "(lost,cancelled)",
      )
      .order("updated_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (lead.error) {
      throw new Error(
        lead.error.message,
      );
    }

    if (lead.data?.id) {
      return String(
        lead.data.id,
      );
    }
  }

  if (
    params.identityType === "phone"
  ) {
    const leads =
      await supabase
        .from("booking_leads")
        .select(
          "id, customer_phone",
        )
        .not(
          "customer_phone",
          "is",
          null,
        )
        .not(
          "status",
          "in",
          "(lost,cancelled)",
        )
        .order("updated_at", {
          ascending: false,
        })
        .limit(5000);

    if (leads.error) {
      throw new Error(
        leads.error.message,
      );
    }

    const match =
      (leads.data || []).find(
        (row: any) =>
          normalizePhone(
            row.customer_phone,
          ) ===
          params.normalizedIdentity,
      );

    if (match?.id) {
      return String(match.id);
    }
  }

  if (
    params.identityType ===
    "instagram"
  ) {
    const lead = await supabase
      .from("booking_leads")
      .select("id")
      .eq(
        "instagram_username",
        params.normalizedIdentity,
      )
      .not(
        "status",
        "in",
        "(lost,cancelled)",
      )
      .order("updated_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (lead.error) {
      throw new Error(
        lead.error.message,
      );
    }

    if (lead.data?.id) {
      return String(
        lead.data.id,
      );
    }
  }

  const leadInsert:
    Record<string, unknown> = {
      customer_name:
        params.senderDisplayName ||
        params.displayIdentity ||
        params.identityValue ||
        "CRM contact",

      source:
        params.channel,

      status:
        "new",

      notes:
        `Created automatically from an inbound CRM ${params.channel} message.`,

      updated_at:
        new Date().toISOString(),
    };

  if (
    params.identityType === "email"
  ) {
    leadInsert.customer_email =
      params.identityValue;
  }

  if (
    params.identityType === "phone"
  ) {
    leadInsert.customer_phone =
      params.identityValue;
  }

  if (
    params.identityType ===
    "instagram"
  ) {
    leadInsert.instagram_username =
      params.normalizedIdentity;
  }

  const created = await supabase
    .from("booking_leads")
    .insert(leadInsert)
    .select("id")
    .single();

  if (created.error) {
    throw new Error(
      created.error.message,
    );
  }

  return String(
    created.data.id,
  );
}

async function resolveOwner(
  params: InboundMessage,
): Promise<Owner> {
  const existing =
    await findExistingIdentity({
      identityType:
        params.identityType,

      normalizedIdentity:
        params.normalizedIdentity,
    });

  if (existing) {
    return existing;
  }

  const supabase =
    createServiceClient();

  const customerId =
    await findCustomer(params);

  const leadId =
    customerId
      ? null
      : await findOrCreateLead(
          params,
        );

  const identity =
    await supabase
      .from(
        "crm_contact_identities",
      )
      .upsert(
        {
          customer_id:
            customerId,

          lead_id:
            leadId,

          identity_type:
            params.identityType,

          identity_value:
            params.identityValue,

          normalized_value:
            params.normalizedIdentity,

          display_value:
            params.displayIdentity ||
            params.identityValue,

          is_primary:
            true,

          verified_at:
            new Date()
              .toISOString(),

          updated_at:
            new Date()
              .toISOString(),
        },
        {
          onConflict:
            "identity_type,normalized_value",

          ignoreDuplicates:
            true,
        },
      );

  if (identity.error) {
    throw new Error(
      identity.error.message,
    );
  }

  return {
    customer_id:
      customerId,

    lead_id:
      leadId,
  };
}

async function resolveConversation(
  params: InboundMessage,
  owner: Owner,
) {
  const supabase =
    createServiceClient();

  if (
    params.providerThreadId
  ) {
    const threadMatch =
      await supabase
        .from("crm_messages")
        .select(
          "conversation_id",
        )
        .eq(
          "channel",
          params.channel,
        )
        .eq(
          "provider_thread_id",
          params.providerThreadId,
        )
        .limit(1)
        .maybeSingle();

    if (threadMatch.error) {
      throw new Error(
        threadMatch.error.message,
      );
    }

    if (
      threadMatch.data
        ?.conversation_id
    ) {
      return String(
        threadMatch.data
          .conversation_id,
      );
    }
  }

  let query =
    supabase
      .from("crm_conversations")
      .select("id")
      .eq("status", "open");

  if (owner.customer_id) {
    query = query.eq(
      "customer_id",
      owner.customer_id,
    );
  } else if (owner.lead_id) {
    query = query.eq(
      "lead_id",
      owner.lead_id,
    );
  } else {
    throw new Error(
      "CRM conversation owner is missing.",
    );
  }

  const existing =
    await query
      .order("last_message_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(1)
      .maybeSingle();

  if (existing.error) {
    throw new Error(
      existing.error.message,
    );
  }

  if (existing.data?.id) {
    return String(
      existing.data.id,
    );
  }

  const subject =
    String(
      params.subject || "",
    ).trim() ||
    `${params.channel.toUpperCase()} conversation`;

  const created =
    await supabase
      .from("crm_conversations")
      .insert({
        customer_id:
          owner.customer_id,

        lead_id:
          owner.lead_id,

        subject:
          subject.slice(
            0,
            240,
          ),

        status:
          "open",

        priority:
          "normal",

        needs_reply:
          true,

        unread_count:
          0,

        last_channel:
          params.channel,
      })
      .select("id")
      .single();

  if (created.error) {
    throw new Error(
      created.error.message,
    );
  }

  return String(
    created.data.id,
  );
}

export async function ingestCrmInboundMessage(
  params: InboundMessage,
) {
  const channel =
    String(
      params.channel || "",
    )
      .trim()
      .toLowerCase() as
      CrmCommunicationChannel;

  const providerMessageId =
    String(
      params.providerMessageId ||
        "",
    ).trim();

  const identityValue =
    String(
      params.identityValue ||
        "",
    ).trim();

  const normalizedIdentity =
    String(
      params.normalizedIdentity ||
        "",
    )
      .trim()
      .toLowerCase();

  if (!providerMessageId) {
    throw new Error(
      "Inbound CRM message is missing providerMessageId.",
    );
  }

  if (
    !identityValue ||
    !normalizedIdentity
  ) {
    throw new Error(
      "Inbound CRM message is missing sender identity.",
    );
  }

  const normalized:
    InboundMessage = {
      ...params,
      channel,
      providerMessageId,
      identityValue,
      normalizedIdentity,
    };

  const supabase =
    createServiceClient();

  const duplicate =
    await supabase
      .from("crm_messages")
      .select(
        "id, conversation_id",
      )
      .eq(
        "channel",
        channel,
      )
      .eq(
        "provider_message_id",
        providerMessageId,
      )
      .limit(1)
      .maybeSingle();

  if (duplicate.error) {
    throw new Error(
      duplicate.error.message,
    );
  }

  if (
    duplicate.data?.id
  ) {
    return {
      duplicate: true,

      conversationId:
        String(
          duplicate.data
            .conversation_id ||
            "",
        ),
    };
  }

  const owner =
    await resolveOwner(
      normalized,
    );

  const conversationId =
    await resolveConversation(
      normalized,
      owner,
    );

  const occurredAt =
    params.sentAt ||
    new Date().toISOString();

  const inserted =
    await supabase
      .from("crm_messages")
      .insert({
        conversation_id:
          conversationId,

        direction:
          "inbound",

        channel,

        sender_identity:
          identityValue,

        recipient_identity:
          params.recipientIdentity ||
          null,

        body_text:
          String(
            params.bodyText ||
              "",
          ).slice(
            0,
            100000,
          ),

        body_html:
          params.bodyHtml
            ? String(
                params.bodyHtml,
              ).slice(
                0,
                250000,
              )
            : null,

        provider_message_id:
          providerMessageId,

        provider_thread_id:
          params.providerThreadId ||
          null,

        status:
          "received",

        sent_at:
          occurredAt,

        metadata:
          params.metadata || {},
      });

  if (inserted.error) {
    if (
      String(
        inserted.error.code ||
          "",
      ) === "23505"
    ) {
      return {
        duplicate: true,
        conversationId,
      };
    }

    throw new Error(
      inserted.error.message,
    );
  }

  /*
   * unread_count is intentionally
   * separate from needs_reply.
   *
   * Reading a message:
   *   unread_count = 0
   *
   * Answering a message:
   *   needs_reply = false
   */

  const currentConversation =
    await supabase
      .from("crm_conversations")
      .select("unread_count")
      .eq(
        "id",
        conversationId,
      )
      .single();

  if (
    currentConversation.error
  ) {
    throw new Error(
      currentConversation
        .error.message,
    );
  }

  const currentUnread =
    Math.max(
      0,
      Number(
        currentConversation
          .data?.unread_count ||
          0,
      ),
    );

  const updated =
    await supabase
      .from("crm_conversations")
      .update({
        status:
          "open",

        needs_reply:
          true,

        unread_count:
          currentUnread + 1,

        last_channel:
          channel,

        last_message_at:
          occurredAt,

        last_inbound_at:
          occurredAt,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        conversationId,
      );

  if (updated.error) {
    throw new Error(
      updated.error.message,
    );
  }

  return {
    duplicate: false,
    conversationId,
  };
}
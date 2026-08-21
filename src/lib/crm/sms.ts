import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { ingestCrmInboundMessage } from "@/lib/communication/inbound";
import type {
  CrmAttachmentWithUrl,
} from "@/lib/communication/types";

function env(name: string) {
  return String(
    process.env[name] || "",
  ).trim();
}

export function normalizeCrmPhone(
  value: string,
) {
  const digits = String(
    value || "",
  ).replace(/\D/g, "");

  if (!digits) return "";

  return digits.length >= 10
    ? digits.slice(-10)
    : digits;
}

function phoneKey(value: string) {
  return normalizeCrmPhone(value);
}

function toTwilioPhone(value: string) {
  const raw = String(
    value || "",
  ).trim();

  const digits =
    raw.replace(/\D/g, "");

  if (
    raw.startsWith("+") &&
    digits
  ) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (
    digits.length === 11 &&
    digits.startsWith("1")
  ) {
    return `+${digits}`;
  }

  return raw;
}

export function getCrmSmsConfiguration() {
  const accountSid = env(
    "TWILIO_ACCOUNT_SID",
  );

  const authToken = env(
    "TWILIO_AUTH_TOKEN",
  );

  const fromNumber = env(
    "TWILIO_FROM_NUMBER",
  );

  const publicOrigin = env(
    "NEXT_PUBLIC_APP_URL",
  );

  const statusCallbackUrl =
    env("TWILIO_STATUS_CALLBACK_URL") ||
    (publicOrigin
      ? `${publicOrigin.replace(
          /\/$/,
          "",
        )}/api/crm/sms/status`
      : "");

  return {
    configured: Boolean(
      accountSid &&
        authToken &&
        fromNumber,
    ),
    accountSid,
    authToken,
    fromNumber,
    statusCallbackUrl,
  };
}

export async function ingestCrmInboundSms(
  params: {
    messageSid: string;
    from: string;
    to: string;
    body: string;
    numMedia?: number;
    raw?: Record<string, string>;
  },
) {
  const messageSid = String(
    params.messageSid || "",
  ).trim();

  const from = String(
    params.from || "",
  ).trim();

  if (!messageSid || !from) {
    throw new Error(
      "Twilio inbound SMS is missing MessageSid or From.",
    );
  }

  return ingestCrmInboundMessage({
    channel: "sms",
    identityType: "phone",
    identityValue: from,
    normalizedIdentity:
      normalizeCrmPhone(from),
    displayIdentity: from,
    senderDisplayName:
      `SMS ${from}`,
    recipientIdentity:
      String(params.to || "").trim() ||
      null,
    providerMessageId:
      messageSid,
    providerThreadId: null,
    subject: `SMS ${from}`,
    bodyText:
      String(
        params.body || "",
      ).trim() ||
      (Number(
        params.numMedia || 0,
      ) > 0
        ? "(media message)"
        : ""),
    metadata: {
      num_media: Number(
        params.numMedia || 0,
      ),
      twilio: params.raw || {},
    },
  });
}

async function isSmsSuppressed(
  supabase: ReturnType<
    typeof createServiceClient
  >,
  phone: string,
) {
  const key = phoneKey(phone);

  if (!key) return false;

  const suppression =
    await supabase
      .from(
        "notification_sms_suppressions",
      )
      .select("phone_key")
      .eq("phone_key", key)
      .maybeSingle();

  if (suppression.error) {
    throw new Error(
      suppression.error.message,
    );
  }

  return Boolean(
    suppression.data,
  );
}

export async function sendCrmSmsReply(
  params: {
    conversationId: string;
    body: string;
    attachments?: CrmAttachmentWithUrl[];
  },
) {
  const body = String(
    params.body || "",
  ).trim();

  const attachments =
    params.attachments || [];

  if (
    !body &&
    attachments.length === 0
  ) {
    throw new Error(
      "Reply cannot be empty.",
    );
  }

  const config =
    getCrmSmsConfiguration();

  if (!config.configured) {
    throw new Error(
      "Twilio SMS is not configured.",
    );
  }

  const supabase =
    createServiceClient();

  const conversation =
    await supabase
      .from("crm_conversations")
      .select(
        "id, customer_id, lead_id",
      )
      .eq(
        "id",
        params.conversationId,
      )
      .single();

  if (conversation.error) {
    throw new Error(
      conversation.error.message,
    );
  }

  const lastInbound =
    await supabase
      .from("crm_messages")
      .select("sender_identity")
      .eq(
        "conversation_id",
        params.conversationId,
      )
      .eq("channel", "sms")
      .eq("direction", "inbound")
      .order("sent_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(1)
      .maybeSingle();

  if (lastInbound.error) {
    throw new Error(
      lastInbound.error.message,
    );
  }

  let recipient = String(
    lastInbound.data
      ?.sender_identity || "",
  ).trim();

  if (
    !recipient &&
    conversation.data.customer_id
  ) {
    const customer =
      await supabase
        .from("customers")
        .select("phone")
        .eq(
          "id",
          conversation.data
            .customer_id,
        )
        .single();

    if (customer.error) {
      throw new Error(
        customer.error.message,
      );
    }

    recipient = String(
      customer.data?.phone || "",
    ).trim();
  }

  if (
    !recipient &&
    conversation.data.lead_id
  ) {
    const lead =
      await supabase
        .from("booking_leads")
        .select("customer_phone")
        .eq(
          "id",
          conversation.data.lead_id,
        )
        .single();

    if (lead.error) {
      throw new Error(
        lead.error.message,
      );
    }

    recipient = String(
      lead.data
        ?.customer_phone || "",
    ).trim();
  }

  if (!recipient) {
    throw new Error(
      "No phone number is linked to this conversation.",
    );
  }

  recipient =
    toTwilioPhone(recipient);

  if (
    await isSmsSuppressed(
      supabase,
      recipient,
    )
  ) {
    throw new Error(
      "This phone number has opted out of SMS. Reply cannot be sent until the customer sends START.",
    );
  }

  const requestBody =
    new URLSearchParams();

  requestBody.set(
    "To",
    recipient,
  );

  requestBody.set(
    "From",
    config.fromNumber,
  );

  if (body) {
    requestBody.set(
      "Body",
      body,
    );
  }

  // Twilio accepts repeated MediaUrl values for media messages.
  for (const attachment of attachments) {
    if (
      attachment.type === "image" &&
      attachment.url
    ) {
      requestBody.append(
        "MediaUrl",
        attachment.url,
      );
    }
  }

  if (
    config.statusCallbackUrl
  ) {
    requestBody.set(
      "StatusCallback",
      config.statusCallbackUrl,
    );
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      config.accountSid,
    )}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Basic ${Buffer.from(
            `${config.accountSid}:${config.authToken}`,
          ).toString("base64")}`,
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body:
        requestBody.toString(),
      cache: "no-store",
    },
  );

  const payload =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      String(
        (payload as any)
          ?.message ||
          "Twilio SMS send failed.",
      ),
    );
  }

  const now =
    new Date().toISOString();

  const providerMessageId =
    String(
      (payload as any)?.sid || "",
    ).trim() || null;

  const providerStatus =
    String(
      (payload as any)?.status ||
        "queued",
    )
      .trim()
      .toLowerCase();

  const inserted =
    await supabase
      .from("crm_messages")
      .insert({
        conversation_id:
          params.conversationId,
        direction: "outbound",
        channel: "sms",
        sender_identity:
          config.fromNumber,
        recipient_identity:
          recipient,
        body_text: body,
        provider_message_id:
          providerMessageId,
        provider_thread_id: null,
        status:
          providerStatus ||
          "queued",
        sent_at: now,
        metadata: {
          twilio_account_sid:
            config.accountSid,
          twilio_initial_status:
            providerStatus ||
            "queued",
          media_count:
            attachments.length,
        },
      });

  if (inserted.error) {
    throw new Error(
      inserted.error.message,
    );
  }

  const updated =
    await supabase
      .from("crm_conversations")
      .update({
        status: "open",
        needs_reply: false,
        last_channel: "sms",
        last_message_at: now,
        last_outbound_at: now,
        updated_at: now,
      })
      .eq(
        "id",
        params.conversationId,
      );

  if (updated.error) {
    throw new Error(
      updated.error.message,
    );
  }

  return {
    messageSid:
      providerMessageId,
    status:
      providerStatus ||
      "queued",
  };
}

export async function updateCrmSmsDeliveryStatus(
  params: {
    messageSid: string;
    messageStatus: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
) {
  const sid = String(
    params.messageSid || "",
  ).trim();

  const status = String(
    params.messageStatus || "",
  )
    .trim()
    .toLowerCase();

  if (!sid || !status) {
    return {
      updated: false,
    };
  }

  const supabase =
    createServiceClient();

  const patch: Record<
    string,
    unknown
  > = {
    status,
  };

  if (
    ["delivered", "read"].includes(
      status,
    )
  ) {
    patch.delivered_at =
      new Date().toISOString();
  }

  if (
    ["failed", "undelivered"].includes(
      status,
    )
  ) {
    patch.failed_at =
      new Date().toISOString();
  }

  const result =
    await supabase
      .from("crm_messages")
      .update(patch)
      .eq("channel", "sms")
      .eq(
        "provider_message_id",
        sid,
      )
      .select("id")
      .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }

  if (
    result.data?.id &&
    (params.errorCode ||
      params.errorMessage)
  ) {
    const current =
      await supabase
        .from("crm_messages")
        .select("metadata")
        .eq(
          "id",
          result.data.id,
        )
        .single();

    if (!current.error) {
      const metadata = {
        ...((current.data
          ?.metadata ||
          {}) as Record<
          string,
          unknown
        >),
        twilio_error_code:
          params.errorCode ||
          null,
        twilio_error_message:
          params.errorMessage ||
          null,
      };

      await supabase
        .from("crm_messages")
        .update({ metadata })
        .eq(
          "id",
          result.data.id,
        );
    }
  }

  return {
    updated: Boolean(
      result.data?.id,
    ),
  };
}

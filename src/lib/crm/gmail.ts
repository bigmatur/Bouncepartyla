import "server-only";

import nodemailer from "nodemailer";

import { createServiceClient } from "@/lib/supabase/service";
import { ingestCrmInboundMessage } from "@/lib/communication/inbound";
import { downloadCrmAttachment } from "@/lib/communication/attachments";

import type {
  CrmAttachment,
} from "@/lib/communication/types";

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailPart = {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart & {
    headers?: GmailHeader[];
  };
};

/**
 * Local SMTP types.
 *
 * Nodemailer runtime supports attachments, but the installed Nodemailer
 * type packages can disagree about the generic Transport/MailOptions shape.
 * Keeping a small adapter interface here isolates that third-party typing
 * mismatch without changing the runtime SMTP behavior.
 */
type CrmSmtpAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

type CrmSmtpMailOptions = {
  from: string;
  to: string;
  subject: string;
  text: string;
  attachments?: CrmSmtpAttachment[];
  headers?: Record<string, string>;
};

type CrmSmtpSendResult = {
  messageId?: string;
};

type CrmSmtpTransporter = {
  sendMail(
    options: CrmSmtpMailOptions,
  ): Promise<CrmSmtpSendResult>;
};

function env(name: string) {
  return String(
    process.env[name] || "",
  ).trim();
}

export function getCrmGmailConfiguration() {
  const clientId = env(
    "CRM_GMAIL_CLIENT_ID",
  );

  const clientSecret = env(
    "CRM_GMAIL_CLIENT_SECRET",
  );

  const refreshToken = env(
    "CRM_GMAIL_REFRESH_TOKEN",
  );

  const mailbox =
    env("CRM_GMAIL_USER") ||
    env("SMTP_USER") ||
    env("BOOKING_FROM_EMAIL");

  return {
    configured: Boolean(
      clientId &&
        clientSecret &&
        refreshToken &&
        mailbox,
    ),

    mailbox,
    clientId,
    clientSecret,
    refreshToken,
  };
}

async function getGmailAccessToken() {
  const config =
    getCrmGmailConfiguration();

  if (!config.configured) {
    throw new Error(
      "Gmail CRM OAuth is not configured.",
    );
  }

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",

      headers: {
        "content-type":
          "application/x-www-form-urlencoded",
      },

      body: new URLSearchParams({
        client_id:
          config.clientId,

        client_secret:
          config.clientSecret,

        refresh_token:
          config.refreshToken,

        grant_type:
          "refresh_token",
      }),

      cache: "no-store",
    },
  );

  const payload =
    await response
      .json()
      .catch(() => ({}));

  if (
    !response.ok ||
    !payload?.access_token
  ) {
    throw new Error(
      String(
        payload?.error_description ||
          payload?.error ||
          "Could not refresh Gmail access token.",
      ),
    );
  }

  return String(
    payload.access_token,
  );
}

function header(
  message: GmailMessage,
  name: string,
) {
  const wanted =
    name.toLowerCase();

  return String(
    message.payload?.headers?.find(
      (item) =>
        String(
          item.name || "",
        ).toLowerCase() ===
        wanted,
    )?.value || "",
  ).trim();
}

function decodeBase64Url(
  value?: string,
) {
  if (!value) return "";

  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    normalized.padEnd(
      Math.ceil(
        normalized.length / 4,
      ) * 4,
      "=",
    );

  return Buffer
    .from(
      padded,
      "base64",
    )
    .toString("utf8");
}

function extractPart(
  part: GmailPart | undefined,
  mimeType: string,
): string {
  if (!part) return "";

  if (
    part.mimeType ===
      mimeType &&
    part.body?.data
  ) {
    return decodeBase64Url(
      part.body.data,
    );
  }

  for (
    const child of
    part.parts || []
  ) {
    const value =
      extractPart(
        child,
        mimeType,
      );

    if (value) {
      return value;
    }
  }

  return "";
}

function stripHtml(value: string) {
  return value
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " ",
    )
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " ",
    )
    .replace(
      /<br\s*\/?\s*>/gi,
      "\n",
    )
    .replace(
      /<\/p>/gi,
      "\n",
    )
    .replace(
      /<[^>]+>/g,
      " ",
    )
    .replace(
      /&nbsp;/gi,
      " ",
    )
    .replace(
      /&amp;/gi,
      "&",
    )
    .replace(
      /&lt;/gi,
      "<",
    )
    .replace(
      /&gt;/gi,
      ">",
    )
    .replace(
      /\r/g,
      "",
    )
    .replace(
      /[ \t]+/g,
      " ",
    )
    .replace(
      /\n{3,}/g,
      "\n\n",
    )
    .trim();
}

function emailFromHeader(
  value: string,
) {
  const angle =
    value.match(
      /<([^<>\s]+@[^<>\s]+)>/,
    );

  if (angle?.[1]) {
    return angle[1]
      .trim()
      .toLowerCase();
  }

  const plain =
    value.match(
      /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
    );

  return String(
    plain?.[1] || "",
  )
    .trim()
    .toLowerCase();
}

function displayNameFromHeader(
  value: string,
  email: string,
) {
  const before =
    value
      .split("<")[0]
      ?.trim()
      .replace(
        /^"|"$/g,
        "",
      );

  return (
    before ||
    email.split("@")[0] ||
    "Email contact"
  );
}

function normalizeSubject(
  value: string,
) {
  return value
    .replace(
      /^\s*((re|fw|fwd)\s*:\s*)+/i,
      "",
    )
    .trim()
    .slice(
      0,
      240,
    );
}

function isAutomated(
  message: GmailMessage,
) {
  const autoSubmitted =
    header(
      message,
      "Auto-Submitted",
    ).toLowerCase();

  const precedence =
    header(
      message,
      "Precedence",
    ).toLowerCase();

  return (
    (
      autoSubmitted &&
      autoSubmitted !== "no"
    ) ||
    [
      "bulk",
      "junk",
      "list",
    ].includes(precedence)
  );
}

async function gmailGet<T>(
  path: string,
  token: string,
): Promise<T> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    {
      headers: {
        authorization:
          `Bearer ${token}`,
      },

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
        payload?.error?.message ||
          `Gmail API error ${response.status}`,
      ),
    );
  }

  return payload as T;
}

export async function syncCrmGmailInbox() {
  const config =
    getCrmGmailConfiguration();

  if (!config.configured) {
    throw new Error(
      "Configure CRM Gmail OAuth before syncing the inbox.",
    );
  }

  const supabase =
    createServiceClient();

  const accountKey =
    `gmail:${config.mailbox.toLowerCase()}`;

  try {
    const token =
      await getGmailAccessToken();

    const lookback =
      Math.min(
        90,
        Math.max(
          1,
          Number(
            env(
              "CRM_GMAIL_LOOKBACK_DAYS",
            ) || 14,
          ),
        ),
      );

    const refs: Array<{
      id: string;
      threadId?: string;
    }> = [];

    let pageToken = "";

    for (
      let page = 0;
      page < 5;
      page += 1
    ) {
      const qs =
        new URLSearchParams({
          labelIds: "INBOX",
          maxResults: "100",
          q: `newer_than:${lookback}d`,
        });

      if (pageToken) {
        qs.set(
          "pageToken",
          pageToken,
        );
      }

      const list =
        await gmailGet<{
          messages?: Array<{
            id: string;
            threadId?: string;
          }>;

          nextPageToken?: string;
        }>(
          `messages?${qs.toString()}`,
          token,
        );

      refs.push(
        ...(list.messages || []),
      );

      pageToken = String(
        list.nextPageToken || "",
      );

      if (!pageToken) {
        break;
      }
    }

    const messages:
      GmailMessage[] = [];

    for (
      const ref of refs
    ) {
      const existing =
        await supabase
          .from("crm_messages")
          .select("id")
          .eq(
            "channel",
            "email",
          )
          .eq(
            "provider_message_id",
            ref.id,
          )
          .limit(1)
          .maybeSingle();

      if (existing.error) {
        throw new Error(
          existing.error.message,
        );
      }

      if (
        existing.data?.id
      ) {
        continue;
      }

      messages.push(
        await gmailGet<GmailMessage>(
          `messages/${encodeURIComponent(
            ref.id,
          )}?format=full`,
          token,
        ),
      );
    }

    messages.sort(
      (a, b) =>
        Number(
          a.internalDate || 0,
        ) -
        Number(
          b.internalDate || 0,
        ),
    );

    let imported = 0;
    let skipped = 0;

    for (
      const message of messages
    ) {
      const fromHeader =
        header(
          message,
          "From",
        );

      const senderEmail =
        emailFromHeader(
          fromHeader,
        );

      if (
        !senderEmail ||
        senderEmail ===
          config.mailbox.toLowerCase() ||
        isAutomated(message)
      ) {
        skipped += 1;
        continue;
      }

      const senderName =
        displayNameFromHeader(
          fromHeader,
          senderEmail,
        );

      const subject =
        header(
          message,
          "Subject",
        ) ||
        "(no subject)";

      const bodyHtml =
        extractPart(
          message.payload,
          "text/html",
        );

      const bodyText =
        extractPart(
          message.payload,
          "text/plain",
        ) ||
        stripHtml(
          bodyHtml,
        ) ||
        String(
          message.snippet || "",
        );

      const occurredAt =
        message.internalDate
          ? new Date(
              Number(
                message.internalDate,
              ),
            ).toISOString()
          : new Date()
              .toISOString();

      const ingestion =
        await ingestCrmInboundMessage(
          {
            channel:
              "email",

            identityType:
              "email",

            identityValue:
              senderEmail,

            normalizedIdentity:
              senderEmail,

            displayIdentity:
              senderEmail,

            senderDisplayName:
              senderName,

            recipientIdentity:
              config.mailbox,

            providerMessageId:
              message.id,

            providerThreadId:
              message.threadId ||
              null,

            subject,

            bodyText,

            bodyHtml:
              bodyHtml || null,

            sentAt:
              occurredAt,

            metadata: {
              subject,

              rfc_message_id:
                header(
                  message,
                  "Message-ID",
                ) ||
                null,

              in_reply_to:
                header(
                  message,
                  "In-Reply-To",
                ) ||
                null,

              references:
                header(
                  message,
                  "References",
                ) ||
                null,

              gmail_labels:
                "INBOX",
            },
          },
        );

      if (
        !ingestion.duplicate
      ) {
        imported += 1;
      }
    }

    const result = {
      imported,
      skipped,
      scanned:
        refs.length,
      mailbox:
        config.mailbox,
    };

    await supabase
      .from(
        "crm_email_sync_state",
      )
      .upsert(
        {
          account_key:
            accountKey,

          provider:
            "gmail",

          mailbox_identity:
            config.mailbox,

          last_success_at:
            new Date()
              .toISOString(),

          last_error: null,

          last_result:
            result,

          updated_at:
            new Date()
              .toISOString(),
        },
        {
          onConflict:
            "account_key",
        },
      );

    return result;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await supabase
      .from(
        "crm_email_sync_state",
      )
      .upsert(
        {
          account_key:
            accountKey,

          provider:
            "gmail",

          mailbox_identity:
            config.mailbox,

          last_error_at:
            new Date()
              .toISOString(),

          last_error:
            message.slice(
              0,
              1000,
            ),

          updated_at:
            new Date()
              .toISOString(),
        },
        {
          onConflict:
            "account_key",
        },
      );

    throw error;
  }
}

function smtpTransporter(): CrmSmtpTransporter {
  const host = env(
    "SMTP_HOST",
  );

  const port = Number(
    env(
      "SMTP_PORT",
    ) || 465,
  );

  const secure =
    (
      env(
        "SMTP_SECURE",
      ) || "true"
    ).toLowerCase() ===
    "true";

  const user = env(
    "SMTP_USER",
  );

  const pass = env(
    "SMTP_PASSWORD",
  );

  if (
    !host ||
    !user ||
    !pass
  ) {
    throw new Error(
      "SMTP is not configured.",
    );
  }

  const transporter =
    nodemailer.createTransport({
      host,
      port,
      secure,

      auth: {
        user,
        pass,
      },
    });

  return transporter as unknown as CrmSmtpTransporter;
}

export async function sendCrmEmailReply(
  params: {
    conversationId: string;
    body: string;
    attachments?: CrmAttachment[];
  },
) {
  const conversationId =
    String(
      params.conversationId ||
        "",
    ).trim();

  const body =
    String(
      params.body || "",
    ).trim();

  const attachments =
    params.attachments || [];

  if (!conversationId) {
    throw new Error(
      "Missing conversation id.",
    );
  }

  if (
    !body &&
    attachments.length === 0
  ) {
    throw new Error(
      "Reply cannot be empty.",
    );
  }

  const supabase =
    createServiceClient();

  const conversation =
    await supabase
      .from(
        "crm_conversations",
      )
      .select(
        "id, subject, customer_id, lead_id",
      )
      .eq(
        "id",
        conversationId,
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
      .select(
        "sender_identity, provider_thread_id, metadata",
      )
      .eq(
        "conversation_id",
        conversationId,
      )
      .eq(
        "channel",
        "email",
      )
      .eq(
        "direction",
        "inbound",
      )
      .order(
        "sent_at",
        {
          ascending: false,
          nullsFirst: false,
        },
      )
      .limit(1)
      .maybeSingle();

  if (lastInbound.error) {
    throw new Error(
      lastInbound.error.message,
    );
  }

  let recipient =
    String(
      lastInbound.data
        ?.sender_identity || "",
    )
      .trim()
      .toLowerCase();

  if (
    !recipient &&
    conversation.data
      .customer_id
  ) {
    const customer =
      await supabase
        .from("customers")
        .select("email")
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
      customer.data?.email ||
        "",
    )
      .trim()
      .toLowerCase();
  }

  if (
    !recipient &&
    conversation.data.lead_id
  ) {
    const lead =
      await supabase
        .from(
          "booking_leads",
        )
        .select(
          "customer_email",
        )
        .eq(
          "id",
          conversation.data
            .lead_id,
        )
        .single();

    if (lead.error) {
      throw new Error(
        lead.error.message,
      );
    }

    recipient = String(
      lead.data
        ?.customer_email ||
        "",
    )
      .trim()
      .toLowerCase();
  }

  if (!recipient) {
    throw new Error(
      "No email address is linked to this conversation.",
    );
  }

  const metadata =
    (lastInbound.data
      ?.metadata ||
      {}) as Record<
      string,
      unknown
    >;

  const rfcMessageId =
    String(
      metadata.rfc_message_id ||
        "",
    ).trim();

  const refs =
    String(
      metadata.references ||
        "",
    ).trim();

  const from =
    env(
      "BOOKING_FROM_EMAIL",
    ) ||
    env(
      "FROM_EMAIL",
    ) ||
    env(
      "SMTP_USER",
    );

  if (!from) {
    throw new Error(
      "Outgoing email sender is not configured.",
    );
  }

  const subjectBase =
    normalizeSubject(
      String(
        conversation.data
          .subject || "",
      ),
    ) ||
    "Bounce Party LA";

  const mailAttachments: CrmSmtpAttachment[] =
    await Promise.all(
      attachments.map(
        async (
          attachment,
        ) => {
          const downloaded =
            await downloadCrmAttachment(
              {
                conversationId,
                attachment,
              },
            );

          return {
            filename:
              attachment.name,

            content:
              downloaded.content,

            contentType:
              attachment.mimeType ||
              undefined,
          };
        },
      ),
    );

  const transporter =
    smtpTransporter();

  const mailOptions: CrmSmtpMailOptions = {
    from,

    to:
      recipient,

    subject:
      `Re: ${subjectBase}`,

    text:
      body ||
      "Please see the attached file.",

    attachments:
      mailAttachments,

    headers: {
      ...(rfcMessageId
        ? {
            "In-Reply-To":
              rfcMessageId,
          }
        : {}),

      ...(
        [
          refs,
          rfcMessageId,
        ]
          .filter(
            Boolean,
          )
          .join(" ")
          ? {
              References:
                [
                  refs,
                  rfcMessageId,
                ]
                  .filter(
                    Boolean,
                  )
                  .join(
                    " ",
                  ),
            }
          : {}
      ),
    },
  };

  const info =
    await transporter.sendMail(
      mailOptions,
    );

  const now =
    new Date()
      .toISOString();

  const inserted =
    await supabase
      .from("crm_messages")
      .insert({
        conversation_id:
          conversationId,

        direction:
          "outbound",

        channel:
          "email",

        sender_identity:
          from,

        recipient_identity:
          recipient,

        body_text:
          body,

        provider_message_id:
          info.messageId ||
          null,

        provider_thread_id:
          lastInbound.data
            ?.provider_thread_id ||
          null,

        status:
          "sent",

        sent_at:
          now,

        metadata: {
          subject:
            `Re: ${subjectBase}`,

          in_reply_to:
            rfcMessageId ||
            null,

          native_attachment_count:
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
      .from(
        "crm_conversations",
      )
      .update({
        needs_reply:
          false,

        last_channel:
          "email",

        last_message_at:
          now,

        last_outbound_at:
          now,

        updated_at:
          now,
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
    messageId:
      info.messageId,

    recipient,
  };
}
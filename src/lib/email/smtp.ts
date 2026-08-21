import "server-only";

import nodemailer from "nodemailer";

function env(name: string) {
  return String(process.env[name] || "").trim();
}

export function isSmtpConfigured() {
  return Boolean(env("SMTP_HOST") && env("SMTP_PORT") && env("SMTP_USER") && env("SMTP_PASSWORD"));
}

export async function sendSmtpEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}) {
  if (!isSmtpConfigured()) {
    return { sent: false as const, reason: "smtp_not_configured" as const };
  }

  const port = Number(env("SMTP_PORT") || "465");
  const secure = env("SMTP_SECURE").toLowerCase() !== "false" && port === 465;
  const from = env("BOOKING_FROM_EMAIL") || `Bounce Party LA <${env("SMTP_USER")}>`;

  const transporter = nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port,
    secure,
    auth: {
      user: env("SMTP_USER"),
      pass: env("SMTP_PASSWORD"),
    },
  });

  const info = await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    attachments: params.attachments,
  });

  return { sent: true as const, messageId: info.messageId };
}

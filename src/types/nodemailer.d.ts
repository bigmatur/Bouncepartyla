declare module "nodemailer" {
  type TransportOptions = {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };
  type Attachment = {
    filename: string;
    content: Buffer | string;
    contentType?: string;
  };
  type MailOptions = {
    from: string;
    to: string;
    subject: string;
    html?: string;
    text?: string;
    headers?: Record<string, string>;
    inReplyTo?: string;
    references?: string | string[];
    attachments?: Attachment[];
  };
  type SentMessageInfo = { messageId: string };
  const nodemailer: {
    createTransport(options: TransportOptions): {
      sendMail(options: MailOptions): Promise<SentMessageInfo>;
    };
  };
  export default nodemailer;
}

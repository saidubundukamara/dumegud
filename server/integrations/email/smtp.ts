import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { ExternalServiceError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { EmailMessage, EmailService } from "./EmailService";

// Plain SMTP. Used locally with Mailpit (docker-compose.yml); production sends via Cloudflare.

export type SmtpEmailConfig = {
  /** e.g. smtp://localhost:1025 */
  url: string;
  /** `"Name <address>"` or a bare address. */
  from: string;
  transport?: Pick<Transporter, "sendMail">;
};

// Parsed here rather than handing nodemailer the string: its URL parser uses the deprecated
// `url.parse()`, which Node warns about (DEP0169) once Turbopack bundles nodemailer into app code.
export function smtpOptionsFromUrl(url: string): SMTPTransport.Options {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : undefined,
    secure: parsed.protocol === "smtps:",
    auth: parsed.username
      ? { user: decodeURIComponent(parsed.username), pass: decodeURIComponent(parsed.password) }
      : undefined,
  };
}

export class SmtpEmailService implements EmailService {
  private readonly transport: Pick<Transporter, "sendMail">;

  constructor(private readonly config: SmtpEmailConfig) {
    this.transport = config.transport ?? nodemailer.createTransport(smtpOptionsFromUrl(config.url));
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (err) {
      logger.error("email send failed", { tag: message.tag });
      throw new ExternalServiceError("email", undefined, { cause: err });
    }
  }
}

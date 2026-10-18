import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
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

export class SmtpEmailService implements EmailService {
  private readonly transport: Pick<Transporter, "sendMail">;

  constructor(private readonly config: SmtpEmailConfig) {
    this.transport = config.transport ?? nodemailer.createTransport(config.url);
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

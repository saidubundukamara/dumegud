import "server-only";
import { logger } from "@/server/lib/logger";
import type { EmailMessage, EmailService } from "./EmailService";

/**
 * Used when EMAIL_ENABLED=false. Nothing is sent. Outside production the plain-text body is
 * printed so links (verify email, reset password) can be followed locally; in production only
 * the tag is logged, because bodies carry single-use tokens.
 */
export class ConsoleEmailService implements EmailService {
  constructor(private readonly printBodies: boolean) {}

  async send(message: EmailMessage): Promise<void> {
    logger.info("email not sent (EMAIL_ENABLED=false)", { tag: message.tag, subject: message.subject });
    if (this.printBodies) {
      console.log(`\n── email [${message.tag}] ──\n${message.text}\n──────────────\n`);
    }
  }
}

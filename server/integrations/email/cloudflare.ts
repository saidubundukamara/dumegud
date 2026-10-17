import "server-only";
import { ExternalServiceError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { EmailMessage, EmailService } from "./EmailService";

// Cloudflare Email Sending REST API:
// POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send
// https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
// The sending domain must be onboarded (SPF/DKIM/DMARC) before the first send.

type CloudflareResponse = {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: { delivered?: string[]; permanent_bounces?: string[]; queued?: string[] } | null;
};

export type CloudflareEmailConfig = {
  accountId: string;
  apiToken: string;
  /** `"Name <address>"` or a bare address. */
  from: string;
  fetch?: typeof fetch;
};

export function parseFromAddress(from: string): { address: string; name?: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (!match) return { address: from.trim() };
  const name = match[1].replace(/^"|"$/g, "").trim();
  return name ? { address: match[2].trim(), name } : { address: match[2].trim() };
}

export class CloudflareEmailService implements EmailService {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: CloudflareEmailConfig) {
    this.url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/email/sending/send`;
    this.fetchImpl = config.fetch ?? fetch;
  }

  async send(message: EmailMessage): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: parseFromAddress(this.config.from),
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new ExternalServiceError("email", undefined, { cause: err });
    }

    const body = (await res.json().catch(() => null)) as CloudflareResponse | null;
    if (!res.ok || !body?.success) {
      logger.error("email send failed", { tag: message.tag, status: res.status, errors: body?.errors });
      throw new ExternalServiceError("email");
    }
    if (body.result?.permanent_bounces?.length) {
      logger.warn("email permanently bounced", { tag: message.tag });
    }
  }
}

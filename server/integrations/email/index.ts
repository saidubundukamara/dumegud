import "server-only";
import type { Env } from "@/server/env";
import { CloudflareEmailService } from "./cloudflare";
import { ConsoleEmailService } from "./console";
import type { EmailService } from "./EmailService";

export type { EmailMessage, EmailService } from "./EmailService";

export function createEmailService(env: Env): EmailService {
  if (env.EMAIL_ENABLED && env.EMAIL_PROVIDER === "cloudflare") {
    return new CloudflareEmailService({
      accountId: env.CLOUDFLARE_ACCOUNT_ID!,
      apiToken: env.CLOUDFLARE_EMAIL_API_TOKEN!,
      from: env.EMAIL_FROM,
    });
  }
  return new ConsoleEmailService(env.NODE_ENV !== "production");
}

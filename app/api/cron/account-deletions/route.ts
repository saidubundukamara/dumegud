import { runCronRoute } from "@/server/lib/cron";
import { services } from "@/server/services";

// Daily (vercel.ts): erase accounts whose 30-day deletion grace period has ended.

export function GET(request: Request): Promise<Response> {
  return runCronRoute(request, "account-deletions", async () => {
    const result = await services.accountDeletions.eraseDue({ batch: 25 });
    return {
      processed: result.erased,
      errors: result.failed,
      tags: result.tags,
      detail: { erased: result.erased, blocked: result.blocked, failed: result.failed },
    };
  });
}

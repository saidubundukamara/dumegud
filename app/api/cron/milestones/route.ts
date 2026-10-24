import { runCronRoute } from "@/server/lib/cron";
import { services } from "@/server/services";

// Daily (vercel.ts): one-year anniversaries, milestones a lost webhook skipped, failed emails.

export function GET(request: Request): Promise<Response> {
  return runCronRoute(request, "milestones", (ctx) => services.milestones.sweep(ctx));
}

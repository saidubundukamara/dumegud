import { runCronRoute } from "@/server/lib/cron";
import { services } from "@/server/services";

// Daily (vercel.ts): builds and emails last month's recaps; a no-op once they're all sent.

export function GET(request: Request): Promise<Response> {
  return runCronRoute(request, "recaps", (ctx) => services.recaps.sendMonthlyRecaps(ctx));
}

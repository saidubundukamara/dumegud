import { runCronRoute } from "@/server/lib/cron";
import { services } from "@/server/services";

// Daily (vercel.ts): payout-method cooldowns, expired tokens, files of erased creators.

export function GET(request: Request): Promise<Response> {
  return runCronRoute(request, "cleanup", (ctx) => services.reconciliation.cleanup(ctx));
}

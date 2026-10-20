import { runCronRoute } from "@/server/lib/cron";
import { services } from "@/server/services";

// Every 5 min (cron-job.org on Hobby): settle late fees on the estimate, finish stuck transfers.

export function GET(request: Request): Promise<Response> {
  return runCronRoute(request, "retry-transfers", (ctx) => services.reconciliation.retryTransfers(ctx));
}

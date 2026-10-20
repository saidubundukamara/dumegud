import { runCronRoute } from "@/server/lib/cron";
import { services } from "@/server/services";

// Hourly (cron-job.org on Hobby): compare the ledger with Monime's live balances.

export function GET(request: Request): Promise<Response> {
  return runCronRoute(request, "ledger-drift", (ctx) => services.reconciliation.ledgerDrift(ctx));
}

import { runCronRoute } from "@/server/lib/cron";
import { services } from "@/server/services";

// Every 10 min (cron-job.org on Hobby): re-send or read payouts with no outcome yet.

export function GET(request: Request): Promise<Response> {
  return runCronRoute(request, "reconcile-payouts", (ctx) => services.reconciliation.reconcilePayouts(ctx));
}

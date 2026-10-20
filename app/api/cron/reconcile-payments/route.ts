import { runCronRoute } from "@/server/lib/cron";
import { services } from "@/server/services";

// Every 10 min (cron-job.org on Hobby): settle or close checkouts whose webhook never came.

export function GET(request: Request): Promise<Response> {
  return runCronRoute(request, "reconcile-payments", (ctx) => services.reconciliation.reconcilePayments(ctx));
}

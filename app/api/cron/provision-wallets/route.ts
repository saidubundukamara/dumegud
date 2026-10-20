import { runCronRoute } from "@/server/lib/cron";
import { services } from "@/server/services";

// Every 5 min (cron-job.org on Hobby): retry creator wallets Monime never created.

export function GET(request: Request): Promise<Response> {
  return runCronRoute(request, "provision-wallets", (ctx) => services.reconciliation.provisionWallets(ctx));
}

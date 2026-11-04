import { resolveCheckoutReturn } from "@/lib/checkout-return";
import { getEnv } from "@/server/env";

/**
 * Where Monime sends the payer after checkout (it POSTs, see lib/checkout-return.ts). Answers
 * 303 to the success/cancel page so the browser follows with a GET. Changes nothing: the pages
 * poll the payment status, and only the webhook or a server-side Monime check settles it.
 */
function handle(request: Request): Response {
  const url = new URL(request.url);
  const page = resolveCheckoutReturn(url.searchParams.get("to"), url.searchParams.get("p"));
  const target = new URL(page ?? "/", getEnv().APP_BASE_URL);
  return new Response(null, { status: 303, headers: { Location: target.toString(), "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;

import { cookies } from "next/headers";
import { CLAIM_COOKIE, SUPPORT_CLAIM_COOKIE } from "@/lib/claim-cookie";
import { toHttpResponse } from "@/server/lib/errors";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { getClientIp } from "@/server/lib/request";
import { services } from "@/server/services";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Status for the success pages: `{ status: "processing" | "succeeded" | "failed" }`, plus
 * `libraryUrl` for a purchase when the request carries that purchase's claim cookie, and
 * `canAddShoutout` for support whose browser (claim cookie) may still add a shout-out username. Payment ids are random UUIDs and the route is rate-limited. If webhooks are slow
 * it may ask Monime directly and apply the same idempotent settlement (it never trusts the
 * browser's redirect); that is the one exception to "GET never mutates".
 */
export async function GET(request: Request, { params }: RouteContext<"/api/payments/[id]/status">): Promise<Response> {
  try {
    await enforceRateLimit("payment-status:ip", getClientIp(request.headers));
    const { id } = await params;
    if (!UUID.test(id)) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    const status = await services.settlement.getPublicStatus(id);
    if (!status) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    // The browser that started the checkout (claim cookie) gets its library link / shout-out form.
    const jar = await cookies();
    const libraryUrl = status === "succeeded" ? await services.orders.libraryUrlForClaim(id, jar.get(CLAIM_COOKIE)?.value) : null;
    const supportClaim = jar.get(SUPPORT_CLAIM_COOKIE)?.value;
    const canAddShoutout = status === "succeeded" && supportClaim ? await services.contributions.canAddShoutout(id, supportClaim) : false;
    return Response.json(
      { status, ...(libraryUrl ? { libraryUrl } : {}), ...(canAddShoutout ? { canAddShoutout } : {}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return toHttpResponse(err);
  }
}

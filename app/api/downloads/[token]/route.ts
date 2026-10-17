import { NextResponse } from "next/server";
import { getEnv } from "@/server/env";
import { toHttpResponse } from "@/server/lib/errors";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { getRequestContext } from "@/server/lib/request";
import { services } from "@/server/services";

/**
 * Redeems a 60-second download token: all entitlement checks and the download count happen
 * here, then 302 to a 5-minute presigned R2 URL. Failures go to /library with a friendly message.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/downloads/[token]">): Promise<Response> {
  try {
    const ctx = getRequestContext(request.headers);
    await enforceRateLimit("download:ip", ctx.ip);
    const { token } = await params;
    const result = await services.downloads.redeem(token, ctx);
    const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
    const response = result.ok
      ? NextResponse.redirect(result.url, 302)
      : NextResponse.redirect(`${base}/library?download=${result.reason}`, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (err) {
    return toHttpResponse(err);
  }
}

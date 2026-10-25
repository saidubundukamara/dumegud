import { getAdminSession } from "@/server/dal/admin-session";
import { toHttpResponse } from "@/server/lib/errors";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { KYC_DOCS } from "@/server/validation/wallet";

/**
 * KYC document viewer (admin host, kyc.view). Streams the image through the app (session-checked, logged)
 * so identity documents never get a shareable URL. Never cached.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/kyc/[id]/[doc]">): Promise<Response> {
  const session = await getAdminSession();
  if (!session || !can(session.actor, "kyc.view")) return new Response(null, { status: 403 });
  const { id, doc } = await params;
  if (!(KYC_DOCS as readonly string[]).includes(doc) || !/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  try {
    const body = await services.kyc.readDocument(session.actor, id, doc as (typeof KYC_DOCS)[number]);
    return new Response(Buffer.from(body), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store, private", "Content-Disposition": "inline" },
    });
  } catch (err) {
    return toHttpResponse(err);
  }
}

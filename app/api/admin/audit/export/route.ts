import { getSession } from "@/server/dal/session";
import { requireStepUp } from "@/server/dal/step-up";
import { toHttpResponse } from "@/server/lib/errors";
import { services } from "@/server/services";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Super-admin CSV export of the audit log (step-up required; the export is audited). */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session || session.actor.role !== "super_admin") return new Response(null, { status: 403 });
  try {
    await requireStepUp({ userId: session.actor.userId, sessionVersion: session.sessionVersion });
    const sp = new URL(request.url).searchParams;
    const str = (k: string) => sp.get(k)?.trim().slice(0, 100) || undefined;
    const actorId = str("actorId");
    const csv = await services.admin.exportAuditCsv(session.actor, {
      action: str("action"),
      targetType: str("targetType"),
      targetId: str("targetId"),
      actorId: actorId && UUID.test(actorId) ? actorId : undefined,
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dumegud-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return toHttpResponse(err);
  }
}

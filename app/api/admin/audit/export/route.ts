import { getAdminSession, stepUpSubject } from "@/server/dal/admin-session";
import { requireStepUp } from "@/server/dal/step-up";
import { can } from "@/server/services/actor";
import { toHttpResponse } from "@/server/lib/errors";
import { services } from "@/server/services";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** CSV export of the audit log (audit.export + step-up; the export is itself audited). */
export async function GET(request: Request): Promise<Response> {
  const session = await getAdminSession();
  if (!session || !can(session.actor, "audit.export")) return new Response(null, { status: 403 });
  try {
    await requireStepUp(stepUpSubject(session));
    const sp = new URL(request.url).searchParams;
    const str = (k: string) => sp.get(k)?.trim().slice(0, 100) || undefined;
    const actorId = str("actorId");
    const day = (k: string, end = false) => {
      const v = str(k);
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
      const d = new Date(`${v}T00:00:00Z`);
      return Number.isNaN(d.getTime()) ? undefined : new Date(d.getTime() + (end ? 86_400_000 : 0));
    };
    const csv = await services.admin.exportAuditCsv(session.actor, {
      action: str("action"),
      targetType: str("targetType"),
      targetId: str("targetId"),
      actorId: actorId && UUID.test(actorId) ? actorId : undefined,
      from: day("from"),
      to: day("to", true),
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

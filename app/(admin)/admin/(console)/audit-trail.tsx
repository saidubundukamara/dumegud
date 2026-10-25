import { Section } from "@/components/admin/Page";
import { Timeline } from "@/components/admin/Timeline";
import { humanize } from "@/lib/admin-format";
import { services } from "@/server/services";
import { can, type AdminActor } from "@/server/services/actor";

/**
 * What staff (and the system) did to one record, from the audit log. Renders nothing for admins
 * without audit access.
 */
export async function AuditTrail({ actor, targetType, targetId, title = "Staff actions", limit = 20 }: { actor: AdminActor; targetType: string; targetId: string; title?: string; limit?: number }) {
  if (!can(actor, "audit.view")) return null;
  const { rows } = await services.admin.auditLog(actor, { targetType, targetId }, null, limit);
  const names = await services.admin.adminNames(actor, rows.filter((r) => r.actorType === "admin").map((r) => r.actorId));
  const who = (r: (typeof rows)[number]) =>
    r.actorType === "admin" ? (r.actorId && names.get(r.actorId)) || "Former admin" : r.actorType === "user" ? "The creator" : "System";
  return (
    <Section title={title}>
      <Timeline
        empty="Nothing recorded for this yet."
        items={rows.map((r) => ({ id: r.id, at: r.createdAt, title: humanize(r.action), body: `By ${who(r)}`, detail: r.after ?? undefined }))}
      />
    </Section>
  );
}

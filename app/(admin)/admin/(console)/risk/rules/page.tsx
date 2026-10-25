import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge, StatusBadge } from "@/components/admin/Badge";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Field, SelectField } from "@/components/ui/Field";
import { formatDateTime, humanize } from "@/lib/admin-format";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ActionForm } from "@/app/(admin)/admin/action-form";
import { updateRule } from "@/app/(admin)/admin/ops-actions";

export const metadata: Metadata = { title: "Risk rules" };

export default function RiskRulesPage() {
  return (
    <AdminPage title="Risk rules" description="What raises an alert. Rules only flag; none of them restricts anyone. Saving needs an authenticator code.">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Rules />
      </Suspense>
    </AdminPage>
  );
}

/** "maxCount" → "Max count". */
const paramLabel = (name: string) => humanize(name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());

async function Rules() {
  const { actor } = await requirePermission("risk.view");
  const rules = await services.admin.listRules(actor);
  const editable = can(actor, "risk.rules");
  const updatedBy = await services.admin.adminNames(actor, rules.map((r) => r.updatedBy));
  return (
    <div className="flex flex-col gap-4">
      {rules.map((r) => {
        const params = Object.entries((r.params ?? {}) as Record<string, number>);
        return (
          <Section
            key={r.code}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {humanize(r.code)}
                {r.active ? <StatusBadge status={r.severity} label={`${humanize(r.severity)} severity`} /> : <Badge>Off</Badge>}
              </span>
            }
            description={r.description}
          >
            {editable ? (
              <ActionForm action={updateRule} hidden={{ code: r.code, seenAt: r.updatedAt.toISOString() }} label="Save rule">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {params.map(([name, value]) => (
                    <Field key={name} compact name={`param.${name}`} label={paramLabel(name)} defaultValue={String(value)} inputMode="decimal" autoComplete="off" required />
                  ))}
                  <SelectField compact name="severity" label="Severity" defaultValue={r.severity}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </SelectField>
                </div>
                <label className="flex items-center gap-2.5 text-sm">
                  <input type="checkbox" name="active" defaultChecked={r.active} className="size-[1.125rem] accent-primary" />
                  Rule is on
                </label>
              </ActionForm>
            ) : (
              <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {params.map(([name, value]) => (
                  <div key={name} className="flex gap-1.5">
                    <dt className="text-muted">{paramLabel(name)}</dt>
                    <dd className="font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-3 text-xs text-muted">
              <code className="font-mono">{r.code}</code> · last changed {formatDateTime(r.updatedAt)}
              {r.updatedBy ? ` by ${updatedBy.get(r.updatedBy) ?? "a former admin"}` : ""}
            </p>
          </Section>
        );
      })}
    </div>
  );
}

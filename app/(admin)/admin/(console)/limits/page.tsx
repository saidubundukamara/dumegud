import { GaugeIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/admin/Badge";
import { EmptyRows } from "@/components/admin/DataTable";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { humanize } from "@/lib/admin-format";
import { formatSLE, MINOR_PER_MAJOR } from "@/lib/money";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { LimitForm, SCOPE_LABEL } from "./limit-form";

export const metadata: Metadata = { title: "Limits" };

export default function LimitsPage() {
  return (
    <AdminPage title="Limits" description="Caps on how much money moves, checked on every payment and withdrawal. Changes apply to the next payment. Saving needs an authenticator code.">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Limits />
      </Suspense>
    </AdminPage>
  );
}

const WINDOW: Record<string, string> = { single: "per payment", "24h": "per 24 hours", "7d": "per 7 days", "30d": "per 30 days" };
const ACTION: Record<string, { label: string; tone: "danger" | "warning" | "neutral" }> = {
  block: { label: "Refused", tone: "danger" },
  review: { label: "Held for review", tone: "warning" },
  flag: { label: "Alert only", tone: "neutral" },
};

async function Limits() {
  const { actor } = await requirePermission("limits.view");
  const limits = await services.adminConfig.listLimits(actor);
  const editable = can(actor, "limits.manage");
  const major = (minor: number | null) => (minor === null ? "" : (minor / MINOR_PER_MAJOR).toFixed(2));
  return (
    <div className="flex flex-col gap-6">
      <Section flush>
        {limits.length ? (
          <ul className="divide-y divide-border">
            {limits.map((l) => {
              const summary = (
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {SCOPE_LABEL[l.scope] ?? humanize(l.scope)}
                    <Badge tone={ACTION[l.action]?.tone}>{ACTION[l.action]?.label ?? humanize(l.action)}</Badge>
                    {l.active ? null : <Badge>Off</Badge>}
                  </span>
                  <span className="text-[0.8125rem] text-muted">
                    {[l.maxAmountMinor !== null ? `Up to ${formatSLE(l.maxAmountMinor)}` : null, l.maxCount !== null ? `${l.maxCount} payments` : null].filter(Boolean).join(" and ") || "No cap"}{" "}
                    {WINDOW[l.window] ?? l.window}
                    {l.verificationTier ? ` · ${humanize(l.verificationTier)} creators` : ""}
                    {l.riskTier ? ` · ${humanize(l.riskTier)} risk` : ""}
                  </span>
                </span>
              );
              return (
                <li key={l.id} className="px-4 py-3.5 sm:px-5">
                  {editable ? (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                        {summary}
                        <span className="text-sm font-medium text-muted group-open:hidden">Edit</span>
                      </summary>
                      <div className="mt-4 border-t border-border pt-4">
                        <LimitForm
                          initial={{
                            id: l.id,
                            scope: l.scope,
                            window: l.window,
                            verificationTier: l.verificationTier ?? "",
                            riskTier: l.riskTier ?? "",
                            maxAmount: major(l.maxAmountMinor),
                            maxCount: l.maxCount === null ? "" : String(l.maxCount),
                            action: l.action,
                            active: l.active,
                          }}
                        />
                      </div>
                    </details>
                  ) : (
                    summary
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyRows icon={GaugeIcon} title="No limits set">
            Without limits, any amount within the support and price ranges in Settings goes through.
          </EmptyRows>
        )}
      </Section>
      {editable ? (
        <Section title="Add a limit">
          <LimitForm initial={{ id: "", scope: "creator_receipts", window: "24h", verificationTier: "", riskTier: "", maxAmount: "", maxCount: "", action: "review", active: true }} />
        </Section>
      ) : null}
    </div>
  );
}

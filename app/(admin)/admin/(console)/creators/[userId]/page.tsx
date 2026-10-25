import { IdentificationCardIcon, ReceiptIcon, ShieldCheckIcon, WalletIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, StatusBadge } from "@/components/admin/Badge";
import { CopyId } from "@/components/admin/CopyId";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { KeyValue } from "@/components/admin/KeyValue";
import { DetailSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Tabs } from "@/components/admin/Tabs";
import { buttonClasses } from "@/components/ui/button-classes";
import { SelectField } from "@/components/ui/Field";
import { formatDate, formatDateTime, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { formatSLE } from "@/lib/money";
import { isUuid } from "@/lib/uuid";
import { requirePermission } from "@/server/dal/admin-session";
import { riskTier } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { services } from "@/server/services";
import { can, type AdminActor } from "@/server/services/actor";
import { ActionForm, NoteArea, NoteInput } from "@/app/(admin)/admin/action-form";
import { setUserStatus } from "@/app/(admin)/admin/ops-actions";
import { AuditTrail } from "../../audit-trail";
import { orNotFound } from "../../load";
import { moderateContent } from "../../reports/actions";
import { openCase } from "../../risk/actions";
import { setCreatorRiskTier } from "../actions";

export const metadata: Metadata = { title: "Creator" };

const TABS = ["overview", "money", "identity", "risk", "history"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", money: "Payments & withdrawals", identity: "ID checks", risk: "Risk", history: "Staff actions" };

export default function CreatorDetailPage({ params, searchParams }: PageProps<"/admin/creators/[userId]">) {
  return (
    <Suspense
      fallback={
        <AdminPage title="Creator" back={{ href: adminHref("/admin/creators"), label: "Creators" }}>
          <DetailSkeleton />
        </AdminPage>
      }
    >
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Detail = Awaited<ReturnType<typeof services.admin.creatorDetail>>;

async function Detail({ params, searchParams }: PageProps<"/admin/creators/[userId]">) {
  const { actor } = await requirePermission("creators.view");
  const { userId } = await params;
  if (!isUuid(userId)) notFound();
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";
  const [d, deletion] = await Promise.all([orNotFound(services.admin.creatorDetail(actor, userId)), services.accountDeletions.latestForStaff(actor, userId)]);
  const self = adminHref(`/admin/creators/${userId}`);
  const tabs = TABS.filter((t) => (t === "identity" ? can(actor, "kyc.view") : t === "risk" ? can(actor, "risk.view") : t === "history" ? can(actor, "audit.view") : true));

  return (
    <AdminPage
      title={d.profile ? `@${d.profile.handle}` : d.user.name || d.user.email}
      back={{ href: adminHref("/admin/creators"), label: "Creators" }}
      meta={
        <>
          <StatusBadge status={d.user.status} label={`Account ${humanize(d.user.status).toLowerCase()}`} />
          {d.profile ? <StatusBadge status={d.profile.status} label={`Page ${humanize(d.profile.status).toLowerCase()}`} /> : <Badge>No page yet</Badge>}
          {d.restrictions.length ? <Badge tone="danger">{d.restrictions.length === 1 ? "1 restriction" : `${d.restrictions.length} restrictions`}</Badge> : null}
          {deletion && !deletion.canceledAt ? <Badge tone="warning">{deletion.erasedAt ? "Deleted" : "Deletion scheduled"}</Badge> : null}
          <span>{d.user.email}</span>
        </>
      }
      actions={
        d.profile && d.profile.status === "published" ? (
          <a href={`${getEnv().APP_BASE_URL}/${d.profile.handle}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "", "sm")}>
            View page
          </a>
        ) : null
      }
    >
      <Tabs label="Creator sections" items={tabs.map((t) => ({ href: (t === "overview" ? self : `${self}?tab=${t}`) as Route, label: TAB_LABEL[t], active: t === tab }))} />
      {tab === "overview" ? <Overview actor={actor} d={d} deletion={deletion} /> : null}
      {tab === "money" ? <Money actor={actor} d={d} /> : null}
      {tab === "identity" && can(actor, "kyc.view") ? <Identity actor={actor} userId={userId} /> : null}
      {tab === "risk" && can(actor, "risk.view") ? <Risk actor={actor} d={d} /> : null}
      {tab === "history" ? <AuditTrail actor={actor} targetType="user" targetId={userId} title="Staff actions on this account" limit={50} /> : null}
    </AdminPage>
  );
}

type UserStatus = "active" | "restricted" | "suspended" | "closed";

/** The moves from the current status, each with what it does to them (so the confirm says it). */
function statusChoices(current: string, canClose: boolean): { status: UserStatus; label: string; body: string; danger: boolean }[] {
  const all: { status: UserStatus; label: string; body: string; danger: boolean }[] = [
    { status: "active", label: "Reactivate", body: "They can sign in and receive support again. The reason goes in the audit log.", danger: false },
    {
      status: "restricted",
      label: "Restrict",
      body: "They can still sign in, but fans can’t support them until it’s lifted. They’re signed out of every device now.",
      danger: true,
    },
    { status: "suspended", label: "Suspend", body: "They can’t sign in, and fans can’t support them. They’re signed out of every device now.", danger: true },
    {
      status: "closed",
      label: "Close",
      body: "The account is shut for good: no sign-in and no support. They’re signed out of every device now. Use account deletion for a creator who asked to leave.",
      danger: true,
    },
  ];
  return all.filter((c) => c.status !== current && (c.status !== "closed" || canClose));
}

function Overview({ actor, d, deletion }: { actor: AdminActor; d: Detail; deletion: Awaited<ReturnType<typeof services.accountDeletions.latestForStaff>> }) {
  const canStatus = can(actor, "creators.status");
  const who = d.profile ? `@${d.profile.handle}` : "this account";
  const canModerate = can(actor, "reports.resolve") && d.profile;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <Section title="Account">
          <KeyValue
            items={[
              ["Name", d.user.name || <span className="text-muted">Not given</span>],
              ["Email", <span key="e" className="flex flex-wrap items-center gap-2">{d.user.email}{d.user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}</span>],
              ["Joined", formatDateTime(d.user.createdAt)],
              ["User id", <CopyId key="id" value={d.user.id} />],
              [
                "Deletion",
                !deletion
                  ? "Not requested"
                  : deletion.erasedAt
                    ? `Erased ${formatDate(deletion.erasedAt)}`
                    : deletion.canceledAt
                      ? `Requested, then cancelled ${formatDate(deletion.canceledAt)}`
                      : `Scheduled. Erased after ${formatDate(deletion.eraseAfter)}`,
              ],
              deletion?.forfeitedMinor ? ["Balance given up", formatSLE(deletion.forfeitedMinor)] : null,
            ]}
          />
        </Section>
        <Section title="Creator page">
          {d.profile ? (
            <KeyValue
              items={[
                ["Display name", d.profile.displayName],
                ["Status", <StatusBadge key="s" status={d.profile.status} />],
                ["Published", d.profile.publishedAt ? formatDateTime(d.profile.publishedAt) : <span className="text-muted">Never</span>],
                ["Verification", humanize(d.profile.verificationTier)],
                ["Risk tier", <StatusBadge key="r" status={d.profile.riskTier} />],
              ]}
            />
          ) : (
            <p className="text-sm text-muted">They haven’t set up a page yet.</p>
          )}
        </Section>
        <Section title="Wallet and payout number">
          <KeyValue
            items={[
              ["Monime wallet", d.wallet ? <span key="w" className="flex flex-wrap items-center gap-2"><StatusBadge status={d.wallet.status} />{d.wallet.accountId ? <CopyId value={d.wallet.accountId} /> : null}</span> : <span className="text-muted">Not created yet</span>],
              [
                "Payout number",
                d.payoutMethod ? (
                  <span key="p" className="flex flex-col">
                    <span>
                      {humanize(d.payoutMethod.providerId)} ending {d.payoutMethod.last3}
                    </span>
                    <span className="text-muted">
                      {d.payoutMethod.holderName ?? "Holder unknown"} · name {humanize(d.payoutMethod.nameMatch).toLowerCase()}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted">None added</span>
                ),
              ],
              ["ID check", d.kyc ? <span key="k" className="flex flex-wrap items-center gap-2"><StatusBadge status={d.kyc.status} />{d.kyc.status === "approved" ? d.kyc.legalName : null}</span> : <span className="text-muted">Not submitted</span>],
              ["Restrictions", d.restrictions.length ? d.restrictions.map((r) => humanize(r.feature)).join(", ") : "None"],
            ]}
          />
        </Section>
      </div>

      {canStatus || canModerate ? (
        <div className="flex min-w-0 flex-col gap-6">
          {canStatus ? (
            <Section title="Account status" description="Restricting, suspending or closing signs them out everywhere.">
              <div className="flex flex-wrap gap-2">
                {statusChoices(d.user.status, can(actor, "creators.close")).map((choice) => (
                  <ActionForm
                    key={choice.status}
                    action={setUserStatus}
                    hidden={{ userId: d.user.id, status: choice.status }}
                    label={choice.label}
                    variant="secondary"
                    confirm={{
                      title: `${choice.label} ${who}?`,
                      body: choice.body,
                      fields: <NoteInput required />,
                      danger: choice.danger,
                    }}
                  />
                ))}
              </div>
            </Section>
          ) : null}
          {canStatus && d.profile ? (
            <Section title="Risk tier" description="Picks which transaction limits apply to them.">
              <ActionForm action={setCreatorRiskTier} hidden={{ userId: d.user.id, expected: d.profile.riskTier }} label="Change tier">
                <SelectField compact name="tier" label="Tier" defaultValue={d.profile.riskTier}>
                  {riskTier.enumValues.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </SelectField>
                <NoteInput required />
              </ActionForm>
            </Section>
          ) : null}
          {canModerate && d.profile ? (
            <Section title={d.profile.status === "suspended" ? "Page taken down" : "Take the page down"} description={d.profile.status === "suspended" ? "Restoring leaves it unpublished. The creator publishes it again." : "Hides the page and its products from everyone. Supporters can’t give."}>
              <ActionForm
                action={moderateContent}
                hidden={{ targetType: "creator", targetId: d.profile.id, action: d.profile.status === "suspended" ? "restore" : "suspend" }}
                label={d.profile.status === "suspended" ? "Restore page" : "Take page down"}
                variant={d.profile.status === "suspended" ? "secondary" : "danger"}
                confirm={
                  d.profile.status === "suspended"
                    ? { title: "Restore this page?", body: "It comes back as unpublished. Nothing is shown until the creator publishes it." }
                    : { title: `Take @${d.profile.handle} down?`, body: "The page and its products disappear for everyone straight away. Buyers keep their downloads." }
                }
              >
                <NoteInput required />
              </ActionForm>
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Money({ actor, d }: { actor: AdminActor; d: Detail }) {
  const allPayments = can(actor, "transactions.view") ? adminHref(`/admin/transactions?creator=${d.user.id}`) : null;
  const allPayouts = can(actor, "payouts.view") ? adminHref(`/admin/payouts/all?creator=${d.user.id}`) : null;
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Recent checkouts"
        flush
        actions={allPayments ? <Link href={allPayments} className={buttonClasses("ghost", "", "sm")}>See all</Link> : null}
      >
        <DataTable
          caption="Recent checkouts"
          rows={d.payments}
          rowKey={(p) => p.id}
          rowHref={allPayments ? (p) => adminHref(`/admin/transactions/${p.id}`) : undefined}
          columns={[
            { header: "Amount", cell: (p) => formatSLE(p.grossMinor) },
            { header: "Kind", cell: (p) => (p.kind === "order" ? "Product sale" : "Support"), hideBelow: "sm" },
            { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
            { header: "Created", cell: (p) => <span className="whitespace-nowrap text-muted">{formatDateTime(p.createdAt)}</span>, align: "right", hideBelow: "sm" },
          ]}
          empty={<EmptyRows icon={ReceiptIcon} title="No payments yet" />}
        />
      </Section>
      <Section title="Withdrawals" flush actions={allPayouts ? <Link href={allPayouts} className={buttonClasses("ghost", "", "sm")}>See all</Link> : null}>
        <DataTable
          caption="Withdrawals"
          rows={d.payouts}
          rowKey={(p) => p.id}
          rowHref={allPayouts ? (p) => adminHref(`/admin/payouts/${p.id}`) : undefined}
          columns={[
            { header: "Amount", cell: (p) => formatSLE(p.amountMinor) },
            { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
            { header: "Requested", cell: (p) => <span className="whitespace-nowrap text-muted">{formatDateTime(p.requestedAt)}</span>, align: "right", hideBelow: "sm" },
          ]}
          empty={<EmptyRows icon={WalletIcon} title="No withdrawals yet" />}
        />
      </Section>
    </div>
  );
}

async function Identity({ actor, userId }: { actor: AdminActor; userId: string }) {
  const history = await services.kyc.historyForUser(actor, userId);
  return (
    <Section title="ID checks" description="Every submission, newest first." flush>
      <DataTable
        caption="ID checks"
        rows={history}
        rowKey={(k) => k.id}
        rowHref={(k) => adminHref(`/admin/kyc/${k.id}`)}
        columns={[
          { header: "Submitted", cell: (k) => formatDateTime(k.submittedAt) },
          { header: "Name on ID", cell: (k) => k.legalName, hideBelow: "sm" },
          { header: "Status", cell: (k) => <StatusBadge status={k.status} /> },
          { header: "Decided", cell: (k) => <span className="text-muted">{k.reviewedAt ? formatDateTime(k.reviewedAt) : "Waiting"}</span>, align: "right", hideBelow: "md" },
        ]}
        empty={<EmptyRows icon={IdentificationCardIcon} title="No ID submitted" />}
      />
    </Section>
  );
}

async function Risk({ actor, d }: { actor: AdminActor; d: Detail }) {
  const { alerts, cases } = await services.cases.forCreator(actor, d.user.id);
  const activeCase = cases.find((c) => c.status !== "closed");
  return (
    <div className="flex flex-col gap-6">
      {activeCase ? (
        <Section title="Open case" description={`Opened ${formatDateTime(activeCase.createdAt)}. Add notes and decide there.`} actions={<Link href={adminHref(`/admin/risk/cases/${activeCase.id}`)} className={buttonClasses("secondary", "", "sm")}>Go to case</Link>}>
          <StatusBadge status={activeCase.status} />
        </Section>
      ) : can(actor, "risk.cases") ? (
        <Section title="Open a case" description="For a concern no rule caught. Alerts can be added to it later from the risk queue.">
          <ActionForm action={openCase} hidden={{ creatorId: d.user.id }} label="Open case">
            <NoteArea label="What you noticed" rows={2} />
          </ActionForm>
        </Section>
      ) : null}
      <Section title="Cases" flush>
        <DataTable
          caption="Cases"
          rows={cases}
          rowKey={(c) => c.id}
          rowHref={(c) => adminHref(`/admin/risk/cases/${c.id}`)}
          columns={[
            { header: "Opened", cell: (c) => formatDateTime(c.createdAt) },
            { header: "Reasons", cell: (c) => (c.reasonCodes.length ? c.reasonCodes.map(humanize).join(", ") : "Opened by staff"), hideBelow: "sm" },
            { header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
            { header: "Decision", cell: (c) => (c.decision ? humanize(c.decision) : <span className="text-muted">None yet</span>), hideBelow: "md" },
          ]}
          empty={<EmptyRows icon={ShieldCheckIcon} title="No cases" />}
        />
      </Section>
      <Section title="Alerts" description="Signals from the risk rules. They never restrict anyone on their own." flush>
        <DataTable
          caption="Alerts"
          rows={alerts}
          rowKey={(a) => a.id}
          rowHref={(a) => (a.caseId ? adminHref(`/admin/risk/cases/${a.caseId}`) : adminHref(`/admin/risk?creator=${d.user.id}`))}
          columns={[
            { header: "Rule", cell: (a) => humanize(a.ruleCode) },
            { header: "Severity", cell: (a) => <StatusBadge status={a.severity} /> },
            { header: "Status", cell: (a) => <StatusBadge status={a.status} />, hideBelow: "sm" },
            { header: "Raised", cell: (a) => <span className="whitespace-nowrap text-muted">{formatDateTime(a.createdAt)}</span>, align: "right", hideBelow: "sm" },
          ]}
          empty={<EmptyRows icon={ShieldCheckIcon} title="No alerts" />}
        />
      </Section>
    </div>
  );
}

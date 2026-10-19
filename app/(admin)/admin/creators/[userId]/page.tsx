import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";
import { ActionForm, NoteInput } from "../../action-form";
import { setUserRole, setUserStatus } from "../../ops-actions";

export const metadata: Metadata = { title: "Creator", robots: { index: false } };

export default function CreatorDetailPage({ params }: PageProps<"/admin/creators/[userId]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/creators/[userId]">, "params">) {
  const { actor } = await requireRole("staff", "super_admin");
  const { userId } = await params;
  const [d, deletion] = await Promise.all([services.admin.creatorDetail(actor, userId), services.accountDeletions.latestForStaff(actor, userId)]);
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{d.profile ? `@${d.profile.handle}` : d.user.email}</h1>
        <p className="text-muted">
          {d.user.email} · {d.user.role} · account {d.user.status} · joined {d.user.createdAt.toISOString().slice(0, 10)}
        </p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <dt className="text-muted">Page</dt>
        <dd>{d.profile ? `${d.profile.status} · risk ${d.profile.riskTier} · ${d.profile.verificationTier}` : "none"}</dd>
        <dt className="text-muted">Wallet</dt>
        <dd>{d.wallet ? `${d.wallet.status} ${d.wallet.accountId ?? ""}` : "none"}</dd>
        <dt className="text-muted">KYC</dt>
        <dd>{d.kyc ? `${d.kyc.status} (${d.kyc.legalName})` : "not submitted"}</dd>
        <dt className="text-muted">Payout number</dt>
        <dd>{d.payoutMethod ? `${d.payoutMethod.providerId} …${d.payoutMethod.last3} · ${d.payoutMethod.holderName ?? "?"} · ${d.payoutMethod.status} · name ${d.payoutMethod.nameMatch}` : "none"}</dd>
        <dt className="text-muted">Deletion</dt>
        <dd>
          {!deletion
            ? "none"
            : deletion.erasedAt
              ? `erased ${deletion.erasedAt.toISOString().slice(0, 10)}`
              : deletion.canceledAt
                ? `cancelled ${deletion.canceledAt.toISOString().slice(0, 10)}`
                : `scheduled, erases after ${deletion.eraseAfter.toISOString().slice(0, 10)}`}
          {deletion?.forfeitedMinor ? ` · gave up ${formatSLE(deletion.forfeitedMinor)}` : ""}
        </dd>
        <dt className="text-muted">Active restrictions</dt>
        <dd>{d.restrictions.length ? d.restrictions.map((r) => r.feature).join(", ") : "none"}</dd>
      </dl>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-brand border border-border p-4">
          <h2 className="font-bold">Account status</h2>
          <ActionForm action={setUserStatus} hidden={{ userId }} label="Set status">
            <select name="status" aria-label="Status" defaultValue={d.user.status} className="min-h-10 rounded-brand border border-border bg-background px-3">
              <option value="active">Active</option>
              <option value="restricted">Restricted</option>
              <option value="suspended">Suspended</option>
              <option value="closed">Closed</option>
            </select>
            <NoteInput />
          </ActionForm>
        </div>
        {actor.role === "super_admin" ? (
          <div className="flex flex-col gap-2 rounded-brand border border-border p-4">
            <h2 className="font-bold">Role</h2>
            <ActionForm action={setUserRole} hidden={{ userId }} label="Set role">
              <select name="role" aria-label="Role" defaultValue={d.user.role} className="min-h-10 rounded-brand border border-border bg-background px-3">
                <option value="creator">Creator</option>
                <option value="staff">Staff</option>
                <option value="super_admin">Super admin</option>
              </select>
            </ActionForm>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Recent payments</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {d.payments.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/transactions/${p.id}`} className="underline underline-offset-4">
                {p.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {p.kind} · {formatSLE(p.grossMinor)} · {p.status}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Payouts</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {d.payouts.map((p) => (
            <li key={p.id}>
              {p.requestedAt.toISOString().slice(0, 16).replace("T", " ")} · {formatSLE(p.amountMinor)} · {p.status}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

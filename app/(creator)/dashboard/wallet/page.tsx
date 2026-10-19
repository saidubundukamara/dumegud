import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownLeftIcon, ArrowUpRightIcon, CheckCircleIcon, ClockIcon, CoinsIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Checklist } from "@/components/dashboard/Checklist";
import { withdrawReadiness } from "@/components/dashboard/withdraw-readiness";
import { Alert } from "@/components/ui/Alert";
import { StatusChip } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDate } from "@/lib/dates";
import { formatSLE } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { WithdrawForm } from "./forms";

export const metadata: Metadata = { title: "Wallet" };

// Every status carries an icon and a word, never colour alone.
const PAYOUT_STATUS = {
  requested: { label: "Sending", tone: "warning", Icon: ClockIcon },
  in_review: { label: "Being checked", tone: "warning", Icon: ClockIcon },
  processing: { label: "Sending", tone: "warning", Icon: ClockIcon },
  completed: { label: "Sent", tone: "success", Icon: CheckCircleIcon },
  failed: { label: "Failed", tone: "danger", Icon: WarningCircleIcon },
  canceled: { label: "Cancelled", tone: "neutral", Icon: XCircleIcon },
} as const;

const HISTORY_LABELS: Record<string, string> = { transfer: "Money in", payout: "Withdrawal" };

export default function WalletPage({ searchParams }: PageProps<"/dashboard/wallet">) {
  return (
    <>
      <h1 className="text-title">Wallet</h1>
      <Suspense fallback={<Skeleton className="h-44 w-full !rounded-brand-xl" />}>
        <Wallet searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Wallet({ searchParams }: Pick<PageProps<"/dashboard/wallet">, "searchParams">) {
  const { actor } = await verifySession();
  // ?final=1 comes from "Delete account": empty the wallet even below the usual minimum.
  const final = (await searchParams).final === "1";
  const [balance, settings, kyc, method, payouts, history] = await Promise.all([
    services.balances.getBalance(actor.userId),
    services.settings.get(),
    services.kyc.getStatus(actor),
    services.payoutMethods.get(actor),
    services.payouts.listForCreator(actor),
    services.balances.history(actor.userId),
  ]);
  const readiness = withdrawReadiness(kyc, method);

  return (
    <>
      {/* The balance is the screen's one hero object, in the brand colour with the orange glow. */}
      <section className="relative flex flex-col gap-1 overflow-hidden rounded-brand-xl bg-primary p-6 text-primary-foreground shadow-lift sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-secondary)_60%,transparent),transparent)]"
        />
        <h2 className="relative text-white/80">You can withdraw</h2>
        <p className="relative font-display text-5xl font-bold tracking-tight tabular-nums">{formatSLE(balance.displayMinor)}</p>
        {balance.stale ? <p className="relative text-sm text-white/80">Updating: this may be slightly out of date.</p> : null}
        {balance.pendingMinor > 0 ? (
          <p className="relative mt-2 w-fit rounded-full bg-white/15 px-3 py-1 text-sm">+ {formatSLE(balance.pendingMinor)} on its way</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Withdraw</h2>
        {settings.payoutsKillSwitch ? <Alert tone="warning">Withdrawals are paused right now. Your money is safe.</Alert> : null}
        {readiness.ready ? (
          <>
            <p className="text-muted">
              To your {method!.providerLabel} {method!.masked}.{" "}
              <Link href="/dashboard/payout-method" className="font-semibold text-text underline underline-offset-4">
                Change number
              </Link>
            </p>
            <WithdrawForm
              maxMinor={balance.maxWithdrawableMinor}
              minMinor={settings.minPayoutMinor}
              feeBps={balance.payoutFeeBps}
              final={final}
              to={{ providerLabel: method!.providerLabel, masked: method!.masked, holderName: method!.holderName }}
            />
          </>
        ) : (
          <Panel className="flex flex-col gap-3 p-5 sm:p-6">
            <p className="font-semibold">Three steps before your first withdrawal</p>
            <Checklist items={readiness.items} label="Ready to withdraw" />
          </Panel>
        )}
      </section>

      {payouts.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Withdrawals</h2>
          <Panel as="ul" className="divide-y divide-border">
            {payouts.map((p) => {
              const st = PAYOUT_STATUS[p.status];
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
                  <span className="flex flex-col">
                    <span className="font-semibold tabular-nums">{formatSLE(p.amountMinor)}</span>
                    <span className="text-sm text-muted">{formatDate(p.requestedAt)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <StatusChip tone={st.tone}>
                      <st.Icon aria-hidden="true" weight="fill" className="size-4" />
                      {st.label}
                    </StatusChip>
                    {p.status === "failed" && p.failureMessage ? <span className="text-sm text-muted">{p.failureMessage}</span> : null}
                  </span>
                </li>
              );
            })}
          </Panel>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">History</h2>
        {history.length ? (
          <Panel as="ul" className="divide-y divide-border">
            {history.map((h, i) => {
              const incoming = h.amountMinor >= 0;
              const Icon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full ${incoming ? "bg-success-surface text-success" : "bg-surface-muted text-muted"}`}
                  >
                    <Icon weight="bold" className="size-4" />
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="font-semibold">{HISTORY_LABELS[h.kind] ?? h.kind}</span>
                    <span className="text-sm text-muted">{formatDate(h.at)}</span>
                  </span>
                  <span className={`font-semibold tabular-nums ${incoming ? "text-success" : ""}`}>
                    {incoming ? "+" : "−"}
                    {formatSLE(Math.abs(h.amountMinor))}
                  </span>
                </li>
              );
            })}
          </Panel>
        ) : (
          <EmptyState icon={CoinsIcon} title="No money yet">
            Gifts from your fans and your sales appear here once they go through.
          </EmptyState>
        )}
      </section>
    </>
  );
}

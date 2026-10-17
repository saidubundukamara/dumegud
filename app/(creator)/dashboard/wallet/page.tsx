import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownLeftIcon, ArrowUpRightIcon, CheckCircleIcon, ClockIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { CountUp } from "@/components/motion/CountUp";
import { Alert } from "@/components/ui/Alert";
import { StatusChip } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
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

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const HISTORY_LABELS: Record<string, string> = { transfer: "Money in", payout: "Withdrawal" };

export default function WalletPage() {
  return (
    <>
      <h1 className="text-title">Wallet</h1>
      <Suspense fallback={<Skeleton className="h-44 w-full !rounded-brand-xl" />}>
        <Wallet />
      </Suspense>
    </>
  );
}

async function Wallet() {
  const { actor } = await verifySession();
  const [balance, settings, kyc, method, payouts, history] = await Promise.all([
    services.balances.getBalance(actor.userId),
    services.settings.get(),
    services.kyc.getStatus(actor),
    services.payoutMethods.get(actor),
    services.payouts.listForCreator(actor),
    services.balances.history(actor.userId),
  ]);

  const blocker =
    kyc.status !== "approved" ? (
      <>
        <Link href="/dashboard/verification" className="font-semibold underline underline-offset-4">
          Verify your ID
        </Link>{" "}
        before you can withdraw.
      </>
    ) : !method ? (
      <>
        <Link href="/dashboard/payout-method" className="font-semibold underline underline-offset-4">
          Add your mobile money number
        </Link>{" "}
        so we know where to send your money.
      </>
    ) : method.status === "cooling_off" ? (
      <>For your safety, withdrawals to {method.masked} open on {method.cooldownUntil?.toISOString().slice(0, 16).replace("T", " ")} UTC.</>
    ) : method.status === "needs_recheck" ? (
      <>Our team is checking your mobile money number. We&apos;ll email you.</>
    ) : null;

  return (
    <>
      <section className="relative flex flex-col gap-1 overflow-hidden rounded-brand-xl bg-accent p-6 text-white shadow-lift sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgb(206_32_42/0.55),transparent)]"
        />
        <p className="relative text-white/70">You can withdraw</p>
        <CountUp minor={balance.displayMinor} className="relative font-display text-5xl font-bold tracking-tight" />
        {balance.stale ? <p className="relative text-sm text-white/70">Updating: this may be slightly out of date.</p> : null}
        {balance.pendingMinor > 0 ? (
          <p className="relative mt-2 w-fit rounded-full bg-white/10 px-3 py-1 text-sm">
            + {formatSLE(balance.pendingMinor)} on its way
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Withdraw</h2>
        {settings.payoutsKillSwitch ? <Alert tone="warning">Withdrawals are paused right now.</Alert> : null}
        {blocker ? (
          <Alert tone="info">{blocker}</Alert>
        ) : (
          <>
            <p className="text-muted">
              To your {method!.providerLabel} {method!.masked}.{" "}
              <Link href="/dashboard/payout-method" className="font-semibold text-text underline underline-offset-4">
                Change
              </Link>
            </p>
            <WithdrawForm maxMinor={balance.maxWithdrawableMinor} minMinor={settings.minPayoutMinor} feeBps={balance.payoutFeeBps} />
          </>
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
                      <span className="font-semibold">{formatSLE(p.amountMinor)}</span>
                      <span className="text-sm text-muted">{date(p.requestedAt)}</span>
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

      {history.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">History</h2>
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
                    <span className="text-sm text-muted">{date(h.at)}</span>
                  </span>
                  <span className={`font-semibold ${incoming ? "text-success" : ""}`}>
                    {incoming ? "+" : "−"}
                    {formatSLE(Math.abs(h.amountMinor))}
                  </span>
                </li>
              );
            })}
          </Panel>
        </section>
      ) : null}
    </>
  );
}

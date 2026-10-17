import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { formatSLE } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { WithdrawForm } from "./forms";

export const metadata: Metadata = { title: "Wallet" };

const PAYOUT_LABELS = {
  requested: "Sending",
  in_review: "In review",
  processing: "Sending",
  completed: "Sent",
  failed: "Failed",
  canceled: "Cancelled",
} as const;

const HISTORY_LABELS: Record<string, string> = { transfer: "Earnings received", payout: "Withdrawal" };

export default function WalletPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Wallet</h1>
      <Suspense fallback={<p className="text-muted">Loading your balance…</p>}>
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
          Verify your identity
        </Link>{" "}
        to withdraw.
      </>
    ) : !method ? (
      <>
        <Link href="/dashboard/payout-method" className="font-semibold underline underline-offset-4">
          Add your mobile money number
        </Link>{" "}
        to withdraw.
      </>
    ) : method.status === "cooling_off" ? (
      <>For your safety, withdrawals to {method.masked} open on {method.cooldownUntil?.toISOString().slice(0, 16).replace("T", " ")} UTC.</>
    ) : method.status === "needs_recheck" ? (
      <>Our team is checking your payout number. We&apos;ll email you.</>
    ) : null;

  return (
    <>
      <section className="flex flex-col gap-1 rounded-brand border border-border p-4 sm:p-6">
        <p className="text-muted">Available</p>
        <p className="text-4xl font-bold">{formatSLE(balance.displayMinor)}</p>
        {balance.stale ? <p className="text-sm text-warning">Updating: this may be slightly out of date.</p> : null}
        {balance.pendingMinor > 0 ? <p className="text-sm text-muted">{formatSLE(balance.pendingMinor)} on its way from recent support and sales.</p> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Withdraw</h2>
        {settings.payoutsKillSwitch ? <Alert tone="warning">Withdrawals are paused right now.</Alert> : null}
        {blocker ? (
          <Alert tone="info">{blocker}</Alert>
        ) : (
          <>
            <p className="text-muted">
              To {method!.providerLabel} {method!.masked}.{" "}
              <Link href="/dashboard/payout-method" className="underline underline-offset-4">
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
          <ul className="flex flex-col gap-2">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 rounded-brand border border-border p-3">
                <span>
                  {formatSLE(p.amountMinor)}
                  <span className="text-sm text-muted"> · {p.requestedAt.toISOString().slice(0, 10)}</span>
                </span>
                <span className="text-sm">
                  {PAYOUT_LABELS[p.status]}
                  {p.status === "failed" && p.failureMessage ? `: ${p.failureMessage}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {history.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">History</h2>
          <ul className="flex flex-col gap-1">
            {history.map((h, i) => (
              <li key={i} className="flex justify-between gap-2 text-sm">
                <span>
                  {HISTORY_LABELS[h.kind] ?? h.kind} · {h.at.toISOString().slice(0, 10)}
                </span>
                <span className={h.amountMinor >= 0 ? "text-success" : ""}>
                  {h.amountMinor >= 0 ? "+" : "−"}
                  {formatSLE(Math.abs(h.amountMinor))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

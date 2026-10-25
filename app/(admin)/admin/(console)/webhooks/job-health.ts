import type { JobRun } from "@/server/db/schema";

// How often each cron job should run. A job whose last run is older than twice this is overdue.
export const JOB_INTERVAL_MIN: Record<string, number> = {
  "provision-wallets": 5,
  "retry-transfers": 5,
  "reconcile-payments": 10,
  "reconcile-payouts": 10,
  "ledger-drift": 60,
  cleanup: 24 * 60,
  "account-deletions": 24 * 60,
};

export type JobHealth = { name: string; minutes: number; run: JobRun | undefined; overdue: boolean; failed: boolean };

export function jobHealth(latest: JobRun[], now: Date): JobHealth[] {
  const last = new Map(latest.map((r) => [r.name, r]));
  return Object.entries(JOB_INTERVAL_MIN).map(([name, minutes]) => {
    const run = last.get(name);
    const overdue = !run || now.getTime() - run.startedAt.getTime() > 2 * minutes * 60_000;
    return { name, minutes, run, overdue, failed: run?.status === "failed" };
  });
}

export function everyLabel(minutes: number) {
  if (minutes >= 1440) return "Daily";
  if (minutes >= 60) return `Every ${minutes / 60} h`;
  return `Every ${minutes} min`;
}

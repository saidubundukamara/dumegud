import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/server/dal/session";
import { stepUpSecondsLeft } from "@/server/dal/step-up";
import { isStaff } from "@/server/services/actor";
import { StepUpPanel } from "./step-up-panel";

// Private: never in search results, even if a link to it leaks.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const NAV = [
  ["/admin", "Overview"],
  ["/admin/creators", "Creators"],
  ["/admin/transactions", "Transactions"],
  ["/admin/payouts", "Payouts"],
  ["/admin/kyc", "KYC"],
  ["/admin/products", "Products"],
  ["/admin/reports", "Reports"],
  ["/admin/risk", "Risk"],
  ["/admin/limits", "Limits"],
  ["/admin/settings", "Settings"],
  ["/admin/audit", "Audit"],
  ["/admin/webhooks", "Webhooks"],
] as const;

// Navigation only: every page and action authorises itself (requireRole / requireStaffStepUp).
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/admin" className="text-xl font-bold tracking-tight">
            DuMeGud admin
          </Link>
          <Suspense fallback={null}>
            <StepUpStatus />
          </Suspense>
        </div>
        <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="font-semibold underline-offset-4 hover:underline">
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

async function StepUpStatus() {
  const session = await getSession();
  if (!session || !isStaff(session.actor.role)) return null;
  const seconds = await stepUpSecondsLeft({ userId: session.actor.userId, sessionVersion: session.sessionVersion });
  return <StepUpPanel secondsLeft={seconds} />;
}

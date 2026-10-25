import type { Route } from "next";
import { cookies } from "next/headers";
import { cache, Suspense, type ReactNode } from "react";
import { getAdminSession, stepUpSubject } from "@/server/dal/admin-session";
import { stepUpSecondsLeft } from "@/server/dal/step-up";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { NAV_COOKIE, NAV_ITEMS } from "../nav-config";
import { StepUpChip } from "../step-up-panel";
import { MobileNav, Sidebar } from "./chrome";
import { CommandPalette } from "./command-palette";
import type { AdminActor } from "@/server/services/actor";

// The console shell: sidebar on the left, a top bar with search and step-up over the page.
// Navigation only; every page and action authorises itself (requirePermission and friends).
// The header has no backdrop-filter on purpose: it would become the containing block of the
// fixed-position sheets inside it (step-up, mobile menu).

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1">
      <Suspense fallback={<SidebarPlaceholder />}>
        <SidebarSlot />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background px-4 sm:px-6 lg:px-8">
          <Suspense fallback={null}>
            <TopBarSlot />
          </Suspense>
        </header>
        {children}
      </div>
    </div>
  );
}

// Sidebar and top bar both show counts: one set of queries per request.
const countsFor = cache((actor: AdminActor) => services.admin.queueCounts(actor));

function SidebarPlaceholder() {
  return <div aria-hidden="true" className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-sidebar lg:block" />;
}

async function navData() {
  const session = await getAdminSession();
  if (!session) return null;
  const allowed = NAV_ITEMS.filter((i) => can(session.actor, i.permission)).map((i) => i.href) as Route[];
  const account = { name: session.admin.name, roles: session.roleNames.join(", ") || "No role yet" };
  return { session, allowed, account };
}

async function SidebarSlot() {
  const data = await navData();
  if (!data) return null;
  const [counts, jar] = await Promise.all([countsFor(data.session.actor), cookies()]);
  return <Sidebar allowed={data.allowed} counts={counts} account={data.account} collapsed={jar.get(NAV_COOKIE)?.value === "collapsed"} />;
}

async function TopBarSlot() {
  const data = await navData();
  if (!data) return null;
  const { actor } = data.session;
  const [counts, seconds] = await Promise.all([countsFor(actor), stepUpSecondsLeft(stepUpSubject(data.session))]);
  return (
    <>
      <MobileNav allowed={data.allowed} counts={counts} account={data.account} />
      <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:flex-1">
        <CommandPalette
          allowed={data.allowed}
          canSearchCreators={can(actor, "creators.view")}
          canSeePayments={can(actor, "transactions.view")}
          canSeePayouts={can(actor, "payouts.view")}
        />
        <div className="lg:ml-auto">
          <StepUpChip secondsLeft={seconds} />
        </div>
      </div>
    </>
  );
}

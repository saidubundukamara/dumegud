"use client";

import { CaretDoubleLeftIcon, CaretDoubleRightIcon, ListIcon, MagnifyingGlassIcon, SignOutIcon } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Sheet } from "@/components/motion/Sheet";
import { adminHref } from "@/lib/admin-host";
import { signOutAdmin } from "../auth-actions";
import { activeHref, NAV_COOKIE, NAV_GROUPS, type NavItem, type QueueKey } from "../nav-config";

export type Counts = Partial<Record<QueueKey, number | null>>;
export type Account = { name: string; roles: string };


function useActive() {
  const pathname = usePathname();
  return activeHref(pathname, adminHref);
}

function groupsFor(allowed: Route[]) {
  const set = new Set<string>(allowed);
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => set.has(i.href)) })).filter((g) => g.items.length);
}

function Count({ value, collapsed }: { value: number | null | undefined; collapsed?: boolean }) {
  if (!value) return null;
  const text = value > 99 ? "99+" : String(value);
  if (collapsed) {
    return <span className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] font-semibold leading-4 text-primary-foreground tabular-nums">{text}</span>;
  }
  return <span className="ml-auto rounded-full bg-primary-soft px-1.5 text-xs font-semibold leading-5 text-primary-pressed tabular-nums">{text}</span>;
}

function NavLink({ item, active, count, collapsed, onNavigate }: { item: NavItem; active: boolean; count?: number | null; collapsed?: boolean; onNavigate?: () => void }) {
  const { Icon } = item;
  return (
    <Link
      href={adminHref(item.href)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={`relative flex min-h-9 items-center gap-2.5 rounded-brand-sm text-sm transition-colors duration-150 ${collapsed ? "justify-center px-0" : "px-2.5"} ${
        active ? "bg-surface font-semibold text-text shadow-[0_1px_2px_rgb(26_21_20/0.06)] ring-1 ring-border" : "text-muted hover:bg-text/[0.04] hover:text-text"
      }`}
    >
      <Icon aria-hidden="true" weight={active ? "fill" : "regular"} className={`size-[1.125rem] shrink-0 ${active ? "text-primary" : ""}`} />
      <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
      {count ? <span className="sr-only">, {count} waiting</span> : null}
      <Count value={count} collapsed={collapsed} />
    </Link>
  );
}

function NavGroups({ allowed, counts, collapsed, onNavigate }: { allowed: Route[]; counts: Counts; collapsed?: boolean; onNavigate?: () => void }) {
  const active = useActive();
  return (
    <div className="flex flex-col gap-4">
      {groupsFor(allowed).map((g, i) => (
        <div key={g.label ?? i} className="flex flex-col gap-0.5">
          {g.label ? (
            collapsed ? (
              <span aria-hidden="true" className="mx-auto mb-1 h-px w-5 bg-border-strong" />
            ) : (
              <p className="px-2.5 pb-1 text-xs font-medium text-muted">{g.label}</p>
            )
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={active === item.href} count={item.count ? counts[item.count] : undefined} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
      {letters || "A"}
    </span>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href={adminHref("/admin")} className="flex min-h-9 items-center gap-2 rounded-brand-sm px-1" aria-label="DuMeGud admin, overview">
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-brand-sm bg-primary text-[0.8125rem] font-bold tracking-[-0.04em] text-primary-foreground">
        D
      </span>
      {collapsed ? null : (
        <span className="flex items-baseline gap-1.5">
          <span className="text-[0.9375rem] font-bold tracking-[-0.03em]">DuMeGud</span>
          <span className="text-xs font-medium text-muted">Admin</span>
        </span>
      )}
    </Link>
  );
}

function AccountRow({ account, collapsed }: { account: Account; collapsed?: boolean }) {
  return (
    <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
      <Link
        href={adminHref("/admin/account")}
        title={collapsed ? `${account.name} (your account)` : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-brand-sm p-1.5 transition-colors hover:bg-text/[0.04] ${collapsed ? "justify-center" : ""}`}
      >
        <Initials name={account.name} />
        <span className={collapsed ? "sr-only" : "flex min-w-0 flex-col leading-tight"}>
          <span className="truncate text-sm font-semibold">{account.name}</span>
          <span className="truncate text-xs text-muted">{account.roles}</span>
        </span>
      </Link>
      <form action={signOutAdmin}>
        <button type="submit" title="Sign out" className="flex size-9 items-center justify-center rounded-brand-sm text-muted transition-colors hover:bg-text/[0.04] hover:text-text">
          <SignOutIcon aria-hidden="true" className="size-[1.125rem]" />
          <span className="sr-only">Sign out</span>
        </button>
      </form>
    </div>
  );
}

/** Desktop sidebar. Collapses to an icon rail; the choice is remembered in a cookie. */
export function Sidebar({ allowed, counts, account, collapsed: initial }: { allowed: Route[]; counts: Counts; account: Account; collapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initial);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <aside
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 ease-brand lg:flex ${collapsed ? "w-[4.25rem]" : "w-60"}`}
    >
      <div className={`flex h-14 items-center ${collapsed ? "justify-center px-2" : "px-3"}`}>
        <Brand collapsed={collapsed} />
      </div>
      <nav aria-label="Admin" className={`flex-1 overflow-y-auto pb-4 pt-2 ${collapsed ? "px-2.5" : "px-3"}`}>
        <NavGroups allowed={allowed} counts={counts} collapsed={collapsed} />
      </nav>
      <div className={`flex flex-col gap-1 border-t border-border py-2 ${collapsed ? "px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={collapsed}
          className={`flex min-h-8 items-center gap-2.5 rounded-brand-sm text-[0.8125rem] text-muted transition-colors hover:bg-text/[0.04] hover:text-text ${collapsed ? "justify-center" : "px-2.5"}`}
        >
          {collapsed ? <CaretDoubleRightIcon aria-hidden="true" className="size-4" /> : <CaretDoubleLeftIcon aria-hidden="true" className="size-4" />}
          <span className={collapsed ? "sr-only" : ""}>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
        </button>
        <AccountRow account={account} collapsed={collapsed} />
      </div>
    </aside>
  );
}

/** Below the desktop breakpoint: the menu button and a sheet with the same groups. */
export function MobileNav({ allowed, counts, account }: { allowed: Route[]; counts: Counts; account: Account }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const waiting = Object.values(counts).reduce<number>((n, v) => n + (v ?? 0), 0);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="relative -ml-1 flex size-9 items-center justify-center rounded-brand-sm text-text transition-colors hover:bg-text/[0.05] lg:hidden"
      >
        <ListIcon aria-hidden="true" weight="bold" className="size-5" />
        <span className="sr-only">Menu{waiting ? `, ${waiting} waiting` : ""}</span>
        {waiting ? <span aria-hidden="true" className="absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-background" /> : null}
      </button>
      <span className="lg:hidden">
        <Brand />
      </span>
      <Sheet open={open} onClose={close} title="Menu">
        <nav aria-label="Admin" className="flex flex-col gap-4 px-1 pb-2">
          <NavGroups allowed={allowed} counts={counts} onNavigate={close} />
          <div className="border-t border-border pt-2">
            <AccountRow account={account} />
          </div>
        </nav>
      </Sheet>
    </>
  );
}

/** The top bar's search button (opens the command palette; ⌘K / Ctrl+K anywhere). */
export function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-9 w-9 items-center justify-center gap-2 rounded-brand-sm text-sm text-muted ring-1 ring-border transition-colors hover:text-text hover:ring-border-strong sm:w-72 sm:justify-start sm:bg-surface sm:px-3"
    >
      <MagnifyingGlassIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="hidden sm:inline">Find a creator or page</span>
      <kbd className="ml-auto hidden rounded border border-border bg-surface-muted px-1.5 font-sans text-[0.6875rem] font-medium sm:inline">⌘K</kbd>
      <span className="sr-only sm:hidden">Search</span>
    </button>
  );
}

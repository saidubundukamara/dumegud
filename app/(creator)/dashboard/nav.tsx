"use client";

import {
  BankIcon,
  CaretRightIcon,
  DotsThreeCircleIcon,
  GearSixIcon,
  HouseIcon,
  IdentificationCardIcon,
  MegaphoneIcon,
  PackageIcon,
  ReceiptIcon,
  SignOutIcon,
  UserCircleIcon,
  UsersThreeIcon,
  WalletIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Sheet } from "@/components/motion/Sheet";
import { SubmitButton } from "@/components/ui/Button";
import { signOutAction } from "./actions";

type Item = { href: Route; label: string; Icon: typeof HouseIcon };

const PRIMARY: Item[] = [
  { href: "/dashboard", label: "Home", Icon: HouseIcon },
  { href: "/dashboard/profile", label: "My page", Icon: UserCircleIcon },
  { href: "/dashboard/products", label: "Products", Icon: PackageIcon },
  { href: "/dashboard/wallet", label: "Wallet", Icon: WalletIcon },
];

const MORE: Item[] = [
  { href: "/dashboard/supporters", label: "Supporters", Icon: UsersThreeIcon },
  { href: "/dashboard/shoutouts", label: "Shout-outs", Icon: MegaphoneIcon },
  { href: "/dashboard/orders", label: "Orders", Icon: ReceiptIcon },
  { href: "/dashboard/verification", label: "Verify your ID", Icon: IdentificationCardIcon },
  { href: "/dashboard/payout-method", label: "My mobile money", Icon: BankIcon },
  { href: "/dashboard/settings", label: "Settings", Icon: GearSixIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function SignOut({ className = "" }: { className?: string }) {
  return (
    <form action={signOutAction} className={className}>
      <SubmitButton variant="quiet" pendingLabel="Logging out…" className="w-full !justify-start">
        <SignOutIcon aria-hidden="true" className="size-5" />
        Log out
      </SubmitButton>
    </form>
  );
}

/**
 * Phones: a slim top bar plus an iOS-style bottom tab bar in the thumb zone, with the rest of
 * the menu in a "More" sheet. Desktop: a fixed sidebar with everything.
 */
export function DashboardNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const moreActive = MORE.some((i) => isActive(pathname, i.href));

  return (
    <>
      {/* Phone top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center bg-background/85 px-4 backdrop-blur-xl md:hidden">
        <Wordmark href="/dashboard" />
      </header>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-6 border-r border-border bg-surface/60 px-4 py-6 backdrop-blur-xl md:flex">
        <div className="px-3">
          <Wordmark href="/dashboard" />
        </div>
        <nav aria-label="Dashboard" className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {[...PRIMARY, ...MORE].map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-full px-3 font-semibold transition-colors duration-200 ${
                  active ? "bg-primary-soft text-primary-pressed" : "text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                <Icon aria-hidden="true" weight={active ? "fill" : "regular"} className="size-5" />
                {label}
              </Link>
            );
          })}
        </nav>
        <SignOut />
      </aside>

      {/* Phone tab bar */}
      <nav
        aria-label="Dashboard"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 pb-safe backdrop-blur-xl md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 px-1 pt-1.5">
          {PRIMARY.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold transition-colors ${
                    active ? "text-primary" : "text-muted"
                  }`}
                >
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition-[background-color,transform] duration-300 ease-spring ${active ? "scale-105 bg-primary-soft" : ""}`}
                  >
                    <Icon aria-hidden="true" weight={active ? "fill" : "regular"} className="size-[1.375rem]" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={`flex min-h-12 w-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold ${moreActive ? "text-primary" : "text-muted"}`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full ${moreActive ? "bg-primary-soft" : ""}`}>
                <DotsThreeCircleIcon aria-hidden="true" weight={moreActive ? "fill" : "regular"} className="size-[1.375rem]" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onClose={closeMore} title="More">
        <ul className="flex flex-col">
          {MORE.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={closeMore}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex min-h-14 items-center gap-3 rounded-brand px-2 font-semibold active:bg-surface-muted aria-[current=page]:text-primary"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-surface-muted">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="flex-1">{label}</span>
                <CaretRightIcon aria-hidden="true" className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
        <SignOut className="mt-3 border-t border-border pt-3" />
      </Sheet>
    </>
  );
}

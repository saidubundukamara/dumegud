import {
  ClockCounterClockwiseIcon,
  FlagIcon,
  GaugeIcon,
  GearSixIcon,
  IdentificationCardIcon,
  ListChecksIcon,
  PackageIcon,
  PlugsConnectedIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  ShieldWarningIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  TagIcon,
  UserGearIcon,
  UsersThreeIcon,
  WalletIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import type { AdminPermission } from "@/lib/admin-permissions";

// The admin console's destinations, grouped the way the work is: queues people clear every day,
// money, people, and the system behind it. Server components filter by permission; the sidebar
// and command palette (client) render from the same list.

export type QueueKey = "kyc" | "payouts" | "products" | "reports" | "risk" | "webhooks";

export type NavItem = {
  href: Route;
  label: string;
  Icon: typeof GaugeIcon;
  permission: AdminPermission;
  /** Which live count shows beside it (work waiting). */
  count?: QueueKey;
  /** Extra words the command palette matches. */
  keywords?: string;
};

export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/admin", label: "Overview", Icon: SquaresFourIcon, permission: "overview.view", keywords: "home dashboard stats" }] },
  {
    label: "Queues",
    items: [
      { href: "/admin/kyc", label: "ID checks", Icon: IdentificationCardIcon, permission: "kyc.view", count: "kyc", keywords: "kyc verification identity" },
      { href: "/admin/payouts", label: "Withdrawals to review", Icon: ListChecksIcon, permission: "payouts.view", count: "payouts", keywords: "payouts release approve" },
      { href: "/admin/products", label: "Products", Icon: PackageIcon, permission: "products.view", count: "products", keywords: "review approve suspend" },
      { href: "/admin/reports", label: "Reports", Icon: FlagIcon, permission: "reports.view", count: "reports", keywords: "content moderation takedown" },
      { href: "/admin/risk", label: "Risk", Icon: ShieldWarningIcon, permission: "risk.view", count: "risk", keywords: "alerts cases fraud" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/transactions", label: "Transactions", Icon: ReceiptIcon, permission: "transactions.view", keywords: "payments contributions orders support" },
      { href: "/admin/payouts/all", label: "All withdrawals", Icon: WalletIcon, permission: "payouts.view", keywords: "payouts history" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/creators", label: "Creators", Icon: UsersThreeIcon, permission: "creators.view", keywords: "users accounts search" },
      { href: "/admin/admins", label: "Admins", Icon: UserGearIcon, permission: "admins.manage", keywords: "staff invite team" },
      { href: "/admin/roles", label: "Roles", Icon: ShieldCheckIcon, permission: "roles.manage", keywords: "permissions rbac access" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/limits", label: "Limits", Icon: GaugeIcon, permission: "limits.view", keywords: "transaction caps" },
      { href: "/admin/settings", label: "Settings", Icon: GearSixIcon, permission: "settings.view", keywords: "fees kill switch platform" },
      { href: "/admin/categories", label: "Categories", Icon: TagIcon, permission: "settings.view", keywords: "product page category" },
      { href: "/admin/risk/rules", label: "Risk rules", Icon: SlidersHorizontalIcon, permission: "risk.view", keywords: "thresholds alerts" },
      { href: "/admin/webhooks", label: "Webhooks & jobs", Icon: PlugsConnectedIcon, permission: "webhooks.view", count: "webhooks", keywords: "monime cron replay" },
      { href: "/admin/audit", label: "Audit log", Icon: ClockCounterClockwiseIcon, permission: "audit.view", keywords: "history who changed" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** The item a path belongs to: the longest matching href (so /risk/rules isn't "Risk"). */
export function activeHref(externalPath: string, toExternal: (href: Route) => string): Route | null {
  let best: { href: Route; length: number } | null = null;
  for (const item of NAV_ITEMS) {
    const ext = toExternal(item.href);
    const hit = ext === "/" ? externalPath === "/" : externalPath === ext || externalPath.startsWith(`${ext}/`);
    if (hit && (!best || ext.length > best.length)) best = { href: item.href, length: ext.length };
  }
  return best?.href ?? null;
}

/** Remembers the collapsed sidebar. Lives here, not in the client chrome: a "use client" module's
 * non-component exports are client references on the server, so the layout couldn't read it. */
export const NAV_COOKIE = "dmg_admin_nav";

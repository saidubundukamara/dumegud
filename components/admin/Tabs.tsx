import type { Route } from "next";
import Link from "next/link";
import { TabStrip } from "./TabStrip";

export type TabItem = { href: Route; label: string; count?: number | null; active: boolean };

/**
 * Links styled as tabs (each tab is its own URL, so it can be shared and reloaded). On phones the
 * strip scrolls sideways; the faded right edge says there's more.
 */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <TabStrip label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-border pr-10 no-scrollbar [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] sm:pr-0 sm:[mask-image:none]">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 pb-2.5 pt-1 text-sm font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full ${
            t.active ? "text-text after:bg-primary" : "text-muted hover:text-text after:bg-transparent"
          }`}
        >
          {t.label}
          {typeof t.count === "number" ? (
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${t.active ? "bg-primary-soft text-primary-pressed" : "bg-surface-muted text-muted"}`}>{t.count}</span>
          ) : null}
        </Link>
      ))}
    </TabStrip>
  );
}

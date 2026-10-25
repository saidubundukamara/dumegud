import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * One number with its label. A tile with `href` links to the list behind the number; `attention`
 * marks a queue that has work waiting (a coloured edge plus the words in `hint`).
 */
export function StatTile({ label, value, hint, href, attention = false }: { label: string; value: ReactNode; hint?: ReactNode; href?: Route; attention?: boolean }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-[0.8125rem] text-muted">
        {label}
        {href ? <CaretRightIcon aria-hidden="true" weight="bold" className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" /> : null}
      </span>
      <span className="text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] tabular-nums">{value}</span>
      {hint ? <span className={`text-[0.8125rem] ${attention ? "font-medium text-warning" : "text-muted"}`}>{hint}</span> : null}
    </>
  );
  const cls = `group relative flex min-w-0 flex-col gap-1 rounded-brand bg-surface p-4 ring-1 transition-shadow ${attention ? "ring-warning/40 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-warning" : "ring-border"}`;
  if (!href) return <div className={cls}>{body}</div>;
  return (
    <Link href={href} className={`${cls} hover:ring-border-strong`}>
      {body}
    </Link>
  );
}

import type { Route } from "next";
import Link from "next/link";

type Props = { href?: Route | null; className?: string; tone?: "ink" | "light" };

/**
 * Interim text wordmark. The capitals carry the Du / Me / Gud rhythm; the slight negative tracking
 * keeps it one word (PRD §1A). Replace with the SVG lockup once the logo is approved.
 */
export function Wordmark({ href = "/", className = "", tone = "ink" }: Props) {
  const mark = (
    <span
      className={`font-display text-[1.375rem] font-bold leading-none tracking-[-0.04em] ${tone === "light" ? "text-white" : "text-text"} ${className}`}
    >
      DuMe<span className="text-primary">G</span>ud
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} aria-label="DuMeGud home" className="inline-flex min-h-11 items-center rounded-full">
      {mark}
    </Link>
  );
}

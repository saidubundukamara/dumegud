import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A link to another record when the admin can open it, plain text otherwise. Sits above a
 * DataTable's stretched row link.
 */
export function RecordLink({ href, children, className = "" }: { href: Route | null | false | "" | undefined; children: ReactNode; className?: string }) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <Link href={href} className={`relative z-10 font-medium text-text underline decoration-border-strong underline-offset-[3px] transition-colors hover:decoration-text ${className}`}>
      {children}
    </Link>
  );
}

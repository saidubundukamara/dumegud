import type { InfoIcon } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export type Column<T> = {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Right-align numbers so amounts line up. */
  align?: "right";
  /** Hide on narrow screens (the row link still opens the full record). */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/**
 * A dense, semantic table. With `rowHref` the first cell becomes a link stretched over the whole
 * row, so the row is clickable and still one tab stop; buttons inside cells sit above it.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  caption,
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Where a row opens; null leaves that row unlinked. */
  rowHref?: (row: T) => Route | null | undefined;
  /** For screen readers: what the table lists. */
  caption: string;
  empty: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((c, i) => (
              <th
                key={i}
                scope="col"
                className={`whitespace-nowrap px-4 py-2.5 text-[0.75rem] font-medium text-muted first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5 ${c.align === "right" ? "text-right" : ""} ${c.hideBelow ? HIDE[c.hideBelow] : ""} ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr key={rowKey(row)} className={`relative border-b border-border last:border-b-0 ${href ? "transition-colors hover:bg-row-hover" : ""}`}>
                {columns.map((c, i) => {
                  const content = c.cell(row);
                  return (
                    <td
                      key={i}
                      className={`px-4 py-3 align-middle first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5 ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.hideBelow ? HIDE[c.hideBelow] : ""} ${c.className ?? ""}`}
                    >
                      {i === 0 && href ? (
                        <Link
                          href={href}
                          className="font-medium text-text after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-focus"
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** What an empty list says: what would be here and, when it helps, what to do. */
export function EmptyRows({ icon: Icon, title, children }: { icon: typeof InfoIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span aria-hidden="true" className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-muted text-muted">
        <Icon weight="duotone" className="size-5" />
      </span>
      <p className="font-semibold">{title}</p>
      {children ? <p className="max-w-[46ch] text-sm text-muted">{children}</p> : null}
    </div>
  );
}

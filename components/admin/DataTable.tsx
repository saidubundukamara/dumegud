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
  /**
   * A second, muted line under the cell on narrow screens: what the hidden columns would have
   * said, so phone rows stay tellable apart. Plain text only (it sits under the row link).
   */
  detail?: (row: T) => ReactNode;
  /** The width from which the hidden columns are back and the detail line goes (default md). */
  detailUntil?: "sm" | "md" | "lg";
  className?: string;
};

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;
const ONLY_BELOW = { sm: "sm:hidden", md: "md:hidden", lg: "lg:hidden" } as const;

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
                  const detail = c.detail?.(row);
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
                      {detail ? <div className={`mt-0.5 text-xs text-muted ${ONLY_BELOW[c.detailUntil ?? "md"]}`}>{detail}</div> : null}
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

/**
 * A `detail` line built from parts, each shown only below its breakpoint (the width its column
 * comes back at), separated by dots that never start or end a line.
 */
export function DetailLine({ parts }: { parts: { key: string; content: ReactNode; below?: "sm" | "md" | "lg" }[] }) {
  // Every part carries its own dot; the row is shifted left by one dot's width and clipped, so the
  // dot of whichever part starts a line (the first, or one that wrapped) is cut off.
  return (
    <span className="block overflow-hidden">
      <span className="-ml-3 flex min-w-0 flex-wrap">
        {parts.map((p) => (
          <span key={p.key} className={`min-w-0 truncate before:inline-block before:w-3 before:text-center before:content-['·'] ${p.below ? ONLY_BELOW[p.below] : ""}`}>
            {p.content}
          </span>
        ))}
      </span>
    </span>
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

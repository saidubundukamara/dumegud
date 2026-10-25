import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";

/** `base` plus a query string built from the non-empty params. */
export function withQuery(base: Route, params: Record<string, string | null | undefined>): Route {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return (qs ? `${base}?${qs}` : base) as Route;
}

/**
 * Keyset pages, newest first: "Older" carries the cursor, "Newest" drops it. The filters in
 * `params` stay on both. (The browser's back button returns to newer pages.)
 */
export function Pagination({ base, params, next, shown }: { base: Route; params: Record<string, string | undefined>; next: string | null; shown: number }) {
  const onFirstPage = !params.cursor;
  if (!next && onFirstPage) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm sm:px-5">
      <span className="text-muted">
        {shown} {shown === 1 ? "row" : "rows"} on this page
      </span>
      <div className="flex gap-2">
        {onFirstPage ? null : (
          <Link href={withQuery(base, { ...params, cursor: undefined })} className={buttonClasses("secondary", "", "sm")}>
            Newest
          </Link>
        )}
        {next ? (
          <Link href={withQuery(base, { ...params, cursor: next })} className={buttonClasses("secondary", "", "sm")}>
            Older
            <CaretRightIcon aria-hidden="true" weight="bold" className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

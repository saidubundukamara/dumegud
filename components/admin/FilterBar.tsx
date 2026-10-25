import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button-classes";

/**
 * A GET form of compact filters above a list. Applying resets to the first page (the cursor
 * isn't a field); "Clear" appears once anything is filtered.
 */
export function FilterBar({ action, active, children, label = "Filters" }: { action: Route; active: boolean; children: ReactNode; label?: string }) {
  return (
    <form action={action} role="search" aria-label={label} className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3 sm:px-5">
      {children}
      <div className="flex items-center gap-2">
        <button type="submit" className={buttonClasses("dark", "", "sm")}>
          Apply
        </button>
        {active ? (
          <Link href={action} className={buttonClasses("ghost", "", "sm")}>
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}

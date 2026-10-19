import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardNav, DashboardNavFallback } from "./nav";

// Private: never in search results, even if a link to it leaks.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// No auth gate here: layouts don't re-render on navigation, so each page checks the session
// itself through the DAL.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col md:pl-64">
      {/* usePathname is request data: under cacheComponents it must stream inside Suspense. */}
      <Suspense fallback={<DashboardNavFallback />}>
        <DashboardNav />
      </Suspense>
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pb-32 pt-4 sm:px-6 md:pb-16 md:pt-10">
        {children}
      </main>
    </div>
  );
}

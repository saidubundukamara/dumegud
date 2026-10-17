import { DashboardNav } from "./nav";

// No auth gate here: layouts don't re-render on navigation, so each page checks the session
// itself through the DAL.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col md:pl-64">
      <DashboardNav />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pb-32 pt-4 sm:px-6 md:pb-16 md:pt-10">
        {children}
      </main>
    </div>
  );
}

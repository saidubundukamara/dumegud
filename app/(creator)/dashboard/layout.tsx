import Link from "next/link";
import { SubmitButton } from "@/components/ui/Button";
import { signOutAction } from "./actions";

// No auth gate here: layouts don't re-render on navigation, so each page checks the session
// itself through the DAL.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight">
          DuMeGud
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/dashboard/profile" className="px-3 py-2 font-semibold underline-offset-4 hover:underline">
            Your page
          </Link>
          <Link href="/dashboard/settings" className="px-3 py-2 font-semibold underline-offset-4 hover:underline">
            Settings
          </Link>
          <form action={signOutAction}>
            <SubmitButton variant="ghost" pendingLabel="Signing out…">
              Sign out
            </SubmitButton>
          </form>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { SubmitButton } from "@/components/ui/Button";
import { signOutAction } from "./actions";

// No auth gate here: layouts don't re-render on navigation, so each page checks the session
// itself through the DAL.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight">
          DuMeGud
        </Link>
        <nav className="flex flex-wrap items-center gap-x-1">
          <Link href="/dashboard/profile" className="px-3 py-2 font-semibold underline-offset-4 hover:underline">
            Your page
          </Link>
          <Link href="/dashboard/products" className="px-3 py-2 font-semibold underline-offset-4 hover:underline">
            Products
          </Link>
          <Link href="/dashboard/orders" className="px-3 py-2 font-semibold underline-offset-4 hover:underline">
            Orders
          </Link>
          <Link href="/dashboard/wallet" className="px-3 py-2 font-semibold underline-offset-4 hover:underline">
            Wallet
          </Link>
          <Link href="/dashboard/supporters" className="px-3 py-2 font-semibold underline-offset-4 hover:underline">
            Supporters
          </Link>
          <Link href="/dashboard/shoutouts" className="px-3 py-2 font-semibold underline-offset-4 hover:underline">
            Shout-outs
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

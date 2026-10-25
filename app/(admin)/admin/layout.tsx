import type { Metadata } from "next";

// Served only on the admin subdomain (next.config.ts rewrites admin.<host>/x → /admin/x).
// Private: never in search results, even if a link to it leaks. The console pages share the
// sidebar layout in (console); sign-in, two-step and invite pages use the plain one in (auth).
export const metadata: Metadata = { title: { default: "Admin", template: "%s · DuMeGud admin" }, robots: { index: false, follow: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="flex flex-1 flex-col bg-background text-[0.9375rem] leading-normal">{children}</div>;
}

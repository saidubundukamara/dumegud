import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

const COLUMNS: { title: string; links: { href: Route; label: string }[] }[] = [
  {
    title: "Learn more",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/pricing", label: "Fees" },
      { href: "/faq", label: "Questions" },
    ],
  },
  {
    title: "Your account",
    links: [
      { href: "/register", label: "Create a page" },
      { href: "/login", label: "Log in" },
      { href: "/library", label: "Find my downloads" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/legal/creator-terms", label: "Creator terms" },
      { href: "/report", label: "Report a problem" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto px-4 pb-10 pt-20 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-xs text-muted">Where Sierra Leone&apos;s creators get support from their fans.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-2">
            <h2 className="font-sans text-sm font-medium tracking-normal text-muted">{col.title}</h2>
            <ul className="flex flex-col">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-11 items-center font-medium hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Who stands behind the platform on the left, site meta on the right. */}
      <div className="mx-auto mt-14 flex max-w-6xl flex-col gap-6 border-t border-border pt-8 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <Image src="/images/peektower.png" alt="PeekTower" width={396} height={103} sizes="132px" className="h-auto w-[8.25rem] shrink-0" />
          <p className="max-w-[46ch] text-xs leading-relaxed text-muted">
            DuMeGud is owned and operated by PeekTower Limited, a company registered in Sierra Leone.
          </p>
        </div>
        <div className="shrink-0 text-xs leading-relaxed text-muted sm:text-right">
          <p>&copy; 2026 DuMeGud. All rights reserved.</p>
          <p className="mt-1">Built in Sierra Leone.</p>
        </div>
      </div>
    </footer>
  );
}

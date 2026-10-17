import type { Route } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

const COLUMNS: { title: string; links: { href: Route; label: string }[] }[] = [
  {
    title: "DuMeGud",
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
    <footer className="mt-auto px-4 pb-10 pt-16 sm:px-6">
      <div className="mx-auto grid max-w-5xl gap-10 border-t border-border pt-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-xs text-muted">A simple way for Sierra Leone&apos;s creators to get paid by their fans.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-2">
            <h2 className="font-sans text-sm font-semibold tracking-normal text-muted">{col.title}</h2>
            <ul className="flex flex-col">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-10 items-center font-medium hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto mt-10 max-w-5xl text-sm text-muted">© {2026} DuMeGud</p>
    </footer>
  );
}

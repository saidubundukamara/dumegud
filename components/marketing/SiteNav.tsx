"use client";

import type { Route } from "next";
import Link from "next/link";
import { m } from "motion/react";
import { useCallback, useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { EASE_OUT } from "@/components/motion/easing";
import { Sheet } from "@/components/motion/Sheet";
import { buttonClasses } from "@/components/ui/button-classes";

const LINKS: { href: Route; label: string }[] = [
  { href: "/#how", label: "How it works" },
  { href: "/pricing", label: "Fees" },
  { href: "/faq", label: "Questions" },
];

/** Floating "island" nav. On phones the menu opens as a full-screen sheet with staggered links. */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:pt-5">
        <nav
          aria-label="Main"
          className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 rounded-full bg-surface/80 pl-5 pr-2 shadow-soft ring-1 ring-border backdrop-blur-xl"
        >
          <Wordmark />
          <ul className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="rounded-full px-4 py-2 font-medium text-muted transition-colors duration-200 hover:bg-surface-muted hover:text-text"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1">
            <Link
              href="/login"
              className="hidden rounded-full px-4 py-2 font-medium text-muted transition-colors hover:text-text md:inline-flex"
            >
              Log in
            </Link>
            <Link href="/register" className={buttonClasses("primary", "!min-h-10 !px-4 text-[0.9375rem]")}>
              Start free
            </Link>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className="relative flex size-11 items-center justify-center rounded-full transition-colors hover:bg-surface-muted md:hidden"
            >
              <span aria-hidden="true" className="relative block h-3 w-5">
                <span
                  className={`absolute left-0 block h-[2px] w-5 rounded-full bg-text transition-transform duration-500 ease-brand ${open ? "top-[5px] rotate-45" : "top-0"}`}
                />
                <span
                  className={`absolute left-0 block h-[2px] w-5 rounded-full bg-text transition-transform duration-500 ease-brand ${open ? "top-[5px] -rotate-45" : "top-[10px]"}`}
                />
              </span>
            </button>
          </div>
        </nav>
      </header>

      <Sheet open={open} onClose={close} title="Menu" side="full">
        <ul className="flex flex-col gap-1">
          {[...LINKS, { href: "/login" as Route, label: "Log in" }].map((l, i) => (
            <m.li
              key={l.href}
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.06 + i * 0.06 }}
            >
              <Link
                href={l.href}
                onClick={close}
                className="block py-3 font-display text-[2.5rem] font-bold leading-tight tracking-[-0.03em]"
              >
                {l.label}
              </Link>
            </m.li>
          ))}
        </ul>
        <m.div
          className="mt-auto pt-10"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.35 }}
        >
          <Link href="/register" onClick={close} className={buttonClasses("primary", "w-full", "lg")}>
            Create your free page
          </Link>
        </m.div>
      </Sheet>
    </>
  );
}

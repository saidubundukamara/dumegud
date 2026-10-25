import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame of every admin page: an optional way back, the title with one line of context, the
 * page's actions on the right, then the content. Holds the <main> the skip link jumps to.
 */
export function AdminPage({
  title,
  description,
  actions,
  back,
  meta,
  children,
  width = "wide",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: Route; label: string };
  /** Status badges and small facts shown under the title. */
  meta?: ReactNode;
  children: ReactNode;
  width?: "wide" | "narrow";
}) {
  return (
    <main id="main" tabIndex={-1} className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8 ${width === "wide" ? "max-w-6xl" : "max-w-3xl"}`}>
      <header className="flex flex-col gap-3">
        {back ? (
          <Link href={back.href} className="-ml-1 inline-flex w-fit items-center gap-1 rounded-brand-sm px-1 py-0.5 text-sm font-medium text-muted transition-colors hover:text-text">
            <CaretLeftIcon aria-hidden="true" weight="bold" className="size-3.5" />
            {back.label}
          </Link>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="break-words text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] sm:text-2xl">{title}</h1>
            {description ? <p className="max-w-[70ch] text-[0.9375rem] text-muted">{description}</p> : null}
            {meta ? <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">{meta}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      {children}
    </main>
  );
}

/** A titled block of a page: hairline card, header row with optional actions on the right. */
export function Section({
  title,
  description,
  actions,
  children,
  flush = false,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** No inner padding (tables and lists run edge to edge). */
  flush?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className="min-w-0 overflow-hidden rounded-brand bg-surface ring-1 ring-border">
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{title}</h2> : null}
            {description ? <p className="text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "" : "px-4 py-4 sm:px-5"}>{children}</div>
    </section>
  );
}

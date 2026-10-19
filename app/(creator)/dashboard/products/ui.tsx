import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CaretLeftIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";

export type Step = "details" | "files" | "publish";

const STEPS: { key: Step; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "files", label: "Files" },
  { key: "publish", label: "Publish" },
];

export function BackLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Link href={href} className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 font-semibold text-muted hover:text-text">
      <CaretLeftIcon aria-hidden="true" weight="bold" className="size-4" />
      {children}
    </Link>
  );
}

/**
 * Details → Files → Publish. Finished steps are links (and turn orange); the current step is the
 * brand colour. Before the draft exists (`productId` unset) the later steps can't be opened.
 */
export function Stepper({ current, productId, done = [] }: { current: Step; productId?: string; done?: Step[] }) {
  return (
    <nav aria-label="Product setup">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map(({ key, label }, i) => {
          const isCurrent = key === current;
          const isDone = done.includes(key) && !isCurrent;
          const body = (
            <>
              <span
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-colors duration-500 ease-brand ${
                  isCurrent ? "bg-primary" : isDone ? "bg-secondary" : "bg-surface-muted"
                }`}
              />
              <span className={`flex items-center gap-1.5 text-sm font-semibold ${isCurrent ? "text-text" : "text-muted"}`}>
                <span
                  aria-hidden="true"
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums ${
                    isCurrent ? "bg-primary text-primary-foreground" : isDone ? "bg-secondary text-secondary-foreground" : "ring-1 ring-border-strong"
                  }`}
                >
                  {isDone ? <CheckIcon weight="bold" className="size-3" /> : i + 1}
                </span>
                {label}
                <span className="sr-only">{isCurrent ? " (current step)" : isDone ? " (done)" : ""}</span>
              </span>
            </>
          );
          return (
            <li key={key}>
              {productId && !isCurrent ? (
                <Link
                  href={`/dashboard/products/${productId}/${key}`}
                  className="flex min-h-11 flex-col gap-2 rounded-brand-sm hover:[&>span:last-child]:text-text"
                >
                  {body}
                </Link>
              ) : (
                <span aria-current={isCurrent ? "step" : undefined} className="flex min-h-11 flex-col gap-2">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-title text-balance">{title}</h1>
      {children ? <p className="text-muted">{children}</p> : null}
    </div>
  );
}

export { Checklist, type ChecklistEntry } from "@/components/dashboard/Checklist";

/**
 * The step's actions. On phones it sticks just above the tab bar so Back / Continue stay in the
 * thumb zone however long the step is; from `md` it sits in the flow.
 */
export function WizardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(3.5rem_+_max(0.75rem,env(safe-area-inset-bottom)))] z-10 -mx-4 flex items-center gap-3 bg-gradient-to-t from-background from-70% to-background/0 px-4 pb-3 pt-6 sm:-mx-6 sm:px-6 md:static md:mx-0 md:bg-none md:px-0 md:pb-0 md:pt-2">
      {children}
    </div>
  );
}

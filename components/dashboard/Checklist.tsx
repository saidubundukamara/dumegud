import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CaretRightIcon, CheckIcon, ClockIcon } from "@phosphor-icons/react/dist/ssr";

/** `pending`: the creator has done their part and is waiting on us (e.g. ID being checked). */
export type ChecklistEntry = { key: string; label: string; done: boolean; pending?: boolean; href?: Route; detail?: ReactNode };

/** A setup list: count, progress bar, a mark per step, and a way to fix each open item. */
export function Checklist({ items, label }: { items: ChecklistEntry[]; label: string }) {
  const doneCount = items.filter((i) => i.done).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {doneCount} of {items.length} done
        </span>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={doneCount}
        >
          <div
            className="h-full origin-left rounded-full bg-primary transition-transform duration-300 ease-brand"
            style={{ transform: `scaleX(${items.length ? doneCount / items.length : 0})` }}
          />
        </div>
      </div>
      <ol className="flex flex-col gap-1">
        {items.map((item) => {
          const state = item.done ? "done" : item.pending ? "pending" : "todo";
          const srState = { done: " (done)", pending: " (being checked)", todo: " (to do)" }[state];
          return (
            <li key={item.key} className="flex min-h-11 items-start gap-3 py-1">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
                  state === "done"
                    ? "bg-success text-white"
                    : state === "pending"
                      ? "bg-warning-surface text-warning"
                      : "ring-2 ring-border-strong"
                }`}
              >
                {state === "done" ? <CheckIcon weight="bold" className="size-4" /> : null}
                {state === "pending" ? <ClockIcon weight="bold" className="size-4" /> : null}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {state === "todo" && item.href ? (
                  <Link href={item.href} className="group -my-2 inline-flex min-h-11 items-center justify-between gap-2 font-semibold">
                    <span>
                      {item.label}
                      <span className="sr-only">{srState}</span>
                    </span>
                    <CaretRightIcon aria-hidden="true" weight="bold" className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <span className={state === "done" ? "text-muted" : "font-semibold"}>
                    {item.label}
                    <span className="sr-only">{srState}</span>
                  </span>
                )}
                {item.detail ? <span className="text-sm text-muted">{item.detail}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

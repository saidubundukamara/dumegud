"use client";

import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, LazyMotion, m, useReducedMotion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { EASE_OUT } from "@/components/motion/easing";

// The sliding tab pill is a shared-layout animation, which needs the `domMax` feature set. The app
// only loads `domAnimation`, so this island fetches the rest on demand.
const loadDomMax = () => import("motion/react").then((mod) => mod.domMax);

export type HowStep = { key: string; tab: string; title: string; points: string[]; visual: ReactNode };

/**
 * The three steps as tabs (WAI-ARIA tabs pattern: arrow keys move between them). Each panel pairs
 * the step with the real screen it happens on.
 */
export function HowItWorksTabs({ steps }: { steps: HowStep[] }) {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const step = steps[active];

  function onKey(e: KeyboardEvent) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + steps.length) % steps.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <LazyMotion features={loadDomMax}>
      <div className="flex flex-col items-center gap-10 md:gap-14">
        <div
          role="tablist"
          aria-label="How it works"
          onKeyDown={onKey}
          className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface-muted p-1.5"
        >
          {steps.map((s, i) => (
            <button
              key={s.key}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={i === active}
              aria-controls={`${id}-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              className={`relative min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-[0.9375rem] font-medium transition-colors duration-300 ease-brand sm:px-5 ${
                i === active ? "text-text" : "text-muted hover:text-text"
              }`}
            >
              {i === active ? (
                <m.span
                  layoutId={reduce ? undefined : `${id}-pill`}
                  className="absolute inset-0 rounded-full bg-surface shadow-soft"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              ) : null}
              <span className="relative">{s.tab}</span>
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${active}`}
          className="grid w-full items-center gap-10 rounded-[2rem] bg-surface-muted p-6 sm:p-10 md:grid-cols-2 md:gap-12 md:p-14"
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={step.key}
              className="flex flex-col gap-5"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            >
              <h3 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{step.title}</h3>
              <ul className="flex flex-col gap-3">
                {step.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-[1.0625rem]">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    >
                      <CheckIcon weight="bold" className="size-3.5" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </m.div>
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={step.key}
              className="mx-auto w-full max-w-sm"
              initial={reduce ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              {step.visual}
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </LazyMotion>
  );
}

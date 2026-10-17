"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { EASE_OUT } from "./easing";

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode; side?: "bottom" | "full" };

/**
 * Modal sheet. On phones it rises from the bottom (thumb zone, HIG "sheet"); `full` covers the
 * screen (marketing menu). Esc and the scrim close it; focus moves in on open and back on close.
 */
export function Sheet({ open, onClose, title, children, side = "bottom" }: Props) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  const full = side === "full";

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-40" role="presentation">
          <m.div
            className={`absolute inset-0 ${full ? "bg-background/85 backdrop-blur-2xl" : "bg-accent/40 backdrop-blur-[2px]"}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            onClick={onClose}
          />
          <m.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={
              full
                ? "absolute inset-0 flex flex-col overflow-y-auto px-4 pb-safe pt-24 focus:outline-none"
                : "absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[1.75rem] bg-surface px-4 pb-safe pt-3 shadow-lift focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem] sm:pb-6"
            }
            initial={full ? { opacity: 0 } : { y: "100%" }}
            animate={full ? { opacity: 1 } : { y: 0 }}
            exit={full ? { opacity: 0 } : { y: "100%" }}
            transition={full ? { duration: 0.3, ease: EASE_OUT } : { type: "spring", stiffness: 420, damping: 40 }}
          >
            {full ? null : <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border-strong sm:hidden" />}
            <h2 id={titleId} className={full ? "sr-only" : "mb-2 px-2 text-lg font-bold"}>
              {title}
            </h2>
            {children}
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

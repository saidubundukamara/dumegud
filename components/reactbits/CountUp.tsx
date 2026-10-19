"use client";

// Adapted from React Bits "CountUp" (https://reactbits.dev, MIT). Trimmed to a single count on
// scroll-into-view, with named formats so Server Components can use it and money stays in
// integer minor units.

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatSLE } from "@/lib/money";

const FORMATS = {
  sle: (minor: number) => formatSLE(Math.round(minor)),
  plain: (n: number) => String(Math.round(n)),
};

type Props = {
  to: number;
  from?: number;
  /** Seconds. */
  duration?: number;
  format?: keyof typeof FORMATS;
  className?: string;
};

/**
 * Renders the final value on the server (and without JS). Once hydrated it rewinds to `from` and
 * counts up when scrolled into view. Updates go straight to the text node, not through state.
 */
export function CountUp({ to, from = 0, duration = 1.4, format = "plain", className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const reduce = useReducedMotion();
  const fmt = FORMATS[format];

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || inView) return;
    el.textContent = fmt(from);
  }, [reduce, inView, from, fmt]);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !inView) return;
    const controls = animate(from, to, {
      duration,
      ease: [0.33, 1, 0.68, 1],
      onUpdate: (v) => {
        el.textContent = fmt(v);
      },
    });
    return () => controls.stop();
  }, [inView, reduce, from, to, duration, fmt]);

  return (
    <span ref={ref} className={className}>
      {fmt(to)}
    </span>
  );
}
